import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  FileDown,
  RotateCcw,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDbError, supabase } from '../lib/supabase';
import {
  computeLateDuration,
  formatDateTimeFR,
  formatDZD,
  formatQty,
  isRentalOverdue,
  toInputDate,
  toInputTime,
} from '../lib/formatters';
import { generateReturnReceiptPdf } from '../lib/pdfGenerator';
import type { Rental, ReturnCondition } from '../types/erp';
import { BilingualLabel } from '../components/ui/BilingualLabel';
import { Modal } from '../components/ui/Modal';
import { EmptyState, LoadingState } from '../components/ui/States';

interface ReturnItemDraft {
  rental_item_id: string;
  designation: string;
  unit_name: string;
  qty_rented: number;
  qty_already_returned: number;
  qty_remaining: number;
  qty_returned_now: number;
  qty_missing_now: number;
  condition: ReturnCondition;
  damage_notes: string;
}

export function ReturnsPage() {
  const { rentals, returns, companySettings, dataLoading, refreshAll, notify } = useErp();

  const [selectedRental, setSelectedRental] = useState<Rental | null>(null);
  const [returnDate, setReturnDate] = useState(toInputDate());
  const [returnTime, setReturnTime] = useState(toInputTime());
  const [additionalCharges, setAdditionalCharges] = useState('0');
  const [remarks, setRemarks] = useState('');
  const [itemDrafts, setItemDrafts] = useState<ReturnItemDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const openRentals = useMemo(
    () =>
      rentals.filter((r) =>
        ['en_cours', 'partiellement_retournee', 'en_retard'].includes(r.status)
      ),
    [rentals]
  );

  const openReturnModal = (rental: Rental) => {
    setSelectedRental(rental);
    setReturnDate(toInputDate());
    setReturnTime(toInputTime());
    setAdditionalCharges('0');
    setRemarks('');
    const drafts: ReturnItemDraft[] = (rental.items ?? [])
      .map((it) => {
        const remaining = Math.max(0, Number(it.qty_rented) - Number(it.qty_returned) - Number(it.qty_missing));
        return {
          rental_item_id: it.id,
          designation: it.equipment_designation,
          unit_name: it.unit_name,
          qty_rented: Number(it.qty_rented),
          qty_already_returned: Number(it.qty_returned),
          qty_remaining: remaining,
          qty_returned_now: remaining,
          qty_missing_now: 0,
          condition: 'bon_etat' as ReturnCondition,
          damage_notes: '',
        };
      })
      .filter((d) => d.qty_remaining > 0);
    setItemDrafts(drafts);
  };

  const applySuggestedLateFee = () => {
    if (!selectedRental || !companySettings?.late_fee_enabled) return;
    const late = computeLateDuration(selectedRental.expected_return_at, `${returnDate}T${returnTime}:00`);
    const daysToCharge = Math.max(1, late.days + (late.hours > 0 ? 1 : 0));
    const suggested = daysToCharge * Number(companySettings.late_fee_rate_per_day || 0);
    setAdditionalCharges(String(suggested));
  };

  const handleConfirmReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !selectedRental) return;

    const totalAction = itemDrafts.reduce((s, d) => s + d.qty_returned_now + d.qty_missing_now, 0);
    if (totalAction <= 0) {
      notify('error', 'Veuillez saisir au moins une quantité retournée ou manquante.');
      return;
    }

    for (const d of itemDrafts) {
      if (d.qty_returned_now + d.qty_missing_now > d.qty_remaining) {
        notify('error', `Quantité supérieure au solde restant pour ${d.designation}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const returnedAtIso = new Date(`${returnDate}T${returnTime}:00`).toISOString();
      const { data, error } = await supabase.rpc('process_return_tx', {
        p_rental_id: selectedRental.id,
        p_returned_at: returnedAtIso,
        p_additional_charges: Number(additionalCharges) || 0,
        p_remarks: remarks.trim(),
        p_items: itemDrafts.map((d) => ({
          rental_item_id: d.rental_item_id,
          qty_returned_now: d.qty_returned_now,
          qty_missing_now: d.qty_missing_now,
          condition: d.condition,
          damage_notes: d.damage_notes.trim(),
        })),
      });
      if (error) throw error;
      notify('success', `Retour ${(data as { reference?: string })?.reference ?? ''} enregistré.`);
      setSelectedRental(null);
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (dataLoading && rentals.length === 0) {
    return <LoadingState message="Chargement des retours..." />;
  }

  return (
    <div className="space-y-6">
      {/* Locations en attente de retour */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[#172B4D]">
            Matériel en cours de location (à retourner)
          </h2>
          <p className="font-arabic text-xs text-[#718096]">
            إرجاع المعدات · Retours complets ou partiels
          </p>
        </div>

        {openRentals.length === 0 ? (
          <EmptyState
            title="Aucun retour en attente"
            description="Toutes les locations actives ont été retournées."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-xs font-semibold text-[#718096]">
                  <th className="py-3 px-4">Réf. Location</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Retour prévu</th>
                  <th className="py-3 px-4">Retard détecté</th>
                  <th className="py-3 px-4">Quantités restantes</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {openRentals.map((r) => {
                  const overdue = isRentalOverdue(r);
                  const late = overdue ? computeLateDuration(r.expected_return_at) : null;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-[#172B4D]">
                        {r.reference}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#202B3C]">{r.customer_name}</div>
                        <div className="text-xs text-[#718096]">{r.customer_phone}</div>
                      </td>
                      <td className="py-3 px-4 text-xs tabular-nums text-[#202B3C]">
                        {formatDateTimeFR(r.expected_return_at)}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {overdue && late ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[#E74C3C] tabular-nums">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>
                              {late.days}j {late.hours}h de retard
                            </span>
                          </span>
                        ) : (
                          <span className="text-[#16A085] font-medium">Dans les délais</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {(r.items ?? []).map((it) => {
                          const rem = Math.max(0, it.qty_rented - it.qty_returned - it.qty_missing);
                          if (rem <= 0) return null;
                          return (
                            <div key={it.id} className="tabular-nums">
                              <strong className="text-[#172B4D]">{formatQty(rem)}</strong> / {formatQty(it.qty_rented)} {it.unit_name} — {it.equipment_designation}
                            </div>
                          );
                        })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openReturnModal(r)}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Enregistrer retour</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historique des retours */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-[#172B4D]">Historique des retours</h3>
          <p className="font-arabic text-xs text-[#718096]">سجل عمليات إرجاع المعدات</p>
        </div>
        {returns.length === 0 ? (
          <p className="text-xs text-[#718096] py-6 text-center">Aucun retour enregistré pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-xs font-semibold text-[#718096]">
                  <th className="py-3 px-4">Réf. Retour</th>
                  <th className="py-3 px-4">Date retour</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Articles retournés</th>
                  <th className="py-3 px-4 text-right">Frais appliqués</th>
                  <th className="py-3 px-4 text-right">Bon de retour</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {returns.map((ret) => {
                  const parent = rentals.find((r) => r.id === ret.rental_id);
                  return (
                    <tr key={ret.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-semibold text-[#172B4D]">
                        {ret.reference}
                        {parent && <div className="text-[11px] text-[#718096] font-normal">Loc: {parent.reference}</div>}
                      </td>
                      <td className="py-3 px-4 tabular-nums">{formatDateTimeFR(ret.returned_at)}</td>
                      <td className="py-3 px-4 font-medium text-[#202B3C]">{ret.customer_name}</td>
                      <td className="py-3 px-4">
                        {(ret.items ?? []).map((it) => (
                          <div key={it.id} className="tabular-nums">
                            {formatQty(it.qty_returned_now)}× {it.equipment_designation} ({it.condition.replace(/_/g, ' ')})
                          </div>
                        ))}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold">
                        {formatDZD(ret.additional_charges)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            generateReturnReceiptPdf(ret, parent?.reference ?? '—', companySettings)
                          }
                          className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#172B4D] inline-flex items-center gap-1"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>PDF</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Enregistrement Retour */}
      <Modal
        open={Boolean(selectedRental)}
        onClose={() => setSelectedRental(null)}
        title={selectedRental ? `Retour du matériel — ${selectedRental.reference}` : ''}
        arTitle="إرجاع المعدات من الزبون"
        maxWidthClass="max-w-4xl"
      >
        {selectedRental && (
          <form onSubmit={handleConfirmReturn} className="space-y-4">
            <div className="bg-[#F4F6FA] p-3.5 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                Client : <strong className="text-[#172B4D]">{selectedRental.customer_name}</strong> · Sortie :{' '}
                <strong className="tabular-nums">{formatDateTimeFR(selectedRental.exit_at)}</strong>
              </div>
              <div>
                Retour prévu : <strong className="tabular-nums">{formatDateTimeFR(selectedRental.expected_return_at)}</strong>
              </div>
            </div>

            {isRentalOverdue(selectedRental) && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#E74C3C] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>
                    Location en retard :{' '}
                    {(() => {
                      const l = computeLateDuration(selectedRental.expected_return_at);
                      return `${l.days} jour(s) et ${l.hours} heure(s)`;
                    })()}
                  </span>
                </div>
                {companySettings?.late_fee_enabled && (
                  <button
                    type="button"
                    onClick={applySuggestedLateFee}
                    className="px-2.5 py-1 rounded bg-white border border-red-300 text-[#E74C3C] font-semibold"
                  >
                    Appliquer pénalité ({formatDZD(companySettings.late_fee_rate_per_day)}/j)
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <BilingualLabel fr="Date et heure de retour réel" ar="تاريخ الإرجاع الفعلي" required />
                <div className="mt-1 flex gap-2">
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    required
                    className="flex-1 min-h-[40px] px-2.5 rounded-lg border border-slate-300 text-xs"
                  />
                  <input
                    type="time"
                    value={returnTime}
                    onChange={(e) => setReturnTime(e.target.value)}
                    required
                    className="w-24 min-h-[40px] px-2 rounded-lg border border-slate-300 text-xs"
                  />
                </div>
              </div>
              <div>
                <BilingualLabel fr="Frais supplémentaires confirmés (DZD)" ar="مصاريف إضافية أو تأخير" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={additionalCharges}
                  onChange={(e) => setAdditionalCharges(e.target.value)}
                  className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
                />
              </div>
              <div>
                <BilingualLabel fr="Observations générales" ar="ملاحظات الإرجاع" />
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              {itemDrafts.map((d, idx) => (
                <div key={d.rental_item_id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="font-semibold text-[#172B4D]">{d.designation}</div>
                    <div className="text-[#718096] tabular-nums">
                      Loué: {formatQty(d.qty_rented)} · Déjà retourné: {formatQty(d.qty_already_returned)} ·{' '}
                      <strong className="text-[#FF8A24]">Reste: {formatQty(d.qty_remaining)} {d.unit_name}</strong>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="text-[11px] text-[#718096]">Qté retournée maintenant</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max={d.qty_remaining}
                        value={d.qty_returned_now}
                        onChange={(e) => {
                          const next = [...itemDrafts];
                          next[idx].qty_returned_now = Math.max(0, Number(e.target.value) || 0);
                          setItemDrafts(next);
                        }}
                        className="mt-1 w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#718096]">Qté manquante / perdue</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max={d.qty_remaining}
                        value={d.qty_missing_now}
                        onChange={(e) => {
                          const next = [...itemDrafts];
                          next[idx].qty_missing_now = Math.max(0, Number(e.target.value) || 0);
                          setItemDrafts(next);
                        }}
                        className="mt-1 w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#718096]">État au retour</label>
                      <select
                        value={d.condition}
                        onChange={(e) => {
                          const next = [...itemDrafts];
                          next[idx].condition = e.target.value as ReturnCondition;
                          setItemDrafts(next);
                        }}
                        className="mt-1 w-full min-h-[38px] px-2 rounded-lg border border-slate-300 text-xs bg-white"
                      >
                        <option value="bon_etat">Bon état (retour stock dispo)</option>
                        <option value="necessite_maintenance">Nécessite maintenance</option>
                        <option value="endommage">Endommagé</option>
                        <option value="incomplet">Incomplet</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#718096]">Notes dommage / remarque</label>
                      <input
                        type="text"
                        value={d.damage_notes}
                        onChange={(e) => {
                          const next = [...itemDrafts];
                          next[idx].damage_notes = e.target.value;
                          setItemDrafts(next);
                        }}
                        className="mt-1 w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedRental(null)}
                className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 text-sm"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[42px] px-5 py-2 rounded-lg bg-[#16A085] hover:bg-[#128770] text-white text-sm font-semibold disabled:opacity-60"
              >
                {submitting ? 'Enregistrement...' : 'Valider le retour'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
