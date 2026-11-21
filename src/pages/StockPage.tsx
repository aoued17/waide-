import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDbError, supabase } from '../lib/supabase';
import { formatDateTimeFR, formatQty } from '../lib/formatters';
import { BilingualLabel } from '../components/ui/BilingualLabel';
import { Modal } from '../components/ui/Modal';
import { EmptyState, LoadingState } from '../components/ui/States';

export function StockPage() {
  const { equipment, stockMovements, dataLoading, refreshAll, notify } = useErp();

  const [search, setSearch] = useState('');
  const [modalAction, setModalAction] = useState<'entree_stock' | 'transfert_usage' | 'ajustement_manuel' | null>(null);
  const [equipmentId, setEquipmentId] = useState('');
  const [pool, setPool] = useState<'location' | 'vente' | 'endommage'>('location');
  const [targetPool, setTargetPool] = useState<'location' | 'vente'>('vente');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeEq = useMemo(() => equipment.filter((e) => !e.is_archived), [equipment]);

  const openActionModal = (action: 'entree_stock' | 'transfert_usage' | 'ajustement_manuel') => {
    setEquipmentId(activeEq[0]?.id ?? '');
    setPool('location');
    setTargetPool('vente');
    setQty('1');
    setReason('');
    setModalAction(action);
  };

  const handleConfirmStockOp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !modalAction || !equipmentId) return;
    if (!reason.trim()) {
      notify('error', 'Un motif est obligatoire pour tout mouvement de stock.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('adjust_stock_tx', {
        p_equipment_id: equipmentId,
        p_action: modalAction,
        p_pool: pool,
        p_target_pool: targetPool,
        p_qty: Number(qty) || 0,
        p_reason: reason.trim(),
        p_related_operation: modalAction.toUpperCase(),
      });
      if (error) throw error;
      notify('success', 'Mouvement de stock enregistré.');
      setModalAction(null);
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEq = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeEq.filter(
      (e) => !q || e.reference.toLowerCase().includes(q) || e.designation.toLowerCase().includes(q)
    );
  }, [activeEq, search]);

  if (dataLoading && equipment.length === 0) {
    return <LoadingState message="Chargement du stock..." />;
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
            placeholder="Filtrer matériel..."
            className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openActionModal('entree_stock')}
            className="min-h-[42px] px-3.5 py-2 rounded-lg bg-[#16A085] hover:bg-[#128770] text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Entrée de stock</span>
          </button>
          <button
            type="button"
            onClick={() => openActionModal('transfert_usage')}
            className="min-h-[42px] px-3.5 py-2 rounded-lg bg-[#172B4D] hover:bg-[#1E365F] text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span>Transfert Location ↔ Vente</span>
          </button>
          <button
            type="button"
            onClick={() => openActionModal('ajustement_manuel')}
            className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-[#172B4D] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Ajustement manuel</span>
          </button>
        </div>
      </div>

      {filteredEq.length === 0 ? (
        <EmptyState
          title="Aucun stock disponible"
          description="Ajoutez du matériel dans le module Matériel pour suivre les stocks séparés par destination."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-xs font-semibold text-[#718096]">
                  <th className="py-3 px-4">Réf. &amp; Matériel</th>
                  <th className="py-3 px-4 text-right">Stock Location Dispo</th>
                  <th className="py-3 px-4 text-right">En Location</th>
                  <th className="py-3 px-4 text-right">Stock Vente Dispo</th>
                  <th className="py-3 px-4 text-right">Maintenance</th>
                  <th className="py-3 px-4 text-right">Endommagé</th>
                  <th className="py-3 px-4 text-right">Total Parc</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredEq.map((e) => {
                  const total =
                    Number(e.qty_rental_available) +
                    Number(e.qty_rented) +
                    Number(e.qty_sale_available) +
                    Number(e.qty_maintenance) +
                    Number(e.qty_damaged);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#172B4D]">{e.designation}</div>
                        <div className="text-xs font-mono text-[#718096]">{e.reference} · {e.unit_name}</div>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#16A085]">
                        {formatQty(e.qty_rental_available)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#FF8A24]">
                        {formatQty(e.qty_rented)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#172B4D]">
                        {formatQty(e.qty_sale_available)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-[#C2820A]">
                        {formatQty(e.qty_maintenance)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums text-[#E74C3C]">
                        {formatQty(e.qty_damaged)}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-bold text-[#172B4D]">
                        {formatQty(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Journal complet des mouvements */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div>
          <h3 className="text-base font-semibold text-[#172B4D]">Journal des mouvements de stock</h3>
          <p className="font-arabic text-xs text-[#718096]">سجل حركات المخزون</p>
        </div>

        {stockMovements.length === 0 ? (
          <p className="text-xs text-[#718096] py-6 text-center">Aucun mouvement de stock enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-[#718096]">
                  <th className="py-2.5 px-3">Date &amp; Heure</th>
                  <th className="py-2.5 px-3">Matériel</th>
                  <th className="py-2.5 px-3">Pool</th>
                  <th className="py-2.5 px-3">Type mouvement</th>
                  <th className="py-2.5 px-3 text-right">Variation</th>
                  <th className="py-2.5 px-3 text-right">Avant → Après</th>
                  <th className="py-2.5 px-3">Opération / Motif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockMovements.slice(0, 80).map((m) => (
                  <tr key={m.id}>
                    <td className="py-2.5 px-3 tabular-nums text-[#718096]">{formatDateTimeFR(m.movement_at)}</td>
                    <td className="py-2.5 px-3 font-medium text-[#172B4D]">{m.equipment_designation}</td>
                    <td className="py-2.5 px-3 capitalize">{m.stock_pool}</td>
                    <td className="py-2.5 px-3">{m.movement_type.replace(/_/g, ' ')}</td>
                    <td className={`py-2.5 px-3 text-right font-mono font-semibold tabular-nums ${m.quantity >= 0 ? 'text-[#16A085]' : 'text-[#E74C3C]'}`}>
                      {m.quantity >= 0 ? `+${formatQty(m.quantity)}` : formatQty(m.quantity)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-[#718096]">
                      {formatQty(m.previous_qty)} → <strong className="text-[#172B4D]">{formatQty(m.new_qty)}</strong>
                    </td>
                    <td className="py-2.5 px-3 text-[#718096]">
                      {m.related_operation ? `${m.related_operation} · ` : ''}{m.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Opération Stock */}
      <Modal
        open={Boolean(modalAction)}
        onClose={() => setModalAction(null)}
        title={
          modalAction === 'entree_stock'
            ? 'Entrée de stock'
            : modalAction === 'transfert_usage'
            ? 'Transfert entre stock Location et Vente'
            : 'Ajustement manuel de stock'
        }
      >
        <form onSubmit={handleConfirmStockOp} className="space-y-4">
          <div>
            <BilingualLabel fr="Matériel" ar="المعدة" required />
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              required
              className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white"
            >
              {activeEq.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.reference} — {e.designation} (Loc: {formatQty(e.qty_rental_available)} / Vte: {formatQty(e.qty_sale_available)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <BilingualLabel fr={modalAction === 'transfert_usage' ? 'Stock source' : 'Stock concerné'} ar="المخزون" required />
              <select
                value={pool}
                onChange={(e) => {
                  const val = e.target.value as 'location' | 'vente' | 'endommage';
                  setPool(val);
                  if (modalAction === 'transfert_usage') {
                    setTargetPool(val === 'location' ? 'vente' : 'location');
                  }
                }}
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="location">Stock Location</option>
                <option value="vente">Stock Vente</option>
                {modalAction === 'ajustement_manuel' && <option value="endommage">Stock Endommagé</option>}
              </select>
            </div>

            {modalAction === 'transfert_usage' && (
              <div>
                <BilingualLabel fr="Stock destination" ar="الوجهة" required />
                <select
                  value={targetPool}
                  onChange={(e) => setTargetPool(e.target.value as 'location' | 'vente')}
                  className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="vente">Stock Vente</option>
                  <option value="location">Stock Location</option>
                </select>
              </div>
            )}

            <div>
              <BilingualLabel
                fr={modalAction === 'ajustement_manuel' ? 'Variation (+ ou −)' : 'Quantité'}
                ar="الكمية"
                required
              />
              <input
                type="number"
                step="0.01"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
                className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm tabular-nums"
              />
            </div>
          </div>

          <div>
            <BilingualLabel fr="Motif obligatoire" ar="السبب الإلزامي" required />
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Réception commande, Inventaire physique, Réaffectation..."
              required
              className="mt-1 w-full min-h-[42px] px-3 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button type="button" onClick={() => setModalAction(null)} className="min-h-[40px] px-4 rounded-lg border border-slate-300 text-sm">Annuler</button>
            <button type="submit" disabled={submitting} className="min-h-[40px] px-4 rounded-lg bg-[#FF8A24] text-white text-sm font-semibold">Valider</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
