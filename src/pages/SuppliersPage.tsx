import React, { useMemo, useState } from 'react';
import { CreditCard, Edit3, Plus, Search, ShoppingBag } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDbError, supabase } from '../lib/supabase';
import { formatDateFR, formatDZD, toInputDate } from '../lib/formatters';
import type { Supplier } from '../types/erp';
import { BilingualLabel } from '../components/ui/BilingualLabel';
import { Modal } from '../components/ui/Modal';
import { EmptyState, LoadingState } from '../components/ui/States';

export function SuppliersPage() {
  const {
    suppliers,
    supplierPurchases,
    supplierPayments,
    companySettings,
    dataLoading,
    refreshAll,
    notify,
  } = useErp();

  const [search, setSearch] = useState('');
  const [supModal, setSupModal] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [purchaseModal, setPurchaseModal] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Supplier form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [notes, setNotes] = useState('');

  // Purchase form
  const [pSupplierId, setPSupplierId] = useState('');
  const [pDate, setPDate] = useState(toInputDate());
  const [pDesc, setPDesc] = useState('');
  const [pTotal, setPTotal] = useState('0');
  const [pPaid, setPPaid] = useState('0');

  // Payment form
  const [paySupplierId, setPaySupplierId] = useState('');
  const [payPurchaseId, setPayPurchaseId] = useState('');
  const [payDate, setPayDate] = useState(toInputDate());
  const [payAmount, setPayAmount] = useState('0');
  const [payMethod, setPayMethod] = useState('Espèces');
  const [payNotes, setPayNotes] = useState('');

  const balances = useMemo(() => {
    const map = new Map<string, { purchased: number; paid: number; balance: number }>();
    for (const s of suppliers) {
      const purch = supplierPurchases
        .filter((p) => p.supplier_id === s.id)
        .reduce((acc, p) => acc + Number(p.total_amount), 0);
      const paid = supplierPayments
        .filter((p) => p.supplier_id === s.id)
        .reduce((acc, p) => acc + Number(p.amount), 0);
      map.set(s.id, { purchased: purch, paid, balance: Math.max(0, purch - paid) });
    }
    return map;
  }, [suppliers, supplierPurchases, supplierPayments]);

  const openCreateSupplier = () => {
    setEditing(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setContactPerson('');
    setNotes('');
    setSupModal(true);
  };

  const openEditSupplier = (s: Supplier) => {
    setEditing(s);
    setName(s.name);
    setPhone(s.phone);
    setEmail(s.email);
    setAddress(s.address);
    setContactPerson(s.contact_person);
    setNotes(s.notes);
    setSupModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !name.trim()) return;
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        contact_person: contactPerson.trim(),
        notes: notes.trim(),
      };
      if (editing) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editing.id);
        if (error) throw error;
        notify('success', 'Fournisseur mis à jour.');
      } else {
        const { error } = await supabase.from('suppliers').insert(payload);
        if (error) throw error;
        notify('success', 'Fournisseur ajouté.');
      }
      setSupModal(false);
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !pSupplierId || !pDesc.trim()) return;
    const sup = suppliers.find((s) => s.id === pSupplierId);
    if (!sup) return;
    setSubmitting(true);
    try {
      const ref = `ACH-${Date.now().toString().slice(-6)}`;
      const paidVal = Math.max(0, Number(pPaid) || 0);
      const { data: purch, error } = await supabase
        .from('supplier_purchases')
        .insert({
          reference: ref,
          supplier_id: sup.id,
          supplier_name: sup.name,
          purchase_date: pDate,
          description: pDesc.trim(),
          total_amount: Math.max(0, Number(pTotal) || 0),
          amount_paid: paidVal,
        })
        .select()
        .single();
      if (error) throw error;

      if (paidVal > 0 && purch) {
        await supabase.from('supplier_payments').insert({
          reference: `PF-${Date.now().toString().slice(-6)}`,
          supplier_id: sup.id,
          purchase_id: purch.id,
          payment_date: pDate,
          amount: paidVal,
          payment_method: companySettings?.payment_methods?.[0] ?? 'Espèces',
          notes: 'Règlement initial achat ' + ref,
        });
      }

      setPurchaseModal(false);
      notify('success', 'Achat fournisseur enregistré.');
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !paySupplierId) return;
    const amt = Number(payAmount) || 0;
    if (amt <= 0) {
      notify('error', 'Montant invalide.');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('record_supplier_payment_tx', {
        p_supplier_id: paySupplierId,
        p_purchase_id: payPurchaseId || null,
        p_amount: amt,
        p_payment_method: payMethod,
        p_payment_date: payDate,
        p_notes: payNotes.trim(),
      });
      if (error) throw error;
      setPayModal(false);
      notify('success', 'Paiement fournisseur enregistré.');
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter(
      (s) =>
        !s.is_archived &&
        (!q || s.name.toLowerCase().includes(q) || s.contact_person.toLowerCase().includes(q))
    );
  }, [suppliers, search]);

  if (dataLoading && suppliers.length === 0) {
    return <LoadingState message="Chargement des fournisseurs..." />;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom fournisseur, contact..."
            className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setPSupplierId(suppliers[0]?.id ?? '');
              setPDesc('');
              setPTotal('0');
              setPPaid('0');
              setPurchaseModal(true);
            }}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-[#172B4D] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>+ Achat fournisseur</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPaySupplierId(suppliers[0]?.id ?? '');
              setPayPurchaseId('');
              setPayAmount('0');
              setPayMethod(companySettings?.payment_methods?.[0] ?? 'Espèces');
              setPayModal(true);
            }}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-[#172B4D] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>+ Paiement fournisseur</span>
          </button>
          <button
            type="button"
            onClick={openCreateSupplier}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau fournisseur</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Aucun fournisseur enregistré"
          arTitle="قائمة الموردين فارغة"
          description="Enregistrez vos fournisseurs d'équipements, pièces détachées et prestataires pour suivre vos achats et soldes dus."
          actionLabel="Nouveau fournisseur"
          onAction={openCreateSupplier}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-xs font-semibold text-[#718096]">
                  <th className="py-3 px-4">Fournisseur</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4">Téléphone / Email</th>
                  <th className="py-3 px-4 text-right">Total achats</th>
                  <th className="py-3 px-4 text-right">Total réglé</th>
                  <th className="py-3 px-4 text-right">Solde dû</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((s) => {
                  const b = balances.get(s.id) ?? { purchased: 0, paid: 0, balance: 0 };
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-semibold text-[#172B4D]">{s.name}</td>
                      <td className="py-3 px-4 text-xs text-[#202B3C]">{s.contact_person || '—'}</td>
                      <td className="py-3 px-4 text-xs text-[#718096]">
                        <div>{s.phone || '—'}</div>
                        <div>{s.email}</div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">{formatDZD(b.purchased)}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-[#16A085]">{formatDZD(b.paid)}</td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#E74C3C]">
                        {formatDZD(b.balance)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEditSupplier(s)}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#172B4D] hover:bg-slate-100"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {supplierPurchases.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-[#172B4D]">Historique des achats fournisseurs</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-[#718096]">
                  <th className="py-2.5 px-3">Réf.</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Fournisseur</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3 text-right">Payé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierPurchases.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 px-3 font-mono font-semibold text-[#172B4D]">{p.reference}</td>
                    <td className="py-2.5 px-3 tabular-nums">{formatDateFR(p.purchase_date)}</td>
                    <td className="py-2.5 px-3 font-medium">{p.supplier_name}</td>
                    <td className="py-2.5 px-3 text-[#718096]">{p.description}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold">{formatDZD(p.total_amount)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-[#16A085]">{formatDZD(p.amount_paid)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Fournisseur */}
      <Modal
        open={supModal}
        onClose={() => setSupModal(false)}
        title={editing ? 'Modifier fournisseur' : 'Nouveau fournisseur'}
      >
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <BilingualLabel fr="Nom du fournisseur" ar="اسم المورد" required />
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <BilingualLabel fr="Personne de contact" ar="الشخص المسؤول" />
              <input type="text" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <BilingualLabel fr="Téléphone" ar="الهاتف" />
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <BilingualLabel fr="E-mail" ar="البريد الإلكتروني" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <BilingualLabel fr="Adresse" ar="العنوان" />
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <BilingualLabel fr="Notes" ar="ملاحظات" />
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setSupModal(false)} className="min-h-[40px] px-4 rounded-lg border border-slate-300 text-sm">Annuler</button>
            <button type="submit" disabled={submitting} className="min-h-[40px] px-4 rounded-lg bg-[#FF8A24] text-white text-sm font-semibold">Enregistrer</button>
          </div>
        </form>
      </Modal>

      {/* Modal Achat Fournisseur */}
      <Modal open={purchaseModal} onClose={() => setPurchaseModal(false)} title="Nouvel achat fournisseur">
        <form onSubmit={handleSavePurchase} className="space-y-4">
          <select value={pSupplierId} onChange={(e) => setPSupplierId(e.target.value)} required className="w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white">
            <option value="">Sélectionner fournisseur...</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} required className="w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
          <input type="text" value={pDesc} onChange={(e) => setPDesc(e.target.value)} placeholder="Description achat *" required className="w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <BilingualLabel fr="Montant total (DZD)" ar="المبلغ الإجمالي" required />
              <input type="number" min="0" step="0.01" value={pTotal} onChange={(e) => setPTotal(e.target.value)} required className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums" />
            </div>
            <div>
              <BilingualLabel fr="Montant payé (DZD)" ar="المبلغ المدفوع" />
              <input type="number" min="0" step="0.01" value={pPaid} onChange={(e) => setPPaid(e.target.value)} className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPurchaseModal(false)} className="min-h-[40px] px-4 rounded-lg border border-slate-300 text-sm">Annuler</button>
            <button type="submit" disabled={submitting} className="min-h-[40px] px-4 rounded-lg bg-[#172B4D] text-white text-sm font-semibold">Enregistrer</button>
          </div>
        </form>
      </Modal>

      {/* Modal Paiement Fournisseur */}
      <Modal open={payModal} onClose={() => setPayModal(false)} title="Enregistrer un paiement fournisseur">
        <form onSubmit={handleSavePayment} className="space-y-4">
          <select value={paySupplierId} onChange={(e) => setPaySupplierId(e.target.value)} required className="w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white">
            <option value="">Sélectionner fournisseur...</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={payPurchaseId} onChange={(e) => setPayPurchaseId(e.target.value)} className="w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white">
            <option value="">Acompte général (sans achat spécifique)</option>
            {supplierPurchases.filter((p) => p.supplier_id === paySupplierId).map((p) => (
              <option key={p.id} value={p.id}>{p.reference} — {p.description} (Reste: {formatDZD(Math.max(0, p.total_amount - p.amount_paid))})</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm" />
            <input type="number" min="1" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="Montant DZD" required className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums" />
          </div>
          <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm bg-white">
            {(companySettings?.payment_methods ?? ['Espèces', 'Virement bancaire', 'Chèque']).map((pm) => (
              <option key={pm} value={pm}>{pm}</option>
            ))}
          </select>
          <input type="text" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Notes..." className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPayModal(false)} className="min-h-[40px] px-4 rounded-lg border border-slate-300 text-sm">Annuler</button>
            <button type="submit" disabled={submitting} className="min-h-[40px] px-4 rounded-lg bg-[#16A085] text-white text-sm font-semibold">Valider paiement</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
