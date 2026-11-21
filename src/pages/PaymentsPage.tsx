import React, { useMemo, useState } from 'react';
import { CreditCard, FileDown, Plus, Search } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDbError, supabase } from '../lib/supabase';
import { formatDateTimeFR, formatDZD, toInputDate } from '../lib/formatters';
import { generatePaymentReceiptPdf } from '../lib/pdfGenerator';
import { BilingualLabel } from '../components/ui/BilingualLabel';
import { Modal } from '../components/ui/Modal';
import { EmptyState, LoadingState } from '../components/ui/States';

interface ReceivableRow {
  id: string;
  type: 'location' | 'vente' | 'service';
  reference: string;
  customer_id: string;
  customer_name: string;
  total: number;
  paid: number;
  remaining: number;
  overdue: boolean;
}

export function PaymentsPage() {
  const {
    payments,
    customers,
    rentals,
    sales,
    services,
    companySettings,
    dataLoading,
    refreshAll,
    notify,
  } = useErp();

  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [opType, setOpType] = useState<'location' | 'vente' | 'service' | 'compte'>('location');
  const [opId, setOpId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Espèces');
  const [paymentDate, setPaymentDate] = useState(toInputDate());
  const [notes, setNotes] = useState('');

  const receivables: ReceivableRow[] = useMemo(() => {
    const now = Date.now();
    const list: ReceivableRow[] = [];

    for (const r of rentals) {
      if (r.status === 'annulee') continue;
      const rem = Math.max(0, Number(r.total_amount) - Number(r.amount_paid));
      if (rem > 0.01) {
        list.push({
          id: r.id,
          type: 'location',
          reference: r.reference,
          customer_id: r.customer_id,
          customer_name: r.customer_name,
          total: Number(r.total_amount),
          paid: Number(r.amount_paid),
          remaining: rem,
          overdue: new Date(r.expected_return_at).getTime() < now && r.status !== 'terminee',
        });
      }
    }

    for (const s of sales) {
      const rem = Math.max(0, Number(s.total_amount) - Number(s.amount_paid));
      if (rem > 0.01) {
        list.push({
          id: s.id,
          type: 'vente',
          reference: s.reference,
          customer_id: s.customer_id,
          customer_name: s.customer_name,
          total: Number(s.total_amount),
          paid: Number(s.amount_paid),
          remaining: rem,
          overdue: false,
        });
      }
    }

    for (const srv of services) {
      if (srv.status === 'annule') continue;
      const rem = Math.max(0, Number(srv.agreed_price) - Number(srv.amount_paid));
      if (rem > 0.01) {
        list.push({
          id: srv.id,
          type: 'service',
          reference: srv.reference,
          customer_id: srv.customer_id,
          customer_name: srv.customer_name,
          total: Number(srv.agreed_price),
          paid: Number(srv.amount_paid),
          remaining: rem,
          overdue: false,
        });
      }
    }

    return list;
  }, [rentals, sales, services]);

  const totalCollected = useMemo(
    () => payments.reduce((s, p) => s + Number(p.amount), 0),
    [payments]
  );
  const totalReceivables = useMemo(
    () => receivables.reduce((s, r) => s + r.remaining, 0),
    [receivables]
  );

  const openModalForReceivable = (rec?: ReceivableRow) => {
    if (rec) {
      setCustomerId(rec.customer_id);
      setOpType(rec.type);
      setOpId(rec.id);
      setAmount(String(rec.remaining));
    } else {
      setCustomerId(customers[0]?.id ?? '');
      setOpType('compte');
      setOpId('');
      setAmount('');
    }
    setPaymentMethod(companySettings?.payment_methods?.[0] ?? 'Espèces');
    setPaymentDate(toInputDate());
    setNotes('');
    setModalOpen(true);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const amt = Number(amount) || 0;
    if (!customerId || amt <= 0) {
      notify('error', 'Veuillez sélectionner un client et un montant positif.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('record_payment_tx', {
        p_customer_id: customerId,
        p_operation_type: opType,
        p_operation_id: opType === 'compte' || !opId ? null : opId,
        p_amount: amt,
        p_payment_method: paymentMethod,
        p_payment_date: new Date(`${paymentDate}T12:00:00`).toISOString(),
        p_notes: notes.trim(),
      });
      if (error) throw error;
      notify('success', `Paiement ${(data as { reference?: string })?.reference ?? ''} encaissé.`);
      setModalOpen(false);
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter(
      (p) =>
        !q ||
        p.reference.toLowerCase().includes(q) ||
        p.customer_name.toLowerCase().includes(q) ||
        p.operation_reference.toLowerCase().includes(q)
    );
  }, [payments, search]);

  if (dataLoading && payments.length === 0 && receivables.length === 0) {
    return <LoadingState message="Chargement des paiements et créances..." />;
  }

  return (
    <div className="space-y-6">
      {/* Résumé Créances vs Encaissements */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-[#718096]">Total encaissé (historique)</div>
          <div className="font-arabic text-[11px] text-[#718096]">مجموع المبالغ المحصلة</div>
          <div className="text-xl font-bold text-[#16A085] tabular-nums mt-2">{formatDZD(totalCollected)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-[#718096]">Créances clients restantes</div>
          <div className="font-arabic text-[11px] text-[#718096]">المبلغ لي مازال ما تخلصش</div>
          <div className="text-xl font-bold text-[#E74C3C] tabular-nums mt-2">{formatDZD(totalReceivables)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-[#718096]">Dossiers impayés</div>
            <div className="text-xl font-bold text-[#172B4D] tabular-nums mt-2">{receivables.length}</div>
          </div>
          <button
            type="button"
            onClick={() => openModalForReceivable()}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Encaisser</span>
          </button>
        </div>
      </div>

      {/* Créances à recouvrer */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-[#172B4D]">Créances clients en cours</h2>
          <p className="font-arabic text-xs text-[#718096]">الديون المستحقة على الزبائن</p>
        </div>

        {receivables.length === 0 ? (
          <p className="text-xs text-[#718096] py-6 text-center">Aucune créance impayée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-[#718096]">
                  <th className="py-2.5 px-3">Opération</th>
                  <th className="py-2.5 px-3">Client</th>
                  <th className="py-2.5 px-3 text-right">Total facturé</th>
                  <th className="py-2.5 px-3 text-right">Déjà payé</th>
                  <th className="py-2.5 px-3 text-right">Reste dû</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receivables.map((rec) => (
                  <tr key={`${rec.type}-${rec.id}`}>
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-semibold text-[#172B4D]">{rec.reference}</span>
                      <span className="text-[#718096] ml-1.5 capitalize">({rec.type})</span>
                      {rec.overdue && <span className="ml-2 text-[#E74C3C] font-semibold">En retard</span>}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#202B3C]">{rec.customer_name}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{formatDZD(rec.total)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-[#16A085]">{formatDZD(rec.paid)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold text-[#E74C3C]">{formatDZD(rec.remaining)}</td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => openModalForReceivable(rec)}
                        className="min-h-[34px] px-3 py-1 rounded-lg bg-[#172B4D] text-white text-xs font-medium inline-flex items-center gap-1"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Régler</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historique immuable des paiements */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[#172B4D]">Historique des paiements (journal immuable)</h3>
            <p className="font-arabic text-xs text-[#718096]">سجل جميع الدفعات المستلمة</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher reçu, client..."
              className="w-full min-h-[40px] pl-9 pr-3 rounded-lg border border-slate-300 text-xs"
            />
          </div>
        </div>

        {filteredPayments.length === 0 ? (
          <EmptyState title="Aucun paiement enregistré" description="Chaque encaissement (avance, partiel ou solde) génère un reçu horodaté." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-[#718096]">
                  <th className="py-2.5 px-3">Réf. Reçu</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Client</th>
                  <th className="py-2.5 px-3">Opération</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3 text-right">Montant</th>
                  <th className="py-2.5 px-3 text-right">Reçu PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#172B4D]">{p.reference}</td>
                    <td className="py-2.5 px-3 tabular-nums">{formatDateTimeFR(p.payment_date)}</td>
                    <td className="py-2.5 px-3 font-medium">{p.customer_name}</td>
                    <td className="py-2.5 px-3 capitalize">
                      {p.operation_type} {p.operation_reference ? `· ${p.operation_reference}` : ''}
                    </td>
                    <td className="py-2.5 px-3">{p.payment_method}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-bold text-[#16A085]">
                      + {formatDZD(p.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => generatePaymentReceiptPdf(p, companySettings)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[#172B4D] inline-flex items-center gap-1"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        <span>PDF</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Enregistrer Paiement */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Encaisser un paiement"
        arTitle="تسجيل دفعة مالية"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <BilingualLabel fr="Client" ar="الزبون" required />
            <select
              value={customerId}
              onChange={(e) => {
                setCustomerId(e.target.value);
                setOpId('');
              }}
              required
              className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white"
            >
              <option value="">Sélectionner...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <BilingualLabel fr="Type d'opération" ar="نوع العملية" />
              <select
                value={opType}
                onChange={(e) => {
                  setOpType(e.target.value as 'location' | 'vente' | 'service' | 'compte');
                  setOpId('');
                }}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="location">Location</option>
                <option value="vente">Vente</option>
                <option value="service">Service technique</option>
                <option value="compte">Acompte général client</option>
              </select>
            </div>
            {opType !== 'compte' && (
              <div>
                <BilingualLabel fr="Dossier concerné" ar="الملف المعني" />
                <select
                  value={opId}
                  onChange={(e) => {
                    setOpId(e.target.value);
                    const found = receivables.find((r) => r.id === e.target.value);
                    if (found) setAmount(String(found.remaining));
                  }}
                  className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="">Sélectionner...</option>
                  {receivables
                    .filter((r) => r.customer_id === customerId && r.type === opType)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.reference} (Reste: {formatDZD(r.remaining)})
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <BilingualLabel fr="Montant (DZD)" ar="المبلغ" required />
              <input
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums font-semibold"
              />
            </div>
            <div>
              <BilingualLabel fr="Mode de règlement" ar="طريقة الدفع" />
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
            <div>
              <BilingualLabel fr="Date" ar="التاريخ" />
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes / N° chèque ou virement..."
            className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm"
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button type="button" onClick={() => setModalOpen(false)} className="min-h-[40px] px-4 rounded-lg border border-slate-300 text-sm">Annuler</button>
            <button type="submit" disabled={submitting} className="min-h-[40px] px-5 rounded-lg bg-[#16A085] text-white text-sm font-semibold">
              {submitting ? 'Validation...' : 'Confirmer encaissement'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
