import React, { useMemo, useState } from 'react';
import { FileDown, MapPin, Plus, Search, Tag } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDbError, supabase } from '../lib/supabase';
import { formatDateFR, formatDZD, toInputDate } from '../lib/formatters';
import { generateServiceOrderPdf } from '../lib/pdfGenerator';
import type { ServiceOrder, ServiceStatus } from '../types/erp';
import { BilingualLabel } from '../components/ui/BilingualLabel';
import { Modal } from '../components/ui/Modal';
import { EmptyState, LoadingState, StatusText } from '../components/ui/States';

export function ServicesPage() {
  const { services, serviceTypes, customers, companySettings, dataLoading, refreshAll, notify } = useErp();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const [createOpen, setCreateOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [detailService, setDetailService] = useState<ServiceOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Service type creation
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDesc, setNewTypeDesc] = useState('');

  // New service order state
  const [customerId, setCustomerId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [customTypeName, setCustomTypeName] = useState('');
  const [description, setDescription] = useState('');
  const [serviceDate, setServiceDate] = useState(toInputDate());
  const [expectedStart, setExpectedStart] = useState(toInputDate());
  const [expectedEnd, setExpectedEnd] = useState('');
  const [agreedPrice, setAgreedPrice] = useState('0');
  const [advancePaid, setAdvancePaid] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Espèces');
  const [status, setStatus] = useState<ServiceStatus>('en_attente');
  const [notes, setNotes] = useState('');

  // Intervention form
  const [siteAddress, setSiteAddress] = useState('');
  const [intDate, setIntDate] = useState(toInputDate());
  const [intDesc, setIntDesc] = useState('');
  const [assignedEmployees, setAssignedEmployees] = useState('');
  const [equipmentUsed, setEquipmentUsed] = useState('');
  const [transportExp, setTransportExp] = useState('0');
  const [laborExp, setLaborExp] = useState('0');

  const activeTypes = useMemo(() => serviceTypes.filter((t) => !t.is_archived), [serviceTypes]);
  const activeCustomers = useMemo(() => customers.filter((c) => !c.is_archived), [customers]);

  const openNewService = () => {
    setCustomerId(activeCustomers[0]?.id ?? '');
    setServiceTypeId(activeTypes[0]?.id ?? '');
    setCustomTypeName(activeTypes[0]?.name ?? '');
    setDescription('');
    setServiceDate(toInputDate());
    setExpectedStart(toInputDate());
    setExpectedEnd('');
    setAgreedPrice('0');
    setAdvancePaid('0');
    setPaymentMethod(companySettings?.payment_methods?.[0] ?? 'Espèces');
    setStatus('en_attente');
    setNotes('');
    setCreateOpen(true);
  };

  const handleCreateServiceType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !newTypeName.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('service_types')
        .insert({ name: newTypeName.trim(), description: newTypeDesc.trim() });
      if (error) throw error;
      setNewTypeName('');
      setNewTypeDesc('');
      setTypeModalOpen(false);
      notify('success', 'Type de service ajouté.');
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const typeObj = activeTypes.find((t) => t.id === serviceTypeId);
    const typeName = customTypeName.trim() || typeObj?.name || '';
    if (!customerId || !typeName || !description.trim()) {
      notify('error', 'Client, type de service et description sont obligatoires.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('create_service_tx', {
        p_customer_id: customerId,
        p_service_type_id: serviceTypeId || null,
        p_service_type_name: typeName,
        p_description: description.trim(),
        p_service_date: serviceDate,
        p_expected_start_date: expectedStart || null,
        p_expected_end_date: expectedEnd || null,
        p_agreed_price: Math.max(0, Number(agreedPrice) || 0),
        p_advance_paid: Math.max(0, Number(advancePaid) || 0),
        p_payment_method: paymentMethod,
        p_status: status,
        p_notes: notes.trim(),
      });
      if (error) throw error;
      notify('success', `Service ${(data as { reference?: string })?.reference ?? ''} créé.`);
      setCreateOpen(false);
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (srv: ServiceOrder, nextStatus: ServiceStatus) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from('services')
        .update({
          status: nextStatus,
          actual_end_date: nextStatus === 'termine' || nextStatus === 'livre' ? toInputDate() : srv.actual_end_date,
        })
        .eq('id', srv.id);
      if (error) throw error;
      notify('success', 'Statut du service mis à jour.');
      await refreshAll();
      setDetailService((prev) => (prev ? { ...prev, status: nextStatus } : null));
    } catch (err) {
      notify('error', formatDbError(err));
    }
  };

  const handleAddIntervention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !detailService || !siteAddress.trim() || !intDesc.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('service_interventions').insert({
        service_id: detailService.id,
        site_address: siteAddress.trim(),
        intervention_date: intDate,
        description: intDesc.trim(),
        assigned_employees: assignedEmployees.trim(),
        equipment_used: equipmentUsed.trim(),
        transport_expense: Math.max(0, Number(transportExp) || 0),
        labor_expense: Math.max(0, Number(laborExp) || 0),
      });
      if (error) throw error;
      setSiteAddress('');
      setIntDesc('');
      setAssignedEmployees('');
      setEquipmentUsed('');
      setTransportExp('0');
      setLaborExp('0');
      notify('success', 'Intervention technique enregistrée.');
      await refreshAll();
      setDetailService(null);
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (filterStatus !== 'all' && s.status !== filterStatus) return false;
      if (
        q &&
        !s.reference.toLowerCase().includes(q) &&
        !s.customer_name.toLowerCase().includes(q) &&
        !s.service_type_name.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [services, search, filterStatus]);

  if (dataLoading && services.length === 0) {
    return <LoadingState message="Chargement des services techniques..." />;
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
              placeholder="Réf. service, client, type..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="all">Tous statuts</option>
            <option value="en_attente">En attente</option>
            <option value="en_cours">En cours</option>
            <option value="termine">Terminé</option>
            <option value="livre">Livré</option>
            <option value="annule">Annulé</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTypeModalOpen(true)}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#172B4D] text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Types de services ({activeTypes.length})</span>
          </button>
          <button
            type="button"
            onClick={openNewService}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-medium inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvel ordre de service</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Aucun service technique enregistré"
          arTitle="لا توجد خدمات تقنية مسجلة"
          description="Créez vos types de prestations (démolition, casse, fabrication métallique, soudure, interventions) et suivez vos ordres de service."
          actionLabel="Créer un ordre de service"
          onAction={openNewService}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-xs font-semibold text-[#718096]">
                  <th className="py-3 px-4">Référence</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Type &amp; Travaux</th>
                  <th className="py-3 px-4">Dates</th>
                  <th className="py-3 px-4 text-right">Prix convenu</th>
                  <th className="py-3 px-4 text-right">Payé</th>
                  <th className="py-3 px-4 text-right">Reste</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((s) => {
                  const rem = Math.max(0, s.agreed_price - s.amount_paid);
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-[#172B4D]">
                        <button
                          type="button"
                          onClick={() => setDetailService(s)}
                          className="hover:text-[#FF8A24] underline-offset-2 hover:underline"
                        >
                          {s.reference}
                        </button>
                      </td>
                      <td className="py-3 px-4 font-medium text-[#202B3C]">{s.customer_name}</td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-semibold text-[#172B4D]">{s.service_type_name}</div>
                        <div className="text-[#718096] truncate max-w-[240px]">{s.description}</div>
                      </td>
                      <td className="py-3 px-4 text-xs tabular-nums text-[#718096]">
                        <div>Créé: {formatDateFR(s.service_date)}</div>
                        {s.expected_end_date && <div>Fin prévue: {formatDateFR(s.expected_end_date)}</div>}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#172B4D]">
                        {formatDZD(s.agreed_price)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-[#16A085]">
                        {formatDZD(s.amount_paid)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#E74C3C]">
                        {formatDZD(rem)}
                      </td>
                      <td className="py-3 px-4">
                        {s.status === 'termine' || s.status === 'livre' ? (
                          <StatusText tone="success" icon="check" label={s.status === 'livre' ? 'Livré' : 'Terminé'} />
                        ) : s.status === 'en_cours' ? (
                          <StatusText tone="navy" icon="work" label="En cours" />
                        ) : s.status === 'annule' ? (
                          <StatusText tone="neutral" icon="cancel" label="Annulé" />
                        ) : (
                          <StatusText tone="warning" icon="clock" label="En attente" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => generateServiceOrderPdf(s, companySettings)}
                          className="min-h-[36px] px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-medium text-[#172B4D] inline-flex items-center gap-1"
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
        </div>
      )}

      {/* Modal Types de services */}
      <Modal
        open={typeModalOpen}
        onClose={() => setTypeModalOpen(false)}
        title="Types de services techniques"
        arTitle="أنواع الخدمات التقنية"
      >
        <div className="space-y-4">
          {activeTypes.length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {activeTypes.map((t) => (
                <div key={t.id} className="px-3 py-2 text-xs flex justify-between items-center">
                  <span className="font-semibold text-[#172B4D]">{t.name}</span>
                  <span className="text-[#718096]">{t.description}</span>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={handleCreateServiceType} className="space-y-3 border-t border-slate-200 pt-4">
            <BilingualLabel fr="Nouveau type de service" ar="إضافة نوع خدمة جديد" required />
            <input
              type="text"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder="Ex: Démolition, Casse, Fabrication métallique, Soudure..."
              required
              className="w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm"
            />
            <input
              type="text"
              value={newTypeDesc}
              onChange={(e) => setNewTypeDesc(e.target.value)}
              placeholder="Description..."
              className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-[#172B4D] text-white text-xs font-semibold"
              >
                Ajouter type
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Modal Nouvel ordre de service */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nouvel ordre de service technique"
        arTitle="طلب خدمة تقنية جديد"
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSubmitService} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <BilingualLabel fr="Client" ar="الزبون" required />
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                required
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="">Sélectionner...</option>
                {activeCustomers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <BilingualLabel fr="Type de service" ar="نوع الخدمة" required />
              <div className="mt-1 flex gap-2">
                <select
                  value={serviceTypeId}
                  onChange={(e) => {
                    setServiceTypeId(e.target.value);
                    const found = activeTypes.find((t) => t.id === e.target.value);
                    if (found) setCustomTypeName(found.name);
                  }}
                  className="flex-1 min-h-[42px] px-2.5 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="">Personnalisé...</option>
                  {activeTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={customTypeName}
                  onChange={(e) => setCustomTypeName(e.target.value)}
                  placeholder="Démolition, Soudure..."
                  required
                  className="flex-1 min-h-[42px] px-2.5 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <BilingualLabel fr="Description du travail" ar="وصف الأشغال" required />
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <BilingualLabel fr="Date création" ar="تاريخ الإنشاء" />
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-xs"
              />
            </div>
            <div>
              <BilingualLabel fr="Début prévu" ar="تاريخ البداية" />
              <input
                type="date"
                value={expectedStart}
                onChange={(e) => setExpectedStart(e.target.value)}
                className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-xs"
              />
            </div>
            <div>
              <BilingualLabel fr="Fin prévue" ar="تاريخ الانتهاء" />
              <input
                type="date"
                value={expectedEnd}
                onChange={(e) => setExpectedEnd(e.target.value)}
                className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <BilingualLabel fr="Prix convenu (DZD)" ar="السعر المتفق عليه" required />
              <input
                type="number"
                min="0"
                step="0.01"
                value={agreedPrice}
                onChange={(e) => setAgreedPrice(e.target.value)}
                required
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums font-semibold"
              />
            </div>
            <div>
              <BilingualLabel fr="Avance payée (DZD)" ar="التسبيق" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={advancePaid}
                onChange={(e) => setAdvancePaid(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
              />
            </div>
            <div>
              <BilingualLabel fr="Mode paiement" ar="طريقة الدفع" />
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white"
              >
                {(companySettings?.payment_methods ?? ['Espèces', 'Virement bancaire', 'Chèque']).map((pm) => (
                  <option key={pm} value={pm}>{pm}</option>
                ))}
              </select>
            </div>
            <div>
              <BilingualLabel fr="Statut" ar="الحالة" />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ServiceStatus)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="en_attente">En attente</option>
                <option value="en_cours">En cours</option>
                <option value="termine">Terminé</option>
                <option value="livre">Livré</option>
              </select>
            </div>
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes complémentaires..."
            className="w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm"
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
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
              className="min-h-[42px] px-5 py-2 rounded-lg bg-[#FF8A24] text-white text-sm font-semibold"
            >
              {submitting ? 'Création...' : 'Créer le service'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Détails & Interventions chantier */}
      <Modal
        open={Boolean(detailService)}
        onClose={() => setDetailService(null)}
        title={detailService ? `${detailService.reference} — ${detailService.service_type_name}` : ''}
        maxWidthClass="max-w-3xl"
      >
        {detailService && (
          <div className="space-y-5 text-sm">
            <div className="bg-[#F4F6FA] p-4 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div>Client : <strong className="text-[#172B4D]">{detailService.customer_name}</strong></div>
                <div className="text-[#718096] mt-0.5">{detailService.description}</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={detailService.status}
                  onChange={(e) => void handleUpdateStatus(detailService, e.target.value as ServiceStatus)}
                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-medium"
                >
                  <option value="en_attente">En attente</option>
                  <option value="en_cours">En cours</option>
                  <option value="termine">Terminé</option>
                  <option value="livre">Livré</option>
                  <option value="annule">Annulé</option>
                </select>
                <button
                  type="button"
                  onClick={() => generateServiceOrderPdf(detailService, companySettings)}
                  className="min-h-[36px] px-3 rounded-lg bg-[#172B4D] text-white text-xs font-medium inline-flex items-center gap-1"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#172B4D]">
                <MapPin className="w-4 h-4 text-[#FF8A24]" />
                <span>Interventions techniques sur chantier ({detailService.interventions?.length ?? 0})</span>
              </div>

              {(detailService.interventions ?? []).length > 0 && (
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {(detailService.interventions ?? []).map((iv) => (
                    <div key={iv.id} className="p-3 text-xs flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="font-semibold text-[#172B4D]">
                          {formatDateFR(iv.intervention_date)} · {iv.site_address}
                        </div>
                        <div className="text-[#718096]">{iv.description}</div>
                        {iv.assigned_employees && <div className="text-[#718096]">Équipe: {iv.assigned_employees}</div>}
                      </div>
                      <div className="text-right tabular-nums text-[#718096]">
                        <div>Transport: {formatDZD(iv.transport_expense)}</div>
                        <div>Main d&apos;œuvre: {formatDZD(iv.labor_expense)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleAddIntervention} className="border border-slate-200 rounded-lg p-3 space-y-3">
                <div className="text-xs font-semibold text-[#172B4D]">Ajouter une intervention chantier</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    value={siteAddress}
                    onChange={(e) => setSiteAddress(e.target.value)}
                    placeholder="Adresse du chantier *"
                    required
                    className="sm:col-span-2 min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs"
                  />
                  <input
                    type="date"
                    value={intDate}
                    onChange={(e) => setIntDate(e.target.value)}
                    required
                    className="min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs"
                  />
                  <input
                    type="text"
                    value={intDesc}
                    onChange={(e) => setIntDesc(e.target.value)}
                    placeholder="Description intervention *"
                    required
                    className="sm:col-span-3 min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs"
                  />
                  <input
                    type="text"
                    value={assignedEmployees}
                    onChange={(e) => setAssignedEmployees(e.target.value)}
                    placeholder="Employés assignés"
                    className="min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs"
                  />
                  <input
                    type="text"
                    value={equipmentUsed}
                    onChange={(e) => setEquipmentUsed(e.target.value)}
                    placeholder="Matériel utilisé"
                    className="min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs"
                  />
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={transportExp}
                      onChange={(e) => setTransportExp(e.target.value)}
                      placeholder="Transport"
                      className="w-1/2 min-h-[38px] px-2 rounded-lg border border-slate-300 text-xs tabular-nums"
                    />
                    <input
                      type="number"
                      min="0"
                      value={laborExp}
                      onChange={(e) => setLaborExp(e.target.value)}
                      placeholder="M. œuvre"
                      className="w-1/2 min-h-[38px] px-2 rounded-lg border border-slate-300 text-xs tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#172B4D] text-white text-xs font-medium"
                  >
                    + Enregistrer intervention
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
