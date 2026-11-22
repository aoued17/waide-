import React, { useMemo, useState } from 'react';
import { Archive, Edit3, FileDown, Plus, Search } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDbError, supabase } from '../lib/supabase';
import { formatDateFR, formatDA } from '../lib/formatters';
import { generateCustomerStatementPdf } from '../lib/pdfGenerator';
import type { Customer, CustomerType } from '../types/erp';
import { BilingualLabel } from '../components/ui/BilingualLabel';
import { Modal } from '../components/ui/Modal';
import { EmptyState, LoadingState, StatusText } from '../components/ui/States';

export function CustomersPage() {
  const { customers, rentals, sales, services, payments, companySettings, dataLoading, refreshAll, notify } = useErp();

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [detailCust, setDetailCust] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('particulier');
  const [taxId, setTaxId] = useState('');
  const [notes, setNotes] = useState('');

  const customerSummaries = useMemo(() => {
    const map = new Map<string, { invoiced: number; paid: number; balance: number }>();
    for (const c of customers) {
      const rInv = rentals
        .filter((r) => r.customer_id === c.id && r.status !== 'annulee')
        .reduce((s, r) => s + Number(r.total_amount), 0);
      const sInv = sales
        .filter((x) => x.customer_id === c.id)
        .reduce((s, x) => s + Number(x.total_amount), 0);
      const srvInv = services
        .filter((x) => x.customer_id === c.id && x.status !== 'annule')
        .reduce((s, x) => s + Number(x.agreed_price), 0);

      const rPaid = rentals
        .filter((r) => r.customer_id === c.id && r.status !== 'annulee')
        .reduce((s, r) => s + Number(r.amount_paid), 0);
      const sPaid = sales
        .filter((x) => x.customer_id === c.id)
        .reduce((s, x) => s + Number(x.amount_paid), 0);
      const srvPaid = services
        .filter((x) => x.customer_id === c.id && x.status !== 'annule')
        .reduce((s, x) => s + Number(x.amount_paid), 0);

      const invoiced = rInv + sInv + srvInv;
      const paid = rPaid + sPaid + srvPaid;
      map.set(c.id, { invoiced, paid, balance: Math.max(0, invoiced - paid) });
    }
    return map;
  }, [customers, rentals, sales, services]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCustomerType('particulier');
    setTaxId('');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setName(c.name);
    setPhone(c.phone);
    setEmail(c.email);
    setAddress(c.address);
    setCustomerType(c.customer_type);
    setTaxId(c.tax_id);
    setNotes(c.notes);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    if (!name.trim()) {
      notify('error', 'Veuillez saisir le nom ou la raison sociale du client.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        customer_type: customerType,
        tax_id: taxId.trim(),
        notes: notes.trim(),
      };
      if (editing) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editing.id);
        if (error) throw error;
        notify('success', 'Client mis à jour.');
      } else {
        const { error } = await supabase.from('customers').insert(payload);
        if (error) throw error;
        notify('success', 'Client ajouté.');
      }
      setModalOpen(false);
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchiveToggle = async (c: Customer) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('customers')
        .update({ is_archived: !c.is_archived })
        .eq('id', c.id);
      if (error) throw error;
      notify('success', !c.is_archived ? 'Client archivé (historique préservé).' : 'Client restauré.');
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (!showArchived && c.is_archived) return false;
      if (filterType !== 'all' && c.customer_type !== filterType) return false;
      if (
        q &&
        !c.name.toLowerCase().includes(q) &&
        !c.phone.toLowerCase().includes(q) &&
        !c.email.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [customers, search, filterType, showArchived]);

  if (dataLoading && customers.length === 0) {
    return <LoadingState message="Chargement du fichier clients..." />;
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
              placeholder="Nom, raison sociale, téléphone..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="all">Tous types</option>
            <option value="particulier">Particulier</option>
            <option value="entreprise">Entreprise</option>
            <option value="artisan">Artisan</option>
            <option value="institution">Institution</option>
          </select>
          <label className="inline-flex items-center gap-2 text-xs text-[#718096] cursor-pointer px-2">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Archivés</span>
          </label>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="min-h-[42px] px-4 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Nouveau client</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Aucun client enregistré"
          arTitle="إضافة زبون جديد"
          description="Ajoutez vos clients (particuliers, entreprises BTP, artisans) pour gérer leurs locations, ventes, services et créances."
          actionLabel="Nouveau client"
          onAction={openCreate}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-xs font-semibold text-[#718096]">
                  <th className="py-3 px-4">Nom / Raison sociale</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4 text-right">Total facturé</th>
                  <th className="py-3 px-4 text-right">Total payé</th>
                  <th className="py-3 px-4 text-right">Solde restant</th>
                  <th className="py-3 px-4">État</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((c) => {
                  const sum = customerSummaries.get(c.id) ?? { invoiced: 0, paid: 0, balance: 0 };
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => setDetailCust(c)}
                          className="font-semibold text-[#172B4D] hover:text-[#FF8A24] text-left"
                        >
                          {c.name}
                        </button>
                        {c.tax_id && <div className="text-[11px] font-mono text-[#718096]">{c.tax_id}</div>}
                      </td>
                      <td className="py-3 px-4 text-xs capitalize text-[#202B3C]">{c.customer_type}</td>
                      <td className="py-3 px-4 text-xs text-[#718096]">
                        <div>{c.phone || '—'}</div>
                        <div>{c.email}</div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">{formatDA(sum.invoiced)}</td>
                      <td className="py-3 px-4 text-right tabular-nums text-[#16A085]">{formatDA(sum.paid)}</td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#E74C3C]">
                        {formatDA(sum.balance)}
                      </td>
                      <td className="py-3 px-4">
                        {c.is_archived ? (
                          <StatusText tone="neutral" icon="archive" label="Archivé" />
                        ) : (
                          <StatusText tone="success" icon="check" label="Actif" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#172B4D] hover:bg-slate-100"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleArchiveToggle(c)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#718096] hover:bg-slate-100"
                          >
                            <Archive className="w-4 h-4" />
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

      {/* Modal Créer / Modifier Client */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Modifier le client' : 'Nouveau client'}
        arTitle="إضافة زبون جديد"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <BilingualLabel fr="Nom / Raison sociale" ar="الاسم أو اسم الشركة" required />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <BilingualLabel fr="Téléphone" ar="رقم الهاتف" />
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <BilingualLabel fr="E-mail" ar="البريد الإلكتروني" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div>
              <BilingualLabel fr="Type de client" ar="نوع الزبون" />
              <select
                value={customerType}
                onChange={(e) => setCustomerType(e.target.value as CustomerType)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="particulier">Particulier</option>
                <option value="entreprise">Entreprise</option>
                <option value="artisan">Artisan / Maçon</option>
                <option value="institution">Institution</option>
              </select>
            </div>
            <div>
              <BilingualLabel fr="Identification fiscale (NIF / RC)" ar="المعرف الجبائي" />
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <BilingualLabel fr="Adresse" ar="العنوان" />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <BilingualLabel fr="Notes" ar="ملاحظات" />
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[42px] px-5 py-2 rounded-lg bg-[#FF8A24] text-white text-sm font-semibold"
            >
              {submitting ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Relevé de Compte Client */}
      <Modal
        open={Boolean(detailCust)}
        onClose={() => setDetailCust(null)}
        title={detailCust ? `Relevé de compte — ${detailCust.name}` : ''}
        maxWidthClass="max-w-3xl"
      >
        {detailCust && (() => {
          const sum = customerSummaries.get(detailCust.id) ?? { invoiced: 0, paid: 0, balance: 0 };
          const cRentals = rentals.filter((r) => r.customer_id === detailCust.id && r.status !== 'annulee');
          const cSales = sales.filter((s) => s.customer_id === detailCust.id);
          const cServices = services.filter((s) => s.customer_id === detailCust.id && s.status !== 'annule');
          const cPayments = payments.filter((p) => p.customer_id === detailCust.id);

          const statementRows = [
            ...cRentals.map((r) => ({ date: r.exit_at, type: 'Location', ref: r.reference, amount: r.total_amount, paid: r.amount_paid })),
            ...cSales.map((s) => ({ date: s.sale_date, type: 'Vente', ref: s.reference, amount: s.total_amount, paid: s.amount_paid })),
            ...cServices.map((s) => ({ date: s.service_date, type: 'Service', ref: s.reference, amount: s.agreed_price, paid: s.amount_paid })),
          ];

          return (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3 bg-[#F4F6FA] p-3.5 rounded-lg">
                <div>
                  <div className="text-[#718096]">Total facturé</div>
                  <div className="text-base font-bold text-[#172B4D] tabular-nums">{formatDA(sum.invoiced)}</div>
                </div>
                <div>
                  <div className="text-[#718096]">Total encaissé</div>
                  <div className="text-base font-bold text-[#16A085] tabular-nums">{formatDA(sum.paid)}</div>
                </div>
                <div>
                  <div className="text-[#718096]">Solde dû</div>
                  <div className="text-base font-bold text-[#E74C3C] tabular-nums">{formatDA(sum.balance)}</div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-60 overflow-y-auto">
                {statementRows.length === 0 ? (
                  <div className="p-4 text-center text-[#718096]">Aucune opération enregistrée pour ce client.</div>
                ) : (
                  statementRows.map((row) => (
                    <div key={row.ref} className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <span className="font-mono font-semibold text-[#172B4D]">{row.ref}</span>
                        <span className="text-[#718096] ml-2">· {row.type} · {formatDateFR(row.date)}</span>
                      </div>
                      <div className="tabular-nums text-right">
                        <span className="font-semibold text-[#172B4D]">{formatDA(row.amount)}</span>
                        <span className="text-[#718096] ml-2">(Payé: {formatDA(row.paid)})</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="text-[#718096]">
                Historique paiements : <strong className="text-[#172B4D]">{cPayments.length} versement(s)</strong>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => generateCustomerStatementPdf(detailCust, sum, statementRows, companySettings)}
                  className="min-h-[40px] px-4 py-2 rounded-lg bg-[#172B4D] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Exporter Relevé (PDF)</span>
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
