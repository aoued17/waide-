import React, { useMemo, useState } from 'react';
import { CheckCircle2, Plus, Wrench } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDbError, supabase } from '../lib/supabase';
import { formatDateFR, formatDZD, formatQty, toInputDate } from '../lib/formatters';
import type { MaintenanceRecord, MaintenanceStatus } from '../types/erp';
import { BilingualLabel } from '../components/ui/BilingualLabel';
import { Modal } from '../components/ui/Modal';
import { EmptyState, LoadingState, StatusText } from '../components/ui/States';

export function MaintenancePage() {
  const { maintenanceRecords, equipment, equipmentUnits, dataLoading, refreshAll, notify } = useErp();

  const [filterStatus, setFilterStatus] = useState('all');
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [completeRecord, setCompleteRecord] = useState<MaintenanceRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Start form
  const [eqId, setEqId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [sourcePool, setSourcePool] = useState<'location' | 'vente' | 'endommage'>('location');
  const [qty, setQty] = useState('1');
  const [mType, setMType] = useState('Réparation');
  const [problem, setProblem] = useState('');
  const [technician, setTechnician] = useState('');
  const [cost, setCost] = useState('0');
  const [startDate, setStartDate] = useState(toInputDate());
  const [notes, setNotes] = useState('');

  // Complete form
  const [returnPool, setReturnPool] = useState<'location' | 'vente' | 'endommage'>('location');
  const [repairDetails, setRepairDetails] = useState('');
  const [finalCost, setFinalCost] = useState('0');
  const [completionDate, setCompletionDate] = useState(toInputDate());

  const activeEq = useMemo(() => equipment.filter((e) => !e.is_archived), [equipment]);

  const handleStartMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !eqId || !problem.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('start_maintenance_tx', {
        p_equipment_id: eqId,
        p_equipment_unit_id: unitId || null,
        p_source_pool: sourcePool,
        p_qty: Number(qty) || 1,
        p_maintenance_type: mType.trim(),
        p_problem_description: problem.trim(),
        p_technician: technician.trim(),
        p_cost: Number(cost) || 0,
        p_start_date: startDate,
        p_notes: notes.trim(),
      });
      if (error) throw error;
      setStartModalOpen(false);
      notify('success', 'Matériel mis en maintenance et retiré du stock disponible.');
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (rec: MaintenanceRecord, nextStatus: MaintenanceStatus) => {
    if (!supabase || nextStatus === 'termine') return;
    try {
      const { error } = await supabase
        .from('maintenance_records')
        .update({ status: nextStatus })
        .eq('id', rec.id);
      if (error) throw error;
      notify('success', 'Statut maintenance mis à jour.');
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    }
  };

  const handleCompleteMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !completeRecord) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('complete_maintenance_tx', {
        p_maintenance_id: completeRecord.id,
        p_return_pool: returnPool,
        p_repair_details: repairDetails.trim(),
        p_cost: Number(finalCost) || 0,
        p_completion_date: completionDate,
      });
      if (error) throw error;
      setCompleteRecord(null);
      notify('success', 'Maintenance terminée et matériel remis en stock.');
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = useMemo(
    () =>
      maintenanceRecords.filter(
        (m) => filterStatus === 'all' || m.status === filterStatus
      ),
    [maintenanceRecords, filterStatus]
  );

  if (dataLoading && maintenanceRecords.length === 0) {
    return <LoadingState message="Chargement des maintenances..." />;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
        >
          <option value="all">Tous statuts</option>
          <option value="a_verifier">À vérifier</option>
          <option value="en_reparation">En réparation</option>
          <option value="en_attente">En attente</option>
          <option value="termine">Terminé</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setEqId(activeEq[0]?.id ?? '');
            setUnitId('');
            setSourcePool('location');
            setQty('1');
            setMType('Réparation');
            setProblem('');
            setTechnician('');
            setCost('0');
            setStartDate(toInputDate());
            setNotes('');
            setStartModalOpen(true);
          }}
          className="min-h-[42px] px-4 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-medium inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle maintenance</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Aucune fiche de maintenance"
          arTitle="لا توجد عمليات صيانة"
          description="Mettez un équipement en maintenance pour bloquer sa disponibilité et suivre les réparations et coûts."
          actionLabel="Mettre en maintenance"
          onAction={() => setStartModalOpen(true)}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-[#718096]">
                  <th className="py-3 px-4">Référence</th>
                  <th className="py-3 px-4">Matériel &amp; Qté</th>
                  <th className="py-3 px-4">Type &amp; Problème</th>
                  <th className="py-3 px-4">Technicien</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4 text-right">Coût</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td className="py-3 px-4 font-mono font-semibold text-[#172B4D]">{m.reference}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#202B3C]">{m.equipment_designation}</div>
                      <div className="text-[#718096] tabular-nums">Qté: {formatQty(m.qty)} ({m.source_pool})</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#172B4D]">{m.maintenance_type}</div>
                      <div className="text-[#718096] max-w-[240px] truncate">{m.problem_description}</div>
                    </td>
                    <td className="py-3 px-4">{m.technician_or_supplier || '—'}</td>
                    <td className="py-3 px-4 tabular-nums">{formatDateFR(m.maintenance_date)}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold">{formatDZD(m.cost)}</td>
                    <td className="py-3 px-4">
                      {m.status === 'termine' ? (
                        <StatusText tone="success" icon="check" label="Terminé" />
                      ) : (
                        <select
                          value={m.status}
                          onChange={(e) => void handleStatusChange(m, e.target.value as MaintenanceStatus)}
                          className="min-h-[32px] px-2 rounded border border-slate-300 bg-white text-xs"
                        >
                          <option value="a_verifier">À vérifier</option>
                          <option value="en_reparation">En réparation</option>
                          <option value="en_attente">En attente</option>
                        </select>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {m.status !== 'termine' && (
                        <button
                          type="button"
                          onClick={() => {
                            setCompleteRecord(m);
                            setReturnPool(m.source_pool === 'vente' ? 'vente' : 'location');
                            setRepairDetails(m.repair_details || '');
                            setFinalCost(String(m.cost || 0));
                            setCompletionDate(toInputDate());
                          }}
                          className="min-h-[34px] px-3 py-1 rounded-lg bg-[#16A085] text-white text-xs font-medium inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Terminer</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Mise en maintenance */}
      <Modal open={startModalOpen} onClose={() => setStartModalOpen(false)} title="Mettre un matériel en maintenance" arTitle="إدخال معدة للصيانة">
        <form onSubmit={handleStartMaintenance} className="space-y-4">
          <div>
            <BilingualLabel fr="Matériel" ar="المعدة" required />
            <select value={eqId} onChange={(e) => { setEqId(e.target.value); setUnitId(''); }} required className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white">
              {activeEq.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.reference} — {e.designation} (Loc: {formatQty(e.qty_rental_available)} / Endomm: {formatQty(e.qty_damaged)})
                </option>
              ))}
            </select>
          </div>

          {(() => {
            const units = equipmentUnits.filter((u) => u.equipment_id === eqId && u.status === 'disponible');
            if (units.length === 0) return null;
            return (
              <div>
                <BilingualLabel fr="Unité individuelle (optionnel)" ar="الرقم التسلسلي" />
                <select value={unitId} onChange={(e) => { setUnitId(e.target.value); if (e.target.value) setQty('1'); }} className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-xs bg-white font-mono">
                  <option value="">Suivi global par quantité</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.serial_number} ({u.internal_code})</option>)}
                </select>
              </div>
            );
          })()}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <BilingualLabel fr="Stock source" ar="المصدر" />
              <select value={sourcePool} onChange={(e) => setSourcePool(e.target.value as 'location' | 'vente' | 'endommage')} className="mt-1 w-full min-h-[40px] px-2.5 rounded-lg border border-slate-300 text-sm bg-white">
                <option value="location">Location disponible</option>
                <option value="endommage">Matériel endommagé</option>
                <option value="vente">Vente disponible</option>
              </select>
            </div>
            <div>
              <BilingualLabel fr="Quantité" ar="الكمية" required />
              <input type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} required className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums" />
            </div>
            <div>
              <BilingualLabel fr="Type maintenance" ar="نوع الصيانة" required />
              <input type="text" value={mType} onChange={(e) => setMType(e.target.value)} required className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm" />
            </div>
          </div>

          <div>
            <BilingualLabel fr="Description du problème" ar="وصف العطل" required />
            <textarea rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} required className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input type="text" value={technician} onChange={(e) => setTechnician(e.target.value)} placeholder="Technicien / Atelier" className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm" />
            <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Coût estimé" className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums" />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm" />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setStartModalOpen(false)} className="min-h-[40px] px-4 rounded-lg border border-slate-300 text-sm">Annuler</button>
            <button type="submit" disabled={submitting} className="min-h-[40px] px-4 rounded-lg bg-[#FF8A24] text-white text-sm font-semibold inline-flex items-center gap-1.5">
              <Wrench className="w-4 h-4" />
              <span>Confirmer</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Clôture Maintenance */}
      <Modal open={Boolean(completeRecord)} onClose={() => setCompleteRecord(null)} title="Clôturer la maintenance et remettre en stock">
        {completeRecord && (
          <form onSubmit={handleCompleteMaintenance} className="space-y-4">
            <div className="bg-[#F4F6FA] p-3 rounded-lg text-xs">
              <strong>{completeRecord.reference}</strong> · {completeRecord.equipment_designation} ({formatQty(completeRecord.qty)})
            </div>
            <div>
              <BilingualLabel fr="Destination du matériel après réparation" ar="وجهة المعدات بعد التصليح" />
              <select value={returnPool} onChange={(e) => setReturnPool(e.target.value as 'location' | 'vente' | 'endommage')} className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white">
                <option value="location">Remettre en stock Location disponible</option>
                <option value="vente">Remettre en stock Vente disponible</option>
                <option value="endommage">Classer comme Endommagé (irréparable)</option>
              </select>
            </div>
            <div>
              <BilingualLabel fr="Détails de la réparation effectuée" ar="تفاصيل التصليح" />
              <textarea rows={2} value={repairDetails} onChange={(e) => setRepairDetails(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <BilingualLabel fr="Coût final (DZD)" ar="التكلفة النهائية" />
                <input type="number" min="0" step="0.01" value={finalCost} onChange={(e) => setFinalCost(e.target.value)} className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums" />
              </div>
              <div>
                <BilingualLabel fr="Date d'achèvement" ar="تاريخ الانتهاء" />
                <input type="date" value={completionDate} onChange={(e) => setCompletionDate(e.target.value)} className="mt-1 w-full min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCompleteRecord(null)} className="min-h-[40px] px-4 rounded-lg border border-slate-300 text-sm">Annuler</button>
              <button type="submit" disabled={submitting} className="min-h-[40px] px-4 rounded-lg bg-[#16A085] text-white text-sm font-semibold">Valider la remise en stock</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
