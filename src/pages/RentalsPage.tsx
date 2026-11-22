import React, { useEffect, useMemo, useState } from 'react';
import {
  FileDown,
  Layers,
  Plus,
  Printer,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDbError, supabase } from '../lib/supabase';
import {
  formatDateTimeFR,
  formatDA,
  formatQty,
  isRentalOverdue,
  toInputDate,
  toInputTime,
} from '../lib/formatters';
import { generateRentalExitPdf } from '../lib/pdfGenerator';
import type { PricingType, Rental } from '../types/erp';
import {
  PrintableDocumentModal,
  type PrintableDocPayload,
} from '../components/PrintableDocumentModal';
import { BilingualLabel } from '../components/ui/BilingualLabel';
import { Modal } from '../components/ui/Modal';
import { EmptyState, LoadingState, StatusText } from '../components/ui/States';

interface DraftRentalLine {
  equipment_id: string;
  equipment_unit_id: string;
  qty: number;
  pricing_type: PricingType;
  duration_value: number;
  unit_price: number;
}

export function RentalsPage({
  autoOpenNew = false,
  onClearAutoOpen,
}: {
  autoOpenNew?: boolean;
  onClearAutoOpen?: () => void;
}) {
  const {
    rentals,
    customers,
    equipment,
    equipmentUnits,
    scaffoldingPackages,
    companySettings,
    dataLoading,
    refreshAll,
    notify,
  } = useErp();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCustomer, setFilterCustomer] = useState('all');
  const [onlyUnpaid, setOnlyUnpaid] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailRental, setDetailRental] = useState<Rental | null>(null);
  const [printDoc, setPrintDoc] = useState<PrintableDocPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Draft form state
  const [customerId, setCustomerId] = useState('');
  const [exitDate, setExitDate] = useState(toInputDate());
  const [exitTime, setExitTime] = useState(toInputTime());
  const [returnDate, setReturnDate] = useState(toInputDate(new Date(Date.now() + 86400000)));
  const [returnTime, setReturnTime] = useState('17:00');
  const [conditionAtExit, setConditionAtExit] = useState('Bon état');
  const [additionalFees, setAdditionalFees] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [depositAmount, setDepositAmount] = useState('0');
  const [amountPaid, setAmountPaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Espèces');
  const [statusChoice, setStatusChoice] = useState<'en_cours' | 'en_preparation'>('en_cours');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftRentalLine[]>([]);

  const rentableEquipment = useMemo(
    () =>
      equipment.filter(
        (e) => !e.is_archived && e.activity_type !== 'vente' && Number(e.qty_rental_available) > 0
      ),
    [equipment]
  );

  const activeCustomers = useMemo(() => customers.filter((c) => !c.is_archived), [customers]);

  useEffect(() => {
    if (autoOpenNew) {
      openNewModal();
      onClearAutoOpen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenNew]);

  const openNewModal = () => {
    setCustomerId(activeCustomers[0]?.id ?? '');
    setExitDate(toInputDate());
    setExitTime(toInputTime());
    setReturnDate(toInputDate(new Date(Date.now() + 86400000)));
    setReturnTime('17:00');
    setConditionAtExit('Bon état');
    setAdditionalFees('0');
    setDiscount('0');
    setDepositAmount('0');
    setAmountPaid('0');
    setPaymentMethod(companySettings?.payment_methods?.[0] ?? 'Espèces');
    setStatusChoice('en_cours');
    setNotes('');
    if (rentableEquipment.length > 0) {
      const first = rentableEquipment[0];
      setLines([
        {
          equipment_id: first.id,
          equipment_unit_id: '',
          qty: 1,
          pricing_type: (first.indicative_rental_period as PricingType) || 'jour',
          duration_value: 1,
          unit_price: Number(first.indicative_rental_price) || 0,
        },
      ]);
    } else {
      setLines([]);
    }
    setCreateOpen(true);
  };

  const addLine = () => {
    const first = rentableEquipment[0];
    if (!first) {
      notify('error', 'Aucun matériel disponible pour la location.');
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        equipment_id: first.id,
        equipment_unit_id: '',
        qty: 1,
        pricing_type: (first.indicative_rental_period as PricingType) || 'jour',
        duration_value: 1,
        unit_price: Number(first.indicative_rental_price) || 0,
      },
    ]);
  };

  const loadScaffoldingPackage = (packageId: string) => {
    const pkg = scaffoldingPackages.find((p) => p.id === packageId);
    if (!pkg || !pkg.items) return;
    const loaded: DraftRentalLine[] = [];
    for (const item of pkg.items) {
      const eq = equipment.find((e) => e.id === item.equipment_id);
      if (!eq || eq.qty_rental_available <= 0) continue;
      loaded.push({
        equipment_id: eq.id,
        equipment_unit_id: '',
        qty: Math.min(item.default_qty, eq.qty_rental_available),
        pricing_type: (eq.indicative_rental_period as PricingType) || 'jour',
        duration_value: 1,
        unit_price: Number(eq.indicative_rental_price) || 0,
      });
    }
    if (loaded.length === 0) {
      notify('error', 'Aucun composant de ce lot n’est disponible en stock.');
      return;
    }
    setLines((prev) => [...prev, ...loaded]);
    notify('info', `Lot "${pkg.name}" ajouté.`);
  };

  const updateLine = (idx: number, patch: Partial<DraftRentalLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const updated = { ...l, ...patch };
        if (patch.equipment_id) {
          const eq = equipment.find((e) => e.id === patch.equipment_id);
          if (eq) {
            updated.unit_price = Number(eq.indicative_rental_price) || 0;
            updated.equipment_unit_id = '';
          }
        }
        return updated;
      })
    );
  };

  const computedSubtotal = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const lineAmt =
          l.pricing_type === 'personnalise' || l.pricing_type === 'selon_accord'
            ? l.unit_price * l.qty
            : l.unit_price * l.duration_value * l.qty;
        return sum + lineAmt;
      }, 0),
    [lines]
  );

  const computedTotal = Math.max(
    0,
    computedSubtotal + (Number(additionalFees) || 0) - (Number(discount) || 0)
  );
  const remainingBalance = Math.max(0, computedTotal - (Number(amountPaid) || 0));

  const handleSubmitRental = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    if (!customerId) {
      notify('error', 'Veuillez sélectionner un client.');
      return;
    }
    if (lines.length === 0) {
      notify('error', 'Ajoutez au moins un matériel à louer.');
      return;
    }

    for (const l of lines) {
      const eq = equipment.find((x) => x.id === l.equipment_id);
      if (!eq) {
        notify('error', 'Matériel invalide dans la liste.');
        return;
      }
      if (l.qty <= 0 || l.qty > eq.qty_rental_available) {
        notify('error', `Quantité invalide pour ${eq.designation} (dispo: ${eq.qty_rental_available}).`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const exitAtIso = new Date(`${exitDate}T${exitTime}:00`).toISOString();
      const expectedAtIso = new Date(`${returnDate}T${returnTime}:00`).toISOString();

      const { data, error } = await supabase.rpc('create_rental_tx', {
        p_customer_id: customerId,
        p_exit_at: exitAtIso,
        p_expected_return_at: expectedAtIso,
        p_additional_fees: Number(additionalFees) || 0,
        p_discount: Number(discount) || 0,
        p_deposit_amount: Number(depositAmount) || 0,
        p_amount_paid: Number(amountPaid) || 0,
        p_payment_method: paymentMethod,
        p_status: statusChoice,
        p_condition_at_exit: conditionAtExit,
        p_notes: notes.trim(),
        p_items: lines.map((l) => ({
          equipment_id: l.equipment_id,
          equipment_unit_id: l.equipment_unit_id || null,
          qty: l.qty,
          pricing_type: l.pricing_type,
          duration_value: l.duration_value,
          unit_price: l.unit_price,
        })),
      });

      if (error) throw error;
      notify('success', `Location ${(data as { reference?: string })?.reference ?? ''} confirmée.`);
      setCreateOpen(false);
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRental = async (rental: Rental) => {
    if (!supabase) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('cancel_rental_tx', {
        p_rental_id: rental.id,
        p_reason: 'Annulation manuelle par utilisateur',
      });
      if (error) throw error;
      notify('success', `Location ${rental.reference} annulée et stock restauré.`);
      setDetailRental(null);
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRentals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rentals.filter((r) => {
      const overdue = isRentalOverdue(r);
      const effectiveStatus = overdue && r.status !== 'terminee' && r.status !== 'annulee' ? 'en_retard' : r.status;
      if (filterStatus !== 'all' && effectiveStatus !== filterStatus) return false;
      if (filterCustomer !== 'all' && r.customer_id !== filterCustomer) return false;
      if (onlyUnpaid && r.total_amount - r.amount_paid <= 0.01) return false;
      if (
        q &&
        !r.reference.toLowerCase().includes(q) &&
        !r.customer_name.toLowerCase().includes(q) &&
        !(r.items ?? []).some((it) => it.equipment_designation.toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });
  }, [rentals, search, filterStatus, filterCustomer, onlyUnpaid]);

  if (dataLoading && rentals.length === 0) {
    return <LoadingState message="Chargement des locations..." />;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Réf. location, client, matériel..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="all">Tous statuts</option>
            <option value="en_preparation">En préparation</option>
            <option value="en_cours">En cours</option>
            <option value="partiellement_retournee">Partiellement retournée</option>
            <option value="en_retard">En retard</option>
            <option value="terminee">Terminée</option>
            <option value="annulee">Annulée</option>
          </select>
          <select
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="all">Tous clients</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-xs text-[#718096] cursor-pointer px-2">
            <input
              type="checkbox"
              checked={onlyUnpaid}
              onChange={(e) => setOnlyUnpaid(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Soldes restants dus</span>
          </label>
        </div>

        <button
          type="button"
          onClick={openNewModal}
          className="min-h-[42px] px-4 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle location</span>
        </button>
      </div>

      {filteredRentals.length === 0 ? (
        <EmptyState
          title="Aucune location trouvée"
          arTitle="لا توجد عمليات كراء"
          description="Créez votre première sortie de matériel pour générer automatiquement le bon de sortie et suivre les retours."
          actionLabel="Nouvelle location"
          onAction={openNewModal}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-xs font-semibold text-[#718096]">
                  <th className="py-3 px-4">Référence</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Sortie / Retour prévu</th>
                  <th className="py-3 px-4">Matériel</th>
                  <th className="py-3 px-4 text-right">Total convenu</th>
                  <th className="py-3 px-4 text-right">Payé</th>
                  <th className="py-3 px-4 text-right">Reste</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">Bon de sortie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredRentals.map((r) => {
                  const overdue = isRentalOverdue(r);
                  const balance = Math.max(0, Number(r.total_amount) - Number(r.amount_paid));
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-[#172B4D]">
                        <button
                          type="button"
                          onClick={() => setDetailRental(r)}
                          className="hover:text-[#FF8A24] underline-offset-2 hover:underline"
                        >
                          {r.reference}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#202B3C]">{r.customer_name}</div>
                        <div className="text-xs text-[#718096]">{r.customer_phone}</div>
                      </td>
                      <td className="py-3 px-4 text-xs tabular-nums">
                        <div className="text-[#202B3C]">{formatDateTimeFR(r.exit_at)}</div>
                        <div className={overdue ? 'text-[#E74C3C] font-semibold' : 'text-[#718096]'}>
                          Prévu: {formatDateTimeFR(r.expected_return_at)}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-[#202B3C]">
                        {(r.items ?? []).slice(0, 2).map((it) => (
                          <div key={it.id} className="truncate max-w-[220px]">
                            {formatQty(it.qty_rented)}× {it.equipment_designation}
                          </div>
                        ))}
                        {(r.items?.length ?? 0) > 2 && (
                          <div className="text-[#718096]">+{(r.items?.length ?? 0) - 2} autre(s)</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#172B4D]">
                        {formatDA(r.total_amount)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-[#16A085]">
                        {formatDA(r.amount_paid)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#E74C3C]">
                        {balance > 0 ? formatDA(balance) : '0,00 DA'}
                      </td>
                      <td className="py-3 px-4">
                        {r.status === 'terminee' ? (
                          <StatusText tone="success" icon="check" label="Terminée" />
                        ) : r.status === 'annulee' ? (
                          <StatusText tone="neutral" icon="cancel" label="Annulée" />
                        ) : overdue ? (
                          <StatusText tone="danger" icon="alert" label="En retard" />
                        ) : r.status === 'partiellement_retournee' ? (
                          <StatusText tone="warning" icon="clock" label="Partielle" />
                        ) : r.status === 'en_preparation' ? (
                          <StatusText tone="neutral" icon="clock" label="Préparation" />
                        ) : (
                          <StatusText tone="navy" icon="clock" label="En cours" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setPrintDoc({
                                kind: 'rental',
                                rental: r,
                                defaultVariant: r.status === 'en_preparation' ? 'devis' : 'bon_sortie',
                              })
                            }
                            className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#172B4D] inline-flex items-center gap-1"
                            title="Aperçu, Devis & Impression A4"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Aperçu</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => generateRentalExitPdf(r, companySettings)}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#172B4D] inline-flex items-center gap-1"
                            title="Télécharger le Bon de sortie en PDF"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nouvelle Location */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nouvelle location · Sortie du matériel"
        arTitle="كراء جديد · إخراج المعدات للزبون"
        maxWidthClass="max-w-4xl"
      >
        <form onSubmit={handleSubmitRental} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <BilingualLabel fr="Client" ar="الزبون" required />
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="">Sélectionner un client...</option>
                {activeCustomers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <BilingualLabel fr="Date et heure de sortie" ar="تاريخ وساعة الخروج" required />
              <div className="mt-1 flex gap-2">
                <input
                  type="date"
                  value={exitDate}
                  onChange={(e) => setExitDate(e.target.value)}
                  required
                  className="flex-1 min-h-[42px] px-2.5 py-2 rounded-lg border border-slate-300 text-xs"
                />
                <input
                  type="time"
                  value={exitTime}
                  onChange={(e) => setExitTime(e.target.value)}
                  required
                  className="w-24 min-h-[42px] px-2 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>

            <div>
              <BilingualLabel fr="Retour prévu" ar="تاريخ الإرجاع المتوقع" required />
              <div className="mt-1 flex gap-2">
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  required
                  className="flex-1 min-h-[42px] px-2.5 py-2 rounded-lg border border-slate-300 text-xs"
                />
                <input
                  type="time"
                  value={returnTime}
                  onChange={(e) => setReturnTime(e.target.value)}
                  required
                  className="w-24 min-h-[42px] px-2 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Articles & Échafaudages */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-[#F4F6FA]/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-[#172B4D]">Matériel loué &amp; tarification flexible</div>
                <div className="font-arabic text-[11px] text-[#718096]">المعدات المكراة والسعر المتفق عليه</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {scaffoldingPackages.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) loadScaffoldingPackage(e.target.value);
                      e.target.value = '';
                    }}
                    className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    <option value="">+ Charger un lot échafaudage...</option>
                    {scaffoldingPackages.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={addLine}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-[#172B4D] text-white text-xs font-medium inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajouter ligne</span>
                </button>
              </div>
            </div>

            {lines.length === 0 ? (
              <p className="text-xs text-[#718096] py-3 text-center">
                Aucun matériel disponible ou aucune ligne ajoutée.
              </p>
            ) : (
              <div className="space-y-3">
                {lines.map((line, idx) => {
                  const eq = equipment.find((e) => e.id === line.equipment_id);
                  const availUnits = equipmentUnits.filter(
                    (u) => u.equipment_id === line.equipment_id && u.pool_purpose === 'location' && u.status === 'disponible'
                  );
                  const lineSum =
                    line.pricing_type === 'personnalise' || line.pricing_type === 'selon_accord'
                      ? line.unit_price * line.qty
                      : line.unit_price * line.duration_value * line.qty;

                  return (
                    <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                      <div className="sm:col-span-4">
                        <label className="text-[11px] font-medium text-[#718096]">Matériel</label>
                        <select
                          value={line.equipment_id}
                          onChange={(e) => updateLine(idx, { equipment_id: e.target.value })}
                          className="mt-1 w-full min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                        >
                          {rentableEquipment.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.reference} — {item.designation} (Dispo: {formatQty(item.qty_rental_available)})
                            </option>
                          ))}
                        </select>
                        {eq?.tracking_mode === 'individuel' && availUnits.length > 0 && (
                          <select
                            value={line.equipment_unit_id}
                            onChange={(e) => updateLine(idx, { equipment_unit_id: e.target.value, qty: 1 })}
                            className="mt-1.5 w-full min-h-[34px] px-2 rounded-lg border border-slate-300 text-[11px] bg-white font-mono"
                          >
                            <option value="">Sélectionner N° de série...</option>
                            {availUnits.map((u) => (
                              <option key={u.id} value={u.id}>{u.serial_number} ({u.internal_code})</option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-medium text-[#718096]">Quantité</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={eq?.qty_rental_available ?? undefined}
                          value={line.qty}
                          onChange={(e) => updateLine(idx, { qty: Number(e.target.value) || 0 })}
                          className="mt-1 w-full min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs tabular-nums"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-medium text-[#718096]">Tarification</label>
                        <select
                          value={line.pricing_type}
                          onChange={(e) => updateLine(idx, { pricing_type: e.target.value as PricingType })}
                          className="mt-1 w-full min-h-[38px] px-2 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                        >
                          <option value="heure">Par heure</option>
                          <option value="jour">Par jour</option>
                          <option value="semaine">Par semaine</option>
                          <option value="mois">Par mois</option>
                          <option value="personnalise">Personnalisé</option>
                          <option value="selon_accord">Selon accord</option>
                        </select>
                      </div>

                      <div className="sm:col-span-1">
                        <label className="text-[11px] font-medium text-[#718096]">Durée</label>
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          disabled={line.pricing_type === 'personnalise' || line.pricing_type === 'selon_accord'}
                          value={line.duration_value}
                          onChange={(e) => updateLine(idx, { duration_value: Number(e.target.value) || 1 })}
                          className="mt-1 w-full min-h-[38px] px-2 py-1.5 rounded-lg border border-slate-300 text-xs tabular-nums disabled:bg-slate-100"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-medium text-[#718096]">Prix convenu (DA)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={(e) => updateLine(idx, { unit_price: Number(e.target.value) || 0 })}
                          className="mt-1 w-full min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs tabular-nums font-semibold"
                        />
                      </div>

                      <div className="sm:col-span-1 flex items-center justify-between sm:justify-end gap-1">
                        <span className="text-xs font-bold text-[#172B4D] tabular-nums sm:hidden">
                          {formatDA(lineSum)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#E74C3C] hover:bg-red-50"
                          title="Supprimer ligne"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Montants et paiement */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <BilingualLabel fr="Frais supplémentaires" ar="مصاريف إضافية" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={additionalFees}
                onChange={(e) => setAdditionalFees(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
              />
            </div>
            <div>
              <BilingualLabel fr="Remise (DZD)" ar="تخفيض" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
              />
            </div>
            <div>
              <BilingualLabel fr="Caution / Dépôt" ar="الضمان" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
              />
            </div>
            <div>
              <BilingualLabel fr="Montant payé / Avance" ar="المبلغ المدفوع" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <BilingualLabel fr="Mode de paiement" ar="طريقة الدفع" />
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                {(companySettings?.payment_methods ?? ['Espèces', 'Virement bancaire', 'Carte bancaire', 'Chèque']).map((pm) => (
                  <option key={pm} value={pm}>{pm}</option>
                ))}
              </select>
            </div>
            <div>
              <BilingualLabel fr="État matériel au départ" ar="حالة المعدات عند الخروج" />
              <input
                type="text"
                value={conditionAtExit}
                onChange={(e) => setConditionAtExit(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <BilingualLabel fr="Statut initial" ar="الحالة" />
              <select
                value={statusChoice}
                onChange={(e) => setStatusChoice(e.target.value as 'en_cours' | 'en_preparation')}
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="en_cours">En cours (Sortie immédiate)</option>
                <option value="en_preparation">En préparation</option>
              </select>
            </div>
          </div>

          <div>
            <BilingualLabel fr="Notes" ar="ملاحظات" />
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          {/* Récapitulatif */}
          <div className="bg-[#172B4D] text-white rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5 text-xs text-slate-300">
              <div>Sous-total articles : <span className="text-white font-semibold tabular-nums">{formatDA(computedSubtotal)}</span></div>
              <div>Reste à payer : <span className="text-[#FF8A24] font-semibold tabular-nums">{formatDA(remainingBalance)}</span></div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-300">Total location</div>
              <div className="text-xl font-bold tabular-nums">{formatDA(computedTotal)}</div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[42px] px-5 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? 'Validation...' : 'Confirmer la sortie'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Détails Location */}
      <Modal
        open={Boolean(detailRental)}
        onClose={() => setDetailRental(null)}
        title={detailRental ? `Détails location ${detailRental.reference}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {detailRental && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs bg-[#F4F6FA] p-3 rounded-lg">
              <div><span className="text-[#718096]">Client :</span> <strong>{detailRental.customer_name}</strong></div>
              <div><span className="text-[#718096]">Sortie :</span> <strong className="tabular-nums">{formatDateTimeFR(detailRental.exit_at)}</strong></div>
              <div><span className="text-[#718096]">Retour prévu :</span> <strong className="tabular-nums">{formatDateTimeFR(detailRental.expected_return_at)}</strong></div>
              <div><span className="text-[#718096]">Total / Payé :</span> <strong className="tabular-nums">{formatDA(detailRental.total_amount)} / {formatDA(detailRental.amount_paid)}</strong></div>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {(detailRental.items ?? []).map((it) => (
                <div key={it.id} className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-[#172B4D]">{it.equipment_designation}</div>
                    <div className="text-[#718096]">
                      Loué: {formatQty(it.qty_rented)} {it.unit_name} · Retourné: {formatQty(it.qty_returned)} · Manquant: {formatQty(it.qty_missing)}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="font-semibold text-[#172B4D]">{formatDA(it.line_total)}</div>
                    <div className="text-[#718096]">{formatDA(it.unit_price)} / {it.pricing_type}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-between gap-2 pt-2 border-t border-slate-200">
              {detailRental.status !== 'terminee' && detailRental.status !== 'annulee' ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleCancelRental(detailRental)}
                  className="min-h-[40px] px-3 py-2 rounded-lg border border-red-300 text-[#E74C3C] text-xs font-medium inline-flex items-center gap-1.5"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Annuler et restaurer le stock</span>
                </button>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setPrintDoc({
                      kind: 'rental',
                      rental: detailRental,
                      defaultVariant:
                        detailRental.status === 'en_preparation' ? 'devis' : 'bon_sortie',
                    })
                  }
                  className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#172B4D] text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  <span>Aperçu / Imprimer A4</span>
                </button>
                <button
                  type="button"
                  onClick={() => generateRentalExitPdf(detailRental, companySettings)}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[#172B4D] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Télécharger Bon de Sortie (PDF)</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <PrintableDocumentModal
        docPayload={printDoc}
        company={companySettings}
        onClose={() => setPrintDoc(null)}
      />
    </div>
  );
}
