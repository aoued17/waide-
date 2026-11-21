import React, { useMemo, useState } from 'react';
import { Plus, Search, Tag } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDbError, supabase } from '../lib/supabase';
import {
  formatDateFR,
  formatDZD,
  getDateRangeForPreset,
  isWithinRange,
  toInputDate,
} from '../lib/formatters';
import { BilingualLabel } from '../components/ui/BilingualLabel';
import { Modal } from '../components/ui/Modal';
import { EmptyState, LoadingState } from '../components/ui/States';

export function ExpensesPage() {
  const { expenses, expenseCategories, suppliers, companySettings, dataLoading, refreshAll, notify } = useErp();

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [newCatName, setNewCatName] = useState('');

  const [expDate, setExpDate] = useState(toInputDate());
  const [catId, setCatId] = useState('');
  const [customCatName, setCustomCatName] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Espèces');
  const [supplierId, setSupplierId] = useState('');
  const [relatedOp, setRelatedOp] = useState('');
  const [receiptRef, setReceiptRef] = useState('');
  const [notes, setNotes] = useState('');

  const activeCats = useMemo(() => expenseCategories.filter((c) => !c.is_archived), [expenseCategories]);

  const totals = useMemo(() => {
    const todayR = getDateRangeForPreset('today');
    const weekR = getDateRangeForPreset('week');
    const monthR = getDateRangeForPreset('month');

    return {
      today: expenses.filter((e) => isWithinRange(e.expense_date, todayR.start, todayR.end)).reduce((s, e) => s + Number(e.amount), 0),
      week: expenses.filter((e) => isWithinRange(e.expense_date, weekR.start, weekR.end)).reduce((s, e) => s + Number(e.amount), 0),
      month: expenses.filter((e) => isWithinRange(e.expense_date, monthR.start, monthR.end)).reduce((s, e) => s + Number(e.amount), 0),
    };
  }, [expenses]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      map.set(e.category_name, (map.get(e.category_name) ?? 0) + Number(e.amount));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newCatName.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('expense_categories').insert({ name: newCatName.trim() });
      if (error) throw error;
      setNewCatName('');
      setCatModalOpen(false);
      notify('success', 'Catégorie de dépense créée.');
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const catObj = activeCats.find((c) => c.id === catId);
    const catName = customCatName.trim() || catObj?.name || '';
    const amt = Number(amount) || 0;
    if (!catName || !description.trim() || amt <= 0) {
      notify('error', 'Catégorie, description et montant positif obligatoires.');
      return;
    }

    const supObj = suppliers.find((s) => s.id === supplierId);
    setSubmitting(true);
    try {
      const ref = `DEP-${Date.now().toString().slice(-6)}`;
      const { error } = await supabase.from('expenses').insert({
        reference: ref,
        expense_date: expDate,
        category_id: catId || null,
        category_name: catName,
        description: description.trim(),
        amount: amt,
        payment_method: paymentMethod,
        supplier_id: supplierId || null,
        supplier_name: supObj?.name ?? '',
        related_operation: relatedOp.trim(),
        receipt_ref: receiptRef.trim(),
        notes: notes.trim(),
      });
      if (error) throw error;
      setModalOpen(false);
      notify('success', `Dépense ${ref} enregistrée.`);
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (filterCat !== 'all' && e.category_name !== filterCat) return false;
      if (
        q &&
        !e.reference.toLowerCase().includes(q) &&
        !e.description.toLowerCase().includes(q) &&
        !e.category_name.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [expenses, search, filterCat]);

  if (dataLoading && expenses.length === 0) {
    return <LoadingState message="Chargement des dépenses..." />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-[#718096]">Dépenses du jour</div>
          <div className="font-arabic text-[11px] text-[#718096]">مصاريف اليوم</div>
          <div className="text-xl font-bold text-[#172B4D] tabular-nums mt-2">{formatDZD(totals.today)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-[#718096]">Dépenses cette semaine</div>
          <div className="font-arabic text-[11px] text-[#718096]">مصاريف هذا الأسبوع</div>
          <div className="text-xl font-bold text-[#172B4D] tabular-nums mt-2">{formatDZD(totals.week)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-semibold text-[#718096]">Dépenses ce mois</div>
          <div className="font-arabic text-[11px] text-[#718096]">مصاريف هذا الشهر</div>
          <div className="text-xl font-bold text-[#E74C3C] tabular-nums mt-2">{formatDZD(totals.month)}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Description, référence..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="all">Toutes catégories</option>
            {byCategory.map(([cat]) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCatModalOpen(true)}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white text-[#172B4D] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>+ Catégorie dépense</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setExpDate(toInputDate());
              setCatId(activeCats[0]?.id ?? '');
              setCustomCatName(activeCats[0]?.name ?? '');
              setDescription('');
              setAmount('');
              setPaymentMethod(companySettings?.payment_methods?.[0] ?? 'Espèces');
              setSupplierId('');
              setRelatedOp('');
              setReceiptRef('');
              setNotes('');
              setModalOpen(true);
            }}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle dépense</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Aucune dépense enregistrée"
          arTitle="المصاريف فارغة"
          description="Suivez vos frais de carburant, transport, salaires, loyer ou fournitures avec catégories personnalisables."
          actionLabel="Nouvelle dépense"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F4F6FA] border-b border-slate-200 text-[#718096]">
                    <th className="py-3 px-4">Réf.</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Catégorie</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4 text-right">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono font-semibold text-[#172B4D]">{e.reference}</td>
                      <td className="py-3 px-4 tabular-nums">{formatDateFR(e.expense_date)}</td>
                      <td className="py-3 px-4 font-medium text-[#172B4D]">{e.category_name}</td>
                      <td className="py-3 px-4 text-[#202B3C]">
                        <div>{e.description}</div>
                        {e.supplier_name && <div className="text-[11px] text-[#718096]">Fournisseur: {e.supplier_name}</div>}
                      </td>
                      <td className="py-3 px-4 text-[#718096]">{e.payment_method}</td>
                      <td className="py-3 px-4 text-right tabular-nums font-bold text-[#E74C3C]">
                        {formatDZD(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit">
            <h3 className="text-sm font-semibold text-[#172B4D]">Répartition par catégorie</h3>
            <div className="divide-y divide-slate-100 text-xs">
              {byCategory.map(([cat, total]) => (
                <div key={cat} className="py-2.5 flex items-center justify-between">
                  <span className="text-[#202B3C] font-medium">{cat}</span>
                  <span className="font-semibold text-[#172B4D] tabular-nums">{formatDZD(total)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="Nouvelle catégorie de dépense">
        <form onSubmit={handleCreateCategory} className="space-y-4">
          <BilingualLabel fr="Nom de la catégorie" ar="اسم فئة المصروف" required />
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Ex: Carburant, Transport, Loyer, Électricité..."
            required
            className="w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCatModalOpen(false)} className="min-h-[40px] px-4 rounded-lg border border-slate-300 text-sm">Annuler</button>
            <button type="submit" disabled={submitting} className="min-h-[40px] px-4 rounded-lg bg-[#172B4D] text-white text-sm font-semibold">Créer</button>
          </div>
        </form>
      </Modal>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Enregistrer une dépense" arTitle="تسجيل مصروف">
        <form onSubmit={handleCreateExpense} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <BilingualLabel fr="Date" ar="التاريخ" required />
              <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} required className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div>
              <BilingualLabel fr="Catégorie" ar="الفئة" required />
              <div className="mt-1 flex gap-2">
                <select
                  value={catId}
                  onChange={(e) => {
                    setCatId(e.target.value);
                    const f = activeCats.find((c) => c.id === e.target.value);
                    if (f) setCustomCatName(f.name);
                  }}
                  className="flex-1 min-h-[42px] px-2.5 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="">Saisie libre...</option>
                  {activeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input
                  type="text"
                  value={customCatName}
                  onChange={(e) => setCustomCatName(e.target.value)}
                  placeholder="Catégorie"
                  required
                  className="flex-1 min-h-[42px] px-2.5 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <BilingualLabel fr="Description" ar="التفاصيل" required />
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} required className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <BilingualLabel fr="Montant (DZD)" ar="المبلغ" required />
              <input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums" />
            </div>
            <div>
              <BilingualLabel fr="Mode de paiement" ar="طريقة الدفع" />
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white">
                {(companySettings?.payment_methods ?? ['Espèces', 'Virement bancaire', 'Chèque']).map((pm) => (
                  <option key={pm} value={pm}>{pm}</option>
                ))}
              </select>
            </div>
            <div>
              <BilingualLabel fr="Fournisseur (optionnel)" ar="المورد" />
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white">
                <option value="">Aucun</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="text" value={relatedOp} onChange={(e) => setRelatedOp(e.target.value)} placeholder="Opération liée (ex: LOC-...)" className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-xs" />
            <input type="text" value={receiptRef} onChange={(e) => setReceiptRef(e.target.value)} placeholder="N° justificatif / facture" className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-xs" />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button type="button" onClick={() => setModalOpen(false)} className="min-h-[40px] px-4 rounded-lg border border-slate-300 text-sm">Annuler</button>
            <button type="submit" disabled={submitting} className="min-h-[40px] px-5 rounded-lg bg-[#FF8A24] text-white text-sm font-semibold">Enregistrer</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
