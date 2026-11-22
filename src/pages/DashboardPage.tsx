import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Wrench,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import {
  computeLateDuration,
  formatDateFR,
  formatDateTimeFR,
  formatDA,
  formatQty,
  getDateRangeForPreset,
  isRentalOverdue,
  isWithinRange,
  toInputDate,
} from '../lib/formatters';
import type { DatePreset, NavSection } from '../types/erp';
import { DualBarChart, EquipmentUtilizationBar, type MonthlySeriesPoint } from '../components/ui/SvgCharts';
import { LoadingState, StatusText } from '../components/ui/States';

const PRESET_OPTIONS: Array<{ id: DatePreset; label: string }> = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'week', label: 'Cette semaine' },
  { id: 'month', label: 'Ce mois' },
  { id: 'year', label: 'Cette année' },
  { id: 'custom', label: 'Période personnalisée' },
];

export function DashboardPage({ onNavigate }: { onNavigate: (section: NavSection) => void }) {
  const {
    dataLoading,
    equipment,
    rentals,
    sales,
    services,
    payments,
    expenses,
    maintenanceRecords,
    stockMovements,
  } = useErp();

  const [preset, setPreset] = useState<DatePreset>('month');
  const [customStart, setCustomStart] = useState<string>(toInputDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState<string>(toInputDate(new Date()));
  const [chartTab, setChartTab] = useState<'comparison' | 'revenue' | 'expenses' | 'rentals'>('comparison');

  const { start, end } = useMemo(
    () => getDateRangeForPreset(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const metrics = useMemo(() => {
    const periodRentals = rentals.filter((r) => r.status !== 'annulee' && isWithinRange(r.exit_at, start, end));
    const periodSales = sales.filter((s) => isWithinRange(s.sale_date, start, end));
    const periodServices = services.filter((s) => s.status !== 'annule' && isWithinRange(s.service_date, start, end));
    const periodPayments = payments.filter((p) => isWithinRange(p.payment_date, start, end));
    const periodExpenses = expenses.filter((e) => isWithinRange(e.expense_date, start, end));
    const periodMaint = maintenanceRecords.filter((m) => isWithinRange(m.maintenance_date, start, end));

    const totalInvoiced =
      periodRentals.reduce((s, r) => s + Number(r.total_amount), 0) +
      periodSales.reduce((s, x) => s + Number(x.total_amount), 0) +
      periodServices.reduce((s, x) => s + Number(x.agreed_price), 0);

    const totalCollected = periodPayments.reduce((s, p) => s + Number(p.amount), 0);
    const totalExpenses = periodExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const salesCostBasis = periodSales.reduce((s, x) => s + Number(x.total_cost), 0);
    const maintenanceCost = periodMaint.reduce((s, m) => s + Number(m.cost), 0);

    // Résultat net estimé : Encaissements réels - Coût d'achat des ventes - Dépenses - Coûts maintenance
    const estimatedNetResult = totalCollected - salesCostBasis - totalExpenses - maintenanceCost;

    // Créances clients totales (toutes opérations actives non soldées)
    const rentalReceivables = rentals
      .filter((r) => r.status !== 'annulee')
      .reduce((s, r) => s + Math.max(0, Number(r.total_amount) - Number(r.amount_paid)), 0);
    const saleReceivables = sales.reduce(
      (s, x) => s + Math.max(0, Number(x.total_amount) - Number(x.amount_paid)),
      0
    );
    const serviceReceivables = services
      .filter((s) => s.status !== 'annule')
      .reduce((s, x) => s + Math.max(0, Number(x.agreed_price) - Number(x.amount_paid)), 0);
    const totalReceivables = rentalReceivables + saleReceivables + serviceReceivables;

    const activeRentals = rentals.filter((r) =>
      ['en_cours', 'partiellement_retournee', 'en_retard'].includes(r.status)
    );
    const overdueRentals = rentals.filter((r) => isRentalOverdue(r));

    const activeEq = equipment.filter((e) => !e.is_archived);
    const totalAvailableUnits = activeEq.reduce(
      (s, e) => s + Number(e.qty_rental_available) + Number(e.qty_sale_available),
      0
    );
    const totalMaintenanceUnits = activeEq.reduce((s, e) => s + Number(e.qty_maintenance), 0);
    const activeServicesCount = services.filter((s) =>
      ['en_attente', 'en_cours'].includes(s.status)
    ).length;

    return {
      totalInvoiced,
      totalCollected,
      totalReceivables,
      totalExpenses,
      salesCostBasis,
      maintenanceCost,
      estimatedNetResult,
      activeRentalsCount: activeRentals.length,
      overdueRentalsCount: overdueRentals.length,
      totalAvailableUnits,
      totalMaintenanceUnits,
      activeServicesCount,
      overdueRentals,
    };
  }, [equipment, rentals, sales, services, payments, expenses, maintenanceRecords, start, end]);

  // 6 derniers mois pour les graphiques mensuels réels
  const monthlySeries: MonthlySeriesPoint[] = useMemo(() => {
    const now = new Date();
    const months: MonthlySeriesPoint[] = [];
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const mStart = new Date(y, m, 1, 0, 0, 0, 0);
      const mEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);

      const rev = payments
        .filter((p) => isWithinRange(p.payment_date, mStart, mEnd))
        .reduce((s, p) => s + Number(p.amount), 0);
      const exp = expenses
        .filter((e) => isWithinRange(e.expense_date, mStart, mEnd))
        .reduce((s, e) => s + Number(e.amount), 0);
      const rCount = rentals.filter(
        (r) => r.status !== 'annulee' && isWithinRange(r.exit_at, mStart, mEnd)
      ).length;

      months.push({
        label: `${monthNames[m]} ${String(y).slice(-2)}`,
        revenue: rev,
        expenses: exp,
        rentalsCount: rCount,
      });
    }
    return months;
  }, [payments, expenses, rentals]);

  const utilizationSlices = useMemo(() => {
    const active = equipment.filter((e) => !e.is_archived);
    return [
      {
        label: 'Dispo. Location',
        value: active.reduce((s, e) => s + Number(e.qty_rental_available), 0),
        color: '#16A085',
      },
      {
        label: 'En location',
        value: active.reduce((s, e) => s + Number(e.qty_rented), 0),
        color: '#FF8A24',
      },
      {
        label: 'Dispo. Vente',
        value: active.reduce((s, e) => s + Number(e.qty_sale_available), 0),
        color: '#172B4D',
      },
      {
        label: 'Maintenance',
        value: active.reduce((s, e) => s + Number(e.qty_maintenance), 0),
        color: '#F4B942',
      },
      {
        label: 'Endommagé',
        value: active.reduce((s, e) => s + Number(e.qty_damaged), 0),
        color: '#E74C3C',
      },
    ];
  }, [equipment]);

  const expectedTodayReturns = useMemo(() => {
    const todayStr = toInputDate(new Date());
    return rentals.filter(
      (r) =>
        ['en_cours', 'partiellement_retournee', 'en_retard'].includes(r.status) &&
        r.expected_return_at.slice(0, 10) === todayStr
    );
  }, [rentals]);

  const stockAlerts = useMemo(
    () =>
      equipment.filter(
        (e) =>
          !e.is_archived &&
          Number(e.min_stock_alert) > 0 &&
          Number(e.qty_rental_available) + Number(e.qty_sale_available) <= Number(e.min_stock_alert)
      ),
    [equipment]
  );

  const pendingMaintenance = useMemo(
    () => maintenanceRecords.filter((m) => m.status !== 'termine').slice(0, 6),
    [maintenanceRecords]
  );

  if (dataLoading && equipment.length === 0 && rentals.length === 0) {
    return <LoadingState message="Chargement du tableau de bord..." />;
  }

  return (
    <div className="space-y-6">
      {/* Filtres de période */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F4F6FA] rounded-lg">
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPreset(opt.id)}
              className={`min-h-[38px] px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                preset === opt.id
                  ? 'bg-white text-[#172B4D] shadow-xs'
                  : 'text-[#718096] hover:text-[#172B4D]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {preset === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
            />
            <span className="text-[#718096]">au</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-[#718096] tabular-nums">
            <Calendar className="w-3.5 h-3.5" />
            <span>
              Du {formatDateFR(start)} au {formatDateFR(end)}
            </span>
          </div>
        )}
      </div>

      {/* 10 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard
          fr="Chiffre d'affaires facturé"
          ar="رقم المعاملات المفوتر"
          value={formatDA(metrics.totalInvoiced)}
          hint="Locations + Ventes + Services"
        />
        <KpiCard
          fr="Total des encaissements"
          ar="المبالغ المحصلة فعليا"
          value={formatDA(metrics.totalCollected)}
          tone="success"
          hint="Paiements réellement reçus"
        />
        <KpiCard
          fr="Total des créances clients"
          ar="المبلغ لي مازال ما تخلصش"
          value={formatDA(metrics.totalReceivables)}
          tone={metrics.totalReceivables > 0 ? 'warning' : 'neutral'}
          hint="Soldes restants à recouvrer"
        />
        <KpiCard
          fr="Total des dépenses"
          ar="المصاريف"
          value={formatDA(metrics.totalExpenses)}
          tone="danger"
          hint="Dépenses sur la période"
        />
        <KpiCard
          fr="Résultat net estimé"
          ar="النتيجة الصافية التقديرية"
          value={formatDA(metrics.estimatedNetResult)}
          tone={metrics.estimatedNetResult >= 0 ? 'success' : 'danger'}
          hint="Encaissements − Coût ventes − Dépenses − Maint."
        />
        <KpiCard
          fr="Locations en cours"
          ar="عقود الكراء الجارية"
          value={formatQty(metrics.activeRentalsCount)}
          hint="Matériel chez les clients"
        />
        <KpiCard
          fr="Locations en retard"
          ar="المعدات لي فات وقت إرجاعها"
          value={formatQty(metrics.overdueRentalsCount)}
          tone={metrics.overdueRentalsCount > 0 ? 'danger' : 'success'}
          hint="Retours dépassés"
        />
        <KpiCard
          fr="Matériel disponible"
          ar="المعدات المتوفرة"
          value={formatQty(metrics.totalAvailableUnits)}
          tone="success"
          hint="Stock location + vente"
        />
        <KpiCard
          fr="Matériel en maintenance"
          ar="معدات في الصيانة"
          value={formatQty(metrics.totalMaintenanceUnits)}
          tone={metrics.totalMaintenanceUnits > 0 ? 'warning' : 'neutral'}
          hint="En cours de réparation"
        />
        <KpiCard
          fr="Services en cours"
          ar="الخدمات الجارية"
          value={formatQty(metrics.activeServicesCount)}
          hint="En attente ou en exécution"
        />
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#172B4D]">Analyse financière et activité (6 mois)</h2>
              <p className="font-arabic text-xs text-[#718096]">تطور المداخيل والمصاريف والنشاط</p>
            </div>
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F4F6FA] rounded-lg">
              {(
                [
                  { id: 'comparison', label: 'Revenus vs Dépenses' },
                  { id: 'revenue', label: 'Revenus' },
                  { id: 'expenses', label: 'Dépenses' },
                  { id: 'rentals', label: 'Locations' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setChartTab(t.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    chartTab === t.id ? 'bg-white text-[#172B4D] shadow-xs' : 'text-[#718096] hover:text-[#172B4D]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <DualBarChart data={monthlySeries} mode={chartTab} />
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold text-[#172B4D]">Utilisation du matériel</h2>
            <p className="font-arabic text-xs text-[#718096]">توزيع حالة المعدات في المخزون</p>
          </div>
          <EquipmentUtilizationBar slices={utilizationSlices} />
        </div>
      </div>

      {/* Alertes & Listes opérationnelles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Locations en retard */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#172B4D]">Locations en retard</h3>
              <p className="font-arabic text-[11px] text-[#718096]">المعدات لي فات وقت إرجاعها</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('returns')}
              className="text-xs font-medium text-[#FF8A24] hover:text-[#E87612] inline-flex items-center gap-1"
            >
              <span>Traiter les retours</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {metrics.overdueRentals.length === 0 ? (
            <p className="text-xs text-[#718096] py-6 text-center">Aucune location en retard.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {metrics.overdueRentals.slice(0, 6).map((r) => {
                const late = computeLateDuration(r.expected_return_at);
                return (
                  <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-[#172B4D] truncate">
                        {r.reference} · {r.customer_name}
                      </div>
                      <div className="text-[#718096] tabular-nums">
                        Retour prévu : {formatDateTimeFR(r.expected_return_at)}
                      </div>
                    </div>
                    <span className="text-[#E74C3C] font-semibold whitespace-nowrap tabular-nums">
                      +{late.days}j {late.hours}h
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Retours attendus aujourd'hui */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#172B4D]">Retours attendus aujourd&apos;hui</h3>
              <p className="font-arabic text-[11px] text-[#718096]">المعدات المنتظر إرجاعها اليوم</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('returns')}
              className="text-xs font-medium text-[#FF8A24] hover:text-[#E87612] inline-flex items-center gap-1"
            >
              <span>Voir retours</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          {expectedTodayReturns.length === 0 ? (
            <p className="text-xs text-[#718096] py-6 text-center">Aucun retour prévu aujourd&apos;hui.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {expectedTodayReturns.map((r) => (
                <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#172B4D] truncate">{r.reference} · {r.customer_name}</div>
                    <div className="text-[#718096] tabular-nums">Heure prévue : {formatDateTimeFR(r.expected_return_at)}</div>
                  </div>
                  <StatusText tone="navy" icon="clock" label="Attendu" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dernières locations */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#172B4D]">Dernières locations</h3>
              <p className="font-arabic text-[11px] text-[#718096]">آخر عمليات الكراء</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('rentals')}
              className="text-xs font-medium text-[#FF8A24] hover:text-[#E87612]"
            >
              Tout voir
            </button>
          </div>
          {rentals.length === 0 ? (
            <p className="text-xs text-[#718096] py-6 text-center">Aucune location enregistrée.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {rentals.slice(0, 5).map((r) => (
                <div key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#172B4D] truncate">{r.reference} · {r.customer_name}</div>
                    <div className="text-[#718096] tabular-nums">{formatDateFR(r.exit_at)}</div>
                  </div>
                  <span className="font-semibold text-[#172B4D] tabular-nums whitespace-nowrap">
                    {formatDA(r.total_amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Derniers paiements */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#172B4D]">Derniers paiements</h3>
              <p className="font-arabic text-[11px] text-[#718096]">آخر المدفوعات المستلمة</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="text-xs font-medium text-[#FF8A24] hover:text-[#E87612]"
            >
              Tout voir
            </button>
          </div>
          {payments.length === 0 ? (
            <p className="text-xs text-[#718096] py-6 text-center">Aucun paiement enregistré.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {payments.slice(0, 5).map((p) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#172B4D] truncate">{p.customer_name}</div>
                    <div className="text-[#718096] tabular-nums">
                      {p.reference} · {p.payment_method} · {formatDateFR(p.payment_date)}
                    </div>
                  </div>
                  <span className="font-semibold text-[#16A085] tabular-nums whitespace-nowrap">
                    + {formatDA(p.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dernières opérations (mouvements de stock) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#172B4D]">Dernières opérations</h3>
              <p className="font-arabic text-[11px] text-[#718096]">سجل العمليات السابقة</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('stock')}
              className="text-xs font-medium text-[#FF8A24] hover:text-[#E87612]"
            >
              Journal stock
            </button>
          </div>
          {stockMovements.length === 0 ? (
            <p className="text-xs text-[#718096] py-6 text-center">Aucune opération enregistrée.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {stockMovements.slice(0, 5).map((m) => (
                <div key={m.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#172B4D] truncate">{m.equipment_designation}</div>
                    <div className="text-[#718096] truncate">
                      {m.movement_type.replace(/_/g, ' ')} · {m.related_operation || m.reference}
                    </div>
                  </div>
                  <span
                    className={`font-mono font-semibold tabular-nums whitespace-nowrap ${
                      m.quantity >= 0 ? 'text-[#16A085]' : 'text-[#E74C3C]'
                    }`}
                  >
                    {m.quantity >= 0 ? `+${formatQty(m.quantity)}` : formatQty(m.quantity)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alertes de stock & Maintenance à effectuer */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#172B4D]">Alertes de stock &amp; Maintenance</h3>
              <p className="font-arabic text-[11px] text-[#718096]">تنبيهات المخزون والصيانة</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('maintenance')}
              className="text-xs font-medium text-[#FF8A24] hover:text-[#E87612]"
            >
              Maintenance
            </button>
          </div>

          <div className="space-y-3">
            {stockAlerts.length === 0 && pendingMaintenance.length === 0 && (
              <p className="text-xs text-[#718096] py-4 text-center">
                Aucune alerte de stock ni maintenance en attente.
              </p>
            )}

            {stockAlerts.slice(0, 3).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-[#F4B942] shrink-0" />
                  <span className="font-medium text-[#202B3C] truncate">{e.designation}</span>
                </div>
                <span className="text-[#E74C3C] font-semibold tabular-nums whitespace-nowrap">
                  Dispo: {formatQty(e.qty_rental_available + e.qty_sale_available)} / Seuil {formatQty(e.min_stock_alert)}
                </span>
              </div>
            ))}

            {pendingMaintenance.slice(0, 3).map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-slate-100">
                <div className="flex items-center gap-2 min-w-0">
                  <Wrench className="w-3.5 h-3.5 text-[#172B4D] shrink-0" />
                  <span className="font-medium text-[#202B3C] truncate">{m.equipment_designation}</span>
                </div>
                <span className="text-[#718096] whitespace-nowrap">{m.status.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  fr,
  ar,
  value,
  hint,
  tone = 'navy',
}: {
  fr: string;
  ar: string;
  value: string;
  hint: string;
  tone?: 'navy' | 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const valueColor =
    tone === 'success'
      ? 'text-[#16A085]'
      : tone === 'warning'
      ? 'text-[#C2820A]'
      : tone === 'danger'
      ? 'text-[#E74C3C]'
      : 'text-[#172B4D]';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
      <div>
        <div className="text-xs font-semibold text-[#202B3C]">{fr}</div>
        <div className="font-arabic text-[11px] text-[#718096] mt-0.5">{ar}</div>
      </div>
      <div className={`text-lg font-bold tabular-nums mt-3 ${valueColor}`}>{value}</div>
      <div className="text-[11px] text-[#718096] mt-1">{hint}</div>
    </div>
  );
}
