import React, { useMemo, useState } from 'react';
import { FileDown, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDbError, supabase } from '../lib/supabase';
import { formatDateFR, formatDA, formatQty, toInputDate } from '../lib/formatters';
import { generateSaleInvoicePdf } from '../lib/pdfGenerator';
import {
  PrintableDocumentModal,
  type PrintableDocPayload,
} from '../components/PrintableDocumentModal';
import { BilingualLabel } from '../components/ui/BilingualLabel';
import { Modal } from '../components/ui/Modal';
import { EmptyState, LoadingState, StatusText } from '../components/ui/States';

interface DraftSaleLine {
  equipment_id: string;
  qty: number;
  unit_price: number;
}

export function SalesPage() {
  const { sales, customers, equipment, companySettings, dataLoading, refreshAll, notify } = useErp();

  const [search, setSearch] = useState('');
  const [filterPayment, setFilterPayment] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [printDoc, setPrintDoc] = useState<PrintableDocPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [saleDate, setSaleDate] = useState(toInputDate());
  const [discount, setDiscount] = useState('0');
  const [amountPaid, setAmountPaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Espèces');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftSaleLine[]>([]);

  const sellableEquipment = useMemo(
    () =>
      equipment.filter(
        (e) => !e.is_archived && e.activity_type !== 'location' && Number(e.qty_sale_available) > 0
      ),
    [equipment]
  );

  const activeCustomers = useMemo(() => customers.filter((c) => !c.is_archived), [customers]);

  const openNewSale = () => {
    setCustomerId(activeCustomers[0]?.id ?? '');
    setSaleDate(toInputDate());
    setDiscount('0');
    setAmountPaid('0');
    setPaymentMethod(companySettings?.payment_methods?.[0] ?? 'Espèces');
    setNotes('');
    if (sellableEquipment.length > 0) {
      const first = sellableEquipment[0];
      setLines([{ equipment_id: first.id, qty: 1, unit_price: Number(first.sale_price) || 0 }]);
    } else {
      setLines([]);
    }
    setCreateOpen(true);
  };

  const addLine = () => {
    const first = sellableEquipment[0];
    if (!first) {
      notify('error', 'Aucun matériel ou outillage disponible pour la vente.');
      return;
    }
    setLines((prev) => [...prev, { equipment_id: first.id, qty: 1, unit_price: Number(first.sale_price) || 0 }]);
  };

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.qty * l.unit_price, 0),
    [lines]
  );
  const totalAmount = Math.max(0, subtotal - (Number(discount) || 0));
  const remaining = Math.max(0, totalAmount - (Number(amountPaid) || 0));

  const handleSubmitSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    if (!customerId) {
      notify('error', 'Veuillez sélectionner un client.');
      return;
    }
    if (lines.length === 0) {
      notify('error', 'Ajoutez au moins un équipement ou outil à vendre.');
      return;
    }
    for (const l of lines) {
      const eq = equipment.find((x) => x.id === l.equipment_id);
      if (!eq || l.qty <= 0 || l.qty > eq.qty_sale_available) {
        notify('error', `Stock vente insuffisant pour ${eq?.designation ?? 'article'}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('create_sale_tx', {
        p_customer_id: customerId,
        p_sale_date: new Date(`${saleDate}T12:00:00`).toISOString(),
        p_discount: Number(discount) || 0,
        p_amount_paid: Number(amountPaid) || 0,
        p_payment_method: paymentMethod,
        p_notes: notes.trim(),
        p_items: lines,
      });
      if (error) throw error;
      notify('success', `Vente ${(data as { reference?: string })?.reference ?? ''} enregistrée.`);
      setCreateOpen(false);
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      const rem = Math.max(0, s.total_amount - s.amount_paid);
      if (filterPayment === 'unpaid' && rem <= 0.01) return false;
      if (filterPayment === 'paid' && rem > 0.01) return false;
      if (q && !s.reference.toLowerCase().includes(q) && !s.customer_name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [sales, search, filterPayment]);

  if (dataLoading && sales.length === 0) {
    return <LoadingState message="Chargement des ventes..." />;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Réf. vente, client..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value as 'all' | 'unpaid' | 'paid')}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="all">Toutes les ventes</option>
            <option value="paid">Soldées</option>
            <option value="unpaid">Avec reste à payer</option>
          </select>
        </div>

        <button
          type="button"
          onClick={openNewSale}
          className="min-h-[42px] px-4 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle vente</span>
        </button>
      </div>

      {filteredSales.length === 0 ? (
        <EmptyState
          title="Aucune vente enregistrée"
          arTitle="لا توجد مبيعات"
          description="Vendez des équipements et outils issus de votre stock de vente (hors matériaux de construction)."
          actionLabel="Nouvelle vente"
          onAction={openNewSale}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-xs font-semibold text-[#718096]">
                  <th className="py-3 px-4">Référence</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Articles</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-right">Encaissé</th>
                  <th className="py-3 px-4 text-right">Reste</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">Facture</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredSales.map((s) => {
                  const rem = Math.max(0, s.total_amount - s.amount_paid);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-[#172B4D]">{s.reference}</td>
                      <td className="py-3 px-4 text-xs tabular-nums">{formatDateFR(s.sale_date)}</td>
                      <td className="py-3 px-4 font-medium text-[#202B3C]">{s.customer_name}</td>
                      <td className="py-3 px-4 text-xs text-[#718096]">
                        {(s.items ?? []).map((it) => (
                          <div key={it.id} className="truncate max-w-[220px]">
                            {formatQty(it.qty)}× {it.equipment_designation}
                          </div>
                        ))}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#172B4D]">
                        {formatDA(s.total_amount)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-[#16A085]">
                        {formatDA(s.amount_paid)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#E74C3C]">
                        {formatDA(rem)}
                      </td>
                      <td className="py-3 px-4">
                        {rem <= 0.01 ? (
                          <StatusText tone="success" icon="check" label="Payée" />
                        ) : s.amount_paid > 0 ? (
                          <StatusText tone="warning" icon="clock" label="Partielle" />
                        ) : (
                          <StatusText tone="danger" icon="alert" label="À crédit" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setPrintDoc({
                                kind: 'sale',
                                sale: s,
                                defaultVariant: 'facture',
                              })
                            }
                            className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#172B4D] inline-flex items-center gap-1"
                            title="Aperçu Facture / Devis & Impression A4"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Aperçu</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => generateSaleInvoicePdf(s, companySettings)}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#172B4D] inline-flex items-center gap-1"
                            title="Télécharger la facture en PDF"
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

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nouvelle vente d'équipement / outillage"
        arTitle="بيع جديد للمعدات والأدوات"
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleSubmitSale} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <BilingualLabel fr="Client" ar="الزبون" required />
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="">Sélectionner un client...</option>
                {activeCustomers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <BilingualLabel fr="Date de vente" ar="تاريخ البيع" required />
              <input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                required
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-[#F4F6FA]/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#172B4D]">Articles vendus</span>
              <button
                type="button"
                onClick={addLine}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#172B4D] text-white text-xs font-medium inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter</span>
              </button>
            </div>

            {lines.length === 0 ? (
              <p className="text-xs text-[#718096] py-3 text-center">Aucun article éligible en stock de vente.</p>
            ) : (
              <div className="space-y-2.5">
                {lines.map((l, idx) => {
                  const eq = equipment.find((e) => e.id === l.equipment_id);
                  return (
                    <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                      <div className="sm:col-span-5">
                        <label className="text-[11px] text-[#718096]">Équipement / Outillage</label>
                        <select
                          value={l.equipment_id}
                          onChange={(e) => {
                            const nextEq = equipment.find((x) => x.id === e.target.value);
                            setLines((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      equipment_id: e.target.value,
                                      unit_price: Number(nextEq?.sale_price) || 0,
                                    }
                                  : row
                              )
                            );
                          }}
                          className="mt-1 w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs bg-white"
                        >
                          {sellableEquipment.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.reference} — {item.designation} (Stock: {formatQty(item.qty_sale_available)})
                            </option>
                          ))}
                        </select>
                        {eq && (
                          <div className="text-[10px] text-[#718096] mt-0.5 tabular-nums">
                            Prix d&apos;achat réf. : {formatDA(eq.purchase_price)}
                          </div>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[11px] text-[#718096]">Quantité</label>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={eq?.qty_sale_available ?? undefined}
                          value={l.qty}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, qty: val } : row)));
                          }}
                          className="mt-1 w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs tabular-nums"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="text-[11px] text-[#718096]">Prix de vente (DA)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={l.unit_price}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setLines((prev) => prev.map((row, i) => (i === idx ? { ...row, unit_price: val } : row)));
                          }}
                          className="mt-1 w-full min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs tabular-nums font-semibold"
                        />
                      </div>
                      <div className="sm:col-span-2 flex items-center justify-between sm:justify-end gap-2">
                        <span className="text-xs font-bold text-[#172B4D] tabular-nums">
                          {formatDA(l.qty * l.unit_price)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#E74C3C] hover:bg-red-50"
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <BilingualLabel fr="Remise (DZD)" ar="تخفيض" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
              />
            </div>
            <div>
              <BilingualLabel fr="Montant payé (DZD)" ar="المبلغ المدفوع" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
              />
            </div>
            <div>
              <BilingualLabel fr="Mode de paiement" ar="طريقة الدفع" />
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white"
              >
                {(companySettings?.payment_methods ?? ['Espèces', 'Virement bancaire', 'Carte bancaire', 'Chèque']).map((pm) => (
                  <option key={pm} value={pm}>{pm}</option>
                ))}
              </select>
            </div>
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes de vente..."
            className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm"
          />

          <div className="bg-[#172B4D] text-white rounded-xl p-4 flex items-center justify-between">
            <div className="text-xs text-slate-300">
              Reste à payer : <strong className="text-[#FF8A24] tabular-nums">{formatDA(remaining)}</strong>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-300">Net à payer</div>
              <div className="text-xl font-bold tabular-nums">{formatDA(totalAmount)}</div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[42px] px-5 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? 'Enregistrement...' : 'Valider la vente'}
            </button>
          </div>
        </form>
      </Modal>

      <PrintableDocumentModal
        docPayload={printDoc}
        company={companySettings}
        onClose={() => setPrintDoc(null)}
      />
    </div>
  );
}
