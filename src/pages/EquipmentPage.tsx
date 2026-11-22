import React, { useMemo, useState } from 'react';
import {
  Archive,
  Edit3,
  Layers,
  Plus,
  Search,
  Tag,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { formatDbError, supabase } from '../lib/supabase';
import { formatDA, formatQty } from '../lib/formatters';
import type { ActivityType, Equipment, TrackingMode } from '../types/erp';
import { BilingualLabel } from '../components/ui/BilingualLabel';
import { Modal } from '../components/ui/Modal';
import { EmptyState, LoadingState, StatusText } from '../components/ui/States';
import { EquipmentImage } from '../components/ui/EquipmentImage';

export function EquipmentPage() {
  const {
    equipment,
    equipmentUnits,
    categories,
    units,
    scaffoldingPackages,
    dataLoading,
    refreshAll,
    notify,
  } = useErp();

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterActivity, setFilterActivity] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  const [eqModalOpen, setEqModalOpen] = useState(false);
  const [editingEq, setEditingEq] = useState<Equipment | null>(null);
  const [detailEq, setDetailEq] = useState<Equipment | null>(null);
  const [taxonomyModal, setTaxonomyModal] = useState<'category' | 'unit' | 'scaffolding_pkg' | null>(null);

  // Equipment form state
  const [refCode, setRefCode] = useState('');
  const [designation, setDesignation] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [customUnitName, setCustomUnitName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [activityType, setActivityType] = useState<ActivityType>('location');
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('quantite');
  const [isScaffolding, setIsScaffolding] = useState(false);
  const [qtyRental, setQtyRental] = useState('0');
  const [qtySale, setQtySale] = useState('0');
  const [minAlert, setMinAlert] = useState('0');
  const [purchasePrice, setPurchasePrice] = useState('0');
  const [salePrice, setSalePrice] = useState('0');
  const [indicativeRentalPrice, setIndicativeRentalPrice] = useState('0');
  const [indicativePeriod, setIndicativePeriod] = useState('jour');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Taxonomy creation state
  const [taxName, setTaxName] = useState('');
  const [taxSymbol, setTaxSymbol] = useState('');

  // Individual serial unit state
  const [unitSerial, setUnitSerial] = useState('');
  const [unitInternalCode, setUnitInternalCode] = useState('');
  const [unitPool, setUnitPool] = useState<'location' | 'vente'>('location');

  // Scaffolding package state
  const [pkgName, setPkgName] = useState('');
  const [pkgDesc, setPkgDesc] = useState('');
  const [pkgItems, setPkgItems] = useState<Array<{ equipment_id: string; default_qty: number }>>([]);

  const activeCategories = useMemo(() => categories.filter((c) => !c.is_archived), [categories]);
  const activeUnits = useMemo(() => units.filter((u) => !u.is_archived), [units]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return equipment.filter((e) => {
      if (!showArchived && e.is_archived) return false;
      if (filterCat !== 'all' && e.category_id !== filterCat) return false;
      if (filterActivity !== 'all' && e.activity_type !== filterActivity) return false;
      if (
        q &&
        !e.reference.toLowerCase().includes(q) &&
        !e.designation.toLowerCase().includes(q) &&
        !(e.category_name || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [equipment, search, filterCat, filterActivity, showArchived]);

  const openCreateModal = () => {
    setEditingEq(null);
    setRefCode(`MAT-${String(equipment.length + 1).padStart(4, '0')}`);
    setDesignation('');
    setCategoryId(activeCategories[0]?.id ?? '');
    setUnitId(activeUnits[0]?.id ?? '');
    setCustomUnitName('');
    setDescription('');
    setImageUrl('');
    setActivityType('location');
    setTrackingMode('quantite');
    setIsScaffolding(false);
    setQtyRental('0');
    setQtySale('0');
    setMinAlert('0');
    setPurchasePrice('0');
    setSalePrice('0');
    setIndicativeRentalPrice('0');
    setIndicativePeriod('jour');
    setNotes('');
    setEqModalOpen(true);
  };

  const openEditModal = (eq: Equipment) => {
    setEditingEq(eq);
    setRefCode(eq.reference);
    setDesignation(eq.designation);
    setCategoryId(eq.category_id ?? '');
    setUnitId(eq.unit_id ?? '');
    setCustomUnitName(eq.unit_name);
    setDescription(eq.description);
    setImageUrl(eq.image_url);
    setActivityType(eq.activity_type);
    setTrackingMode(eq.tracking_mode);
    setIsScaffolding(eq.is_scaffolding_component);
    setQtyRental(String(eq.qty_rental_available));
    setQtySale(String(eq.qty_sale_available));
    setMinAlert(String(eq.min_stock_alert));
    setPurchasePrice(String(eq.purchase_price));
    setSalePrice(String(eq.sale_price));
    setIndicativeRentalPrice(String(eq.indicative_rental_price));
    setIndicativePeriod(eq.indicative_rental_period);
    setNotes(eq.notes);
    setEqModalOpen(true);
  };

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;

    if (!refCode.trim() || !designation.trim()) {
      notify('error', 'La référence et la désignation sont obligatoires.');
      return;
    }

    const rQty = Math.max(0, Number(qtyRental) || 0);
    const sQty = Math.max(0, Number(qtySale) || 0);
    const catObj = activeCategories.find((c) => c.id === categoryId);
    const unitObj = activeUnits.find((u) => u.id === unitId);
    const finalUnitName = customUnitName.trim() || unitObj?.name || 'Unité';

    setSaving(true);
    try {
      const payload = {
        reference: refCode.trim(),
        designation: designation.trim(),
        category_id: categoryId || null,
        category_name: catObj?.name ?? '',
        description: description.trim(),
        image_url: imageUrl.trim(),
        unit_id: unitId || null,
        unit_name: finalUnitName,
        activity_type: activityType,
        tracking_mode: trackingMode,
        is_scaffolding_component: isScaffolding,
        min_stock_alert: Math.max(0, Number(minAlert) || 0),
        purchase_price: Math.max(0, Number(purchasePrice) || 0),
        sale_price: Math.max(0, Number(salePrice) || 0),
        indicative_rental_price: Math.max(0, Number(indicativeRentalPrice) || 0),
        indicative_rental_period: indicativePeriod,
        notes: notes.trim(),
        updated_at: new Date().toISOString(),
      };

      if (editingEq) {
        const { error } = await supabase.from('equipment').update(payload).eq('id', editingEq.id);
        if (error) throw error;
        notify('success', 'Matériel mis à jour avec succès.');
      } else {
        const { data: created, error } = await supabase
          .from('equipment')
          .insert({
            ...payload,
            qty_rental_available: activityType === 'vente' ? 0 : rQty,
            qty_sale_available: activityType === 'location' ? 0 : sQty,
          })
          .select()
          .single();
        if (error) throw error;

        if (created && (rQty > 0 || sQty > 0)) {
          const movements = [];
          if (activityType !== 'vente' && rQty > 0) {
            movements.push({
              reference: `MVT-${Date.now()}-L`,
              equipment_id: created.id,
              equipment_designation: created.designation,
              stock_pool: 'location',
              movement_type: 'entree_stock',
              quantity: rQty,
              previous_qty: 0,
              new_qty: rQty,
              related_operation: 'CREATION',
              notes: 'Stock initial location',
            });
          }
          if (activityType !== 'location' && sQty > 0) {
            movements.push({
              reference: `MVT-${Date.now()}-V`,
              equipment_id: created.id,
              equipment_designation: created.designation,
              stock_pool: 'vente',
              movement_type: 'entree_stock',
              quantity: sQty,
              previous_qty: 0,
              new_qty: sQty,
              related_operation: 'CREATION',
              notes: 'Stock initial vente',
            });
          }
          if (movements.length > 0) {
            await supabase.from('stock_movements').insert(movements);
          }
        }
        notify('success', 'Matériel ajouté à la base.');
      }
      setEqModalOpen(false);
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveToggle = async (eq: Equipment) => {
    if (!supabase) return;
    if (eq.qty_rented > 0) {
      notify('error', 'Impossible d’archiver un matériel actuellement en location.');
      return;
    }
    try {
      const nextArchived = !eq.is_archived;
      const { error } = await supabase
        .from('equipment')
        .update({
          is_archived: nextArchived,
          status: nextArchived ? 'archive' : 'disponible',
        })
        .eq('id', eq.id);
      if (error) throw error;
      notify('success', nextArchived ? 'Matériel archivé (historique préservé).' : 'Matériel restauré.');
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    }
  };

  const handleCreateTaxonomy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !taxName.trim()) return;
    setSaving(true);
    try {
      if (taxonomyModal === 'category') {
        const { error } = await supabase.from('categories').insert({ name: taxName.trim() });
        if (error) throw error;
        notify('success', 'Catégorie créée.');
      } else if (taxonomyModal === 'unit') {
        const { error } = await supabase
          .from('units')
          .insert({ name: taxName.trim(), symbol: taxSymbol.trim() });
        if (error) throw error;
        notify('success', 'Unité de mesure créée.');
      }
      setTaxName('');
      setTaxSymbol('');
      setTaxonomyModal(null);
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddSerialUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !detailEq || !unitSerial.trim() || !unitInternalCode.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('equipment_units').insert({
        equipment_id: detailEq.id,
        serial_number: unitSerial.trim(),
        internal_code: unitInternalCode.trim(),
        pool_purpose: unitPool,
      });
      if (error) throw error;
      setUnitSerial('');
      setUnitInternalCode('');
      notify('success', 'Unité individuelle enregistrée.');
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !pkgName.trim() || pkgItems.length === 0) {
      notify('error', 'Veuillez nommer le lot et ajouter au moins un composant.');
      return;
    }
    setSaving(true);
    try {
      const { data: pkg, error } = await supabase
        .from('scaffolding_packages')
        .insert({ name: pkgName.trim(), description: pkgDesc.trim() })
        .select()
        .single();
      if (error) throw error;

      const { error: itemErr } = await supabase.from('scaffolding_package_items').insert(
        pkgItems.map((it) => ({
          package_id: pkg.id,
          equipment_id: it.equipment_id,
          default_qty: it.default_qty,
        }))
      );
      if (itemErr) throw itemErr;

      setPkgName('');
      setPkgDesc('');
      setPkgItems([]);
      setTaxonomyModal(null);
      notify('success', 'Lot d’échafaudage créé.');
      await refreshAll();
    } catch (err) {
      notify('error', formatDbError(err));
    } finally {
      setSaving(false);
    }
  };

  if (dataLoading && equipment.length === 0) {
    return <LoadingState message="Chargement du parc matériel..." />;
  }

  return (
    <div className="space-y-6">
      {/* Barre d'actions et filtres */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[260px]">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher référence, désignation..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:border-[#172B4D]"
            />
          </div>

          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="all">Toutes catégories</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <select
            value={filterActivity}
            onChange={(e) => setFilterActivity(e.target.value)}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
          >
            <option value="all">Toutes activités</option>
            <option value="location">Location uniquement</option>
            <option value="vente">Vente uniquement</option>
            <option value="location_et_vente">Location et vente</option>
          </select>

          <label className="inline-flex items-center gap-2 text-xs text-[#718096] cursor-pointer px-2">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Afficher archivés</span>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTaxonomyModal('category')}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#172B4D] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>+ Catégorie</span>
          </button>
          <button
            type="button"
            onClick={() => setTaxonomyModal('unit')}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#172B4D] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <span>+ Unité</span>
          </button>
          <button
            type="button"
            onClick={() => setTaxonomyModal('scaffolding_pkg')}
            className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#172B4D] text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Lots échafaudage ({scaffoldingPackages.length})</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter un matériel</span>
          </button>
        </div>
      </div>

      {/* Table / Empty state */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Aucun matériel enregistré"
          arTitle="قاعدة بيانات المعدات فارغة"
          description="La base matériel démarre vide. Créez vos catégories, unités et équipements industriels ou composants d'échafaudage."
          actionLabel="Ajouter le premier matériel"
          onAction={openCreateModal}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-xs font-semibold text-[#718096]">
                  <th className="py-3 px-4">Matériel</th>
                  <th className="py-3 px-4">Activité</th>
                  <th className="py-3 px-4 text-right">Dispo. Location</th>
                  <th className="py-3 px-4 text-right">Loué</th>
                  <th className="py-3 px-4 text-right">Dispo. Vente</th>
                  <th className="py-3 px-4 text-right">Maint. / Endomm.</th>
                  <th className="py-3 px-4 text-right">Tarif loc. / Vente</th>
                  <th className="py-3 px-4">État</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map((eq) => (
                  <tr key={eq.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <EquipmentImage src={eq.image_url} alt={eq.designation} />
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => setDetailEq(eq)}
                            className="font-semibold text-[#172B4D] hover:text-[#FF8A24] text-left truncate block max-w-[240px]"
                          >
                            {eq.designation}
                          </button>
                          <div className="text-xs text-[#718096] font-mono">
                            {eq.reference}
                            {eq.category_name ? ` · ${eq.category_name}` : ''}
                            {eq.is_scaffolding_component ? ' · Échafaudage' : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-[#202B3C]">
                      {eq.activity_type === 'location'
                        ? 'Location'
                        : eq.activity_type === 'vente'
                        ? 'Vente'
                        : 'Location & Vente'}
                      <div className="text-[11px] text-[#718096]">
                        {eq.tracking_mode === 'individuel' ? 'Suivi par N° série' : `Par ${eq.unit_name}`}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#16A085]">
                      {formatQty(eq.qty_rental_available)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-[#FF8A24] font-semibold">
                      {formatQty(eq.qty_rented)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-semibold text-[#172B4D]">
                      {formatQty(eq.qty_sale_available)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-xs text-[#718096]">
                      {formatQty(eq.qty_maintenance)} / {formatQty(eq.qty_damaged)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-xs">
                      {eq.activity_type !== 'vente' && (
                        <div className="text-[#172B4D] font-medium">
                          {formatDA(eq.indicative_rental_price)} / {eq.indicative_rental_period}
                        </div>
                      )}
                      {eq.activity_type !== 'location' && (
                        <div className="text-[#718096]">Vente: {formatDA(eq.sale_price)}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {eq.is_archived ? (
                        <StatusText tone="neutral" icon="archive" label="Archivé" />
                      ) : eq.qty_rental_available + eq.qty_sale_available > 0 ? (
                        <StatusText tone="success" icon="check" label="Disponible" />
                      ) : eq.qty_rented > 0 ? (
                        <StatusText tone="warning" icon="clock" label="En location" />
                      ) : eq.qty_maintenance > 0 ? (
                        <StatusText tone="warning" icon="wrench" label="Maintenance" />
                      ) : (
                        <StatusText tone="danger" icon="alert" label="Rupture" />
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(eq)}
                          title="Modifier"
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#172B4D] hover:bg-slate-100"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleArchiveToggle(eq)}
                          title={eq.is_archived ? 'Restaurer' : 'Archiver'}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#718096] hover:bg-slate-100"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Ajouter / Modifier Matériel */}
      <Modal
        open={eqModalOpen}
        onClose={() => setEqModalOpen(false)}
        title={editingEq ? 'Modifier le matériel' : 'Ajouter un matériel'}
        arTitle={editingEq ? 'تعديل بيانات المعدات' : 'إضافة معدة جديدة'}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleSaveEquipment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <BilingualLabel fr="Référence" ar="المرجع" required />
              <input
                type="text"
                value={refCode}
                onChange={(e) => setRefCode(e.target.value)}
                required
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
              />
            </div>
            <div>
              <BilingualLabel fr="Désignation" ar="تسمية المعدة" required />
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Ex: Bétonnière 350L / Cadre échafaudage H2m"
                required
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div>
              <BilingualLabel fr="Catégorie" ar="الفئة" />
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="">Sans catégorie</option>
                {activeCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <BilingualLabel fr="Unité de mesure" ar="وحدة القياس" required />
              <div className="mt-1 flex gap-2">
                <select
                  value={unitId}
                  onChange={(e) => {
                    setUnitId(e.target.value);
                    const found = activeUnits.find((u) => u.id === e.target.value);
                    if (found) setCustomUnitName(found.name);
                  }}
                  className="flex-1 min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  <option value="">Personnalisée...</option>
                  {activeUnits.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={customUnitName}
                  onChange={(e) => setCustomUnitName(e.target.value)}
                  placeholder="Pièce, Unité, Lot..."
                  className="flex-1 min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
            </div>

            <div>
              <BilingualLabel fr="Type d'activité" ar="نوع النشاط" required />
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value as ActivityType)}
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="location">Location uniquement</option>
                <option value="vente">Vente uniquement</option>
                <option value="location_et_vente">Location et vente</option>
              </select>
            </div>

            <div>
              <BilingualLabel fr="Mode de suivi" ar="طريقة التتبع" />
              <select
                value={trackingMode}
                onChange={(e) => setTrackingMode(e.target.value as TrackingMode)}
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
              >
                <option value="quantite">Par quantité (unités identiques)</option>
                <option value="individuel">Individuel (N° de série / code interne)</option>
              </select>
            </div>

            {!editingEq && activityType !== 'vente' && (
              <div>
                <BilingualLabel fr="Stock initial Location" ar="المخزون الأولي للكراء" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={qtyRental}
                  onChange={(e) => setQtyRental(e.target.value)}
                  className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
                />
              </div>
            )}

            {!editingEq && activityType !== 'location' && (
              <div>
                <BilingualLabel fr="Stock initial Vente" ar="المخزون الأولي للبيع" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={qtySale}
                  onChange={(e) => setQtySale(e.target.value)}
                  className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
                />
              </div>
            )}

            <div>
              <BilingualLabel fr="Prix d'achat (DZD)" ar="سعر الشراء" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
              />
            </div>

            {activityType !== 'location' && (
              <div>
                <BilingualLabel fr="Prix de vente (DZD)" ar="سعر البيع" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
                />
              </div>
            )}

            {activityType !== 'vente' && (
              <div>
                <BilingualLabel fr="Tarif location indicatif (DZD)" ar="سعر الكراء التقريبي" />
                <div className="mt-1 flex gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={indicativeRentalPrice}
                    onChange={(e) => setIndicativeRentalPrice(e.target.value)}
                    className="flex-1 min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
                  />
                  <select
                    value={indicativePeriod}
                    onChange={(e) => setIndicativePeriod(e.target.value)}
                    className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="heure">/ heure</option>
                    <option value="jour">/ jour</option>
                    <option value="semaine">/ semaine</option>
                    <option value="mois">/ mois</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <BilingualLabel fr="Seuil d'alerte stock" ar="الحد الأدنى للتنبيه" />
              <input
                type="number"
                min="0"
                step="1"
                value={minAlert}
                onChange={(e) => setMinAlert(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm tabular-nums"
              />
            </div>

            <div>
              <BilingualLabel fr="URL de l'image" ar="رابط الصورة" />
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-[#202B3C] cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isScaffolding}
              onChange={(e) => setIsScaffolding(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>Composant d&apos;échafaudage (disponible pour lots et location groupée)</span>
          </label>

          <div>
            <BilingualLabel fr="Description & Notes" ar="ملاحظات" />
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setEqModalOpen(false)}
              className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-[#202B3C]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[42px] px-5 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving ? 'Enregistrement...' : editingEq ? 'Mettre à jour' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Détails & Suivi individuel */}
      <Modal
        open={Boolean(detailEq)}
        onClose={() => setDetailEq(null)}
        title={detailEq ? `${detailEq.reference} — ${detailEq.designation}` : ''}
        maxWidthClass="max-w-2xl"
      >
        {detailEq && (
          <div className="space-y-5">
            <div className="flex items-start gap-4">
              <EquipmentImage src={detailEq.image_url} alt={detailEq.designation} className="w-20 h-20" />
              <div className="space-y-1 text-sm">
                <div className="text-[#718096]">
                  Catégorie : <strong className="text-[#172B4D]">{detailEq.category_name || '—'}</strong> · Unité :{' '}
                  <strong className="text-[#172B4D]">{detailEq.unit_name}</strong>
                </div>
                <div className="tabular-nums">
                  Dispo location : <strong className="text-[#16A085]">{formatQty(detailEq.qty_rental_available)}</strong> · Loué :{' '}
                  <strong className="text-[#FF8A24]">{formatQty(detailEq.qty_rented)}</strong> · Dispo vente :{' '}
                  <strong className="text-[#172B4D]">{formatQty(detailEq.qty_sale_available)}</strong>
                </div>
                {detailEq.description && <p className="text-xs text-[#718096] pt-1">{detailEq.description}</p>}
              </div>
            </div>

            {detailEq.tracking_mode === 'individuel' && (
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <h3 className="text-sm font-semibold text-[#172B4D]">Unités individuelles (N° de série)</h3>
                <form onSubmit={handleAddSerialUnit} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input
                    type="text"
                    value={unitSerial}
                    onChange={(e) => setUnitSerial(e.target.value)}
                    placeholder="N° de série"
                    required
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={unitInternalCode}
                    onChange={(e) => setUnitInternalCode(e.target.value)}
                    placeholder="Code interne"
                    required
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
                  />
                  <select
                    value={unitPool}
                    onChange={(e) => setUnitPool(e.target.value as 'location' | 'vente')}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    <option value="location">Pool Location</option>
                    <option value="vente">Pool Vente</option>
                  </select>
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg bg-[#172B4D] text-white text-xs font-medium"
                  >
                    + Ajouter unité
                  </button>
                </form>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {equipmentUnits.filter((u) => u.equipment_id === detailEq.id).length === 0 ? (
                    <div className="p-4 text-xs text-[#718096] text-center">Aucune unité enregistrée.</div>
                  ) : (
                    equipmentUnits
                      .filter((u) => u.equipment_id === detailEq.id)
                      .map((u) => (
                        <div key={u.id} className="px-3 py-2 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-mono font-semibold text-[#172B4D]">{u.serial_number}</span>
                            <span className="text-[#718096] ml-2">({u.internal_code}) · {u.pool_purpose}</span>
                          </div>
                          <span className="font-medium text-[#172B4D]">{u.status}</span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Modal Catégorie / Unité */}
      <Modal
        open={taxonomyModal === 'category' || taxonomyModal === 'unit'}
        onClose={() => setTaxonomyModal(null)}
        title={taxonomyModal === 'category' ? 'Nouvelle catégorie de matériel' : 'Nouvelle unité de mesure'}
      >
        <form onSubmit={handleCreateTaxonomy} className="space-y-4">
          <div>
            <BilingualLabel fr="Nom" ar="الاسم" required />
            <input
              type="text"
              value={taxName}
              onChange={(e) => setTaxName(e.target.value)}
              placeholder={taxonomyModal === 'category' ? 'Ex: Échafaudage / Outillage électrique' : 'Ex: Pièce, Mètre, Lot'}
              required
              className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
            />
          </div>
          {taxonomyModal === 'unit' && (
            <div>
              <BilingualLabel fr="Symbole" ar="الرمز" />
              <input
                type="text"
                value={taxSymbol}
                onChange={(e) => setTaxSymbol(e.target.value)}
                placeholder="Ex: pce, m, lot"
                className="mt-1 w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setTaxonomyModal(null)}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-300 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-[#FF8A24] text-white text-sm font-semibold"
            >
              Créer
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Lots d'échafaudage */}
      <Modal
        open={taxonomyModal === 'scaffolding_pkg'}
        onClose={() => setTaxonomyModal(null)}
        title="Lots et kits d'échafaudage"
        arTitle="حزم السقالات"
        maxWidthClass="max-w-2xl"
      >
        <div className="space-y-5">
          {scaffoldingPackages.length > 0 && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {scaffoldingPackages.map((p) => (
                <div key={p.id} className="p-3 text-xs flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-[#172B4D]">{p.name}</div>
                    <div className="text-[#718096]">{p.description || `${p.items?.length ?? 0} composants`}</div>
                  </div>
                  <span className="font-mono text-[#172B4D]">{p.items?.length ?? 0} articles</span>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleSavePackage} className="space-y-3 border-t border-slate-200 pt-4">
            <h4 className="text-sm font-semibold text-[#172B4D]">Créer un nouveau lot groupé</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={pkgName}
                onChange={(e) => setPkgName(e.target.value)}
                placeholder="Nom du lot (ex: Tour échafaudage 6m)"
                required
                className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
              <input
                type="text"
                value={pkgDesc}
                onChange={(e) => setPkgDesc(e.target.value)}
                placeholder="Description"
                className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-300 text-sm"
              />
            </div>

            <div className="space-y-2">
              {pkgItems.map((it, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <select
                    value={it.equipment_id}
                    onChange={(e) => {
                      const next = [...pkgItems];
                      next[idx].equipment_id = e.target.value;
                      setPkgItems(next);
                    }}
                    className="flex-1 min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs bg-white"
                  >
                    {equipment
                      .filter((eq) => !eq.is_archived && eq.activity_type !== 'vente')
                      .map((eq) => (
                        <option key={eq.id} value={eq.id}>{eq.reference} — {eq.designation}</option>
                      ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={it.default_qty}
                    onChange={(e) => {
                      const next = [...pkgItems];
                      next[idx].default_qty = Number(e.target.value) || 1;
                      setPkgItems(next);
                    }}
                    className="w-24 min-h-[38px] px-2.5 rounded-lg border border-slate-300 text-xs tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => setPkgItems(pkgItems.filter((_, i) => i !== idx))}
                    className="text-xs text-[#E74C3C] px-2"
                  >
                    Retirer
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  const first = equipment.find((eq) => !eq.is_archived && eq.activity_type !== 'vente');
                  if (!first) {
                    notify('error', 'Ajoutez d’abord du matériel de location.');
                    return;
                  }
                  setPkgItems([...pkgItems, { equipment_id: first.id, default_qty: 1 }]);
                }}
                className="text-xs font-medium text-[#FF8A24] hover:text-[#E87612]"
              >
                + Ajouter un composant au lot
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-[#172B4D] text-white text-xs font-semibold"
              >
                Enregistrer le lot
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
