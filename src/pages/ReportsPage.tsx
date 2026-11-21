import React, { useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { useErp } from '../context/ErpContext';
import {
  formatDateFR,
  formatDZD,
  formatQty,
  getDateRangeForPreset,
  isWithinRange,
  toInputDate,
} from '../lib/formatters';
import { exportRowsToExcel } from '../lib/excelExport';
import { generateReportPdf } from '../lib/pdfGenerator';
import type { DatePreset } from '../types/erp';

type ReportTab =
  | 'global'
  | 'locations'
  | 'retours'
  | 'ventes'
  | 'services'
  | 'paiements'
  | 'creances'
  | 'depenses'
  | 'stock'
  | 'maintenance';

const REPORT_TABS: Array<{ id: ReportTab; label: string }> = [
  { id: 'global', label: '10. Financier global' },
  { id: 'locations', label: '1. Locations' },
  { id: 'retours', label: '2. Retours' },
  { id: 'ventes', label: '3. Ventes' },
  { id: 'services', label: '4. Services' },
  { id: 'paiements', label: '5. Paiements' },
  { id: 'creances', label: '6. Créances clients' },
  { id: 'depenses', label: '7. Dépenses' },
  { id: 'stock', label: '8. Stock' },
  { id: 'maintenance', label: '9. Maintenance' },
];

export function ReportsPage() {
  const {
    equipment,
    rentals,
    returns,
    sales,
    services,
    payments,
    expenses,
    maintenanceRecords,
    companySettings,
  } = useErp();

  const [tab, setTab] = useState<ReportTab>('global');
  const [preset, setPreset] = useState<DatePreset>('month');
  const [customStart, setCustomStart] = useState(toInputDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(toInputDate());

  const { start, end } = useMemo(
    () => getDateRangeForPreset(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const periodLabel = `${formatDateFR(start)} - ${formatDateFR(end)}`;

  const reportData = useMemo(() => {
    const pRentals = rentals.filter((r) => isWithinRange(r.exit_at, start, end));
    const pReturns = returns.filter((r) => isWithinRange(r.returned_at, start, end));
    const pSales = sales.filter((s) => isWithinRange(s.sale_date, start, end));
    const pServices = services.filter((s) => isWithinRange(s.service_date, start, end));
    const pPayments = payments.filter((p) => isWithinRange(p.payment_date, start, end));
    const pExpenses = expenses.filter((e) => isWithinRange(e.expense_date, start, end));
    const pMaint = maintenanceRecords.filter((m) => isWithinRange(m.maintenance_date, start, end));

    const caLocations = pRentals.filter((r) => r.status !== 'annulee').reduce((s, r) => s + Number(r.total_amount), 0);
    const caSales = pSales.reduce((s, x) => s + Number(x.total_amount), 0);
    const caServices = pServices.filter((s) => s.status !== 'annule').reduce((s, x) => s + Number(x.agreed_price), 0);
    const caFacture = caLocations + caSales + caServices;

    const encaissements = pPayments.reduce((s, p) => s + Number(p.amount), 0);
    const coutAchatVentes = pSales.reduce((s, x) => s + Number(x.total_cost), 0);
    const totalDepenses = pExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const coutMaintenance = pMaint.reduce((s, m) => s + Number(m.cost), 0);

    const creancesClients =
      rentals.filter((r) => r.status !== 'annulee').reduce((s, r) => s + Math.max(0, r.total_amount - r.amount_paid), 0) +
      sales.reduce((s, x) => s + Math.max(0, x.total_amount - x.amount_paid), 0) +
      services.filter((s) => s.status !== 'annule').reduce((s, x) => s + Math.max(0, x.agreed_price - x.amount_paid), 0);

    const resultatNetEstime = encaissements - coutAchatVentes - totalDepenses - coutMaintenance;

    const receivablesRows = [
      ...rentals
        .filter((r) => r.status !== 'annulee' && r.total_amount - r.amount_paid > 0.01)
        .map((r) => ['Location', r.reference, r.customer_name, formatDZD(r.total_amount), formatDZD(r.amount_paid), formatDZD(r.total_amount - r.amount_paid)]),
      ...sales
        .filter((s) => s.total_amount - s.amount_paid > 0.01)
        .map((s) => ['Vente', s.reference, s.customer_name, formatDZD(s.total_amount), formatDZD(s.amount_paid), formatDZD(s.total_amount - s.amount_paid)]),
      ...services
        .filter((s) => s.status !== 'annule' && s.agreed_price - s.amount_paid > 0.01)
        .map((s) => ['Service', s.reference, s.customer_name, formatDZD(s.agreed_price), formatDZD(s.amount_paid), formatDZD(s.agreed_price - s.amount_paid)]),
    ];

    return {
      globalIndicators: [
        {
          label: "Chiffre d'affaires facturé",
          value: formatDZD(caFacture),
          formula: 'Somme des locations + ventes + services facturés sur la période',
        },
        {
          label: 'Encaissements réels',
          value: formatDZD(encaissements),
          formula: 'Somme des paiements réellement reçus en caisse/banque sur la période',
        },
        {
          label: 'Créances clients (solde global)',
          value: formatDZD(creancesClients),
          formula: 'Total facturé actif moins total des paiements reçus (toutes périodes)',
        },
        {
          label: "Coût d'achat des ventes",
          value: formatDZD(coutAchatVentes),
          formula: "Somme des (quantité vendue × prix d'achat unitaire) sur la période",
        },
        {
          label: 'Dépenses opérationnelles',
          value: formatDZD(totalDepenses),
          formula: 'Somme des dépenses enregistrées sur la période',
        },
        {
          label: 'Coûts de maintenance',
          value: formatDZD(coutMaintenance),
          formula: 'Somme des coûts de réparation enregistrés sur la période',
        },
        {
          label: 'Résultat net estimé (trésorerie ajustée)',
          value: formatDZD(resultatNetEstime),
          formula: "Encaissements réels − Coût d'achat des ventes − Dépenses − Coûts de maintenance",
        },
      ],
      tables: {
        global: {
          title: 'Rapport financier global',
          headers: ['Indicateur', 'Montant', 'Méthode de calcul'],
          rows: [
            ["Chiffre d'affaires facturé", formatDZD(caFacture), 'Locations + Ventes + Services facturés'],
            ['Encaissements réels', formatDZD(encaissements), 'Paiements effectivement encaissés'],
            ['Créances clients', formatDZD(creancesClients), 'Reste dû sur factures non soldées'],
            ["Coût d'achat des ventes", formatDZD(coutAchatVentes), "Base prix d'achat des articles vendus"],
            ['Dépenses', formatDZD(totalDepenses), 'Charges enregistrées sur la période'],
            ['Coûts de maintenance', formatDZD(coutMaintenance), 'Réparations enregistrées sur la période'],
            ['Résultat net estimé', formatDZD(resultatNetEstime), "Encaissements − Coût d'achat − Dépenses − Maintenance"],
          ],
        },
        locations: {
          title: 'Rapport des locations',
          headers: ['Réf.', 'Client', 'Date sortie', 'Retour prévu', 'Statut', 'Total', 'Payé', 'Reste'],
          rows: pRentals.map((r) => [
            r.reference,
            r.customer_name,
            formatDateFR(r.exit_at),
            formatDateFR(r.expected_return_at),
            r.status,
            formatDZD(r.total_amount),
            formatDZD(r.amount_paid),
            formatDZD(Math.max(0, r.total_amount - r.amount_paid)),
          ]),
        },
        retours: {
          title: 'Rapport des retours',
          headers: ['Réf. Retour', 'Client', 'Date retour', 'Frais appliqués', 'Remarques'],
          rows: pReturns.map((r) => [
            r.reference,
            r.customer_name,
            formatDateFR(r.returned_at),
            formatDZD(r.additional_charges),
            r.remarks || '—',
          ]),
        },
        ventes: {
          title: 'Rapport des ventes',
          headers: ['Réf.', 'Date', 'Client', 'Total vente', "Coût d'achat", 'Encaissé', 'Reste'],
          rows: pSales.map((s) => [
            s.reference,
            formatDateFR(s.sale_date),
            s.customer_name,
            formatDZD(s.total_amount),
            formatDZD(s.total_cost),
            formatDZD(s.amount_paid),
            formatDZD(Math.max(0, s.total_amount - s.amount_paid)),
          ]),
        },
        services: {
          title: 'Rapport des services techniques',
          headers: ['Réf.', 'Date', 'Client', 'Type', 'Statut', 'Prix convenu', 'Payé', 'Reste'],
          rows: pServices.map((s) => [
            s.reference,
            formatDateFR(s.service_date),
            s.customer_name,
            s.service_type_name,
            s.status,
            formatDZD(s.agreed_price),
            formatDZD(s.amount_paid),
            formatDZD(Math.max(0, s.agreed_price - s.amount_paid)),
          ]),
        },
        paiements: {
          title: 'Rapport des paiements',
          headers: ['Réf.', 'Date', 'Client', 'Opération', 'Mode', 'Montant'],
          rows: pPayments.map((p) => [
            p.reference,
            formatDateFR(p.payment_date),
            p.customer_name,
            `${p.operation_type} ${p.operation_reference}`,
            p.payment_method,
            formatDZD(p.amount),
          ]),
        },
        creances: {
          title: 'Rapport des créances clients',
          headers: ['Type', 'Réf.', 'Client', 'Facturé', 'Payé', 'Reste dû'],
          rows: receivablesRows,
        },
        depenses: {
          title: 'Rapport des dépenses',
          headers: ['Réf.', 'Date', 'Catégorie', 'Description', 'Mode', 'Montant'],
          rows: pExpenses.map((e) => [
            e.reference,
            formatDateFR(e.expense_date),
            e.category_name,
            e.description,
            e.payment_method,
            formatDZD(e.amount),
          ]),
        },
        stock: {
          title: 'Rapport du stock matériel',
          headers: ['Réf.', 'Désignation', 'Dispo. Loc.', 'Loué', 'Dispo. Vente', 'Maint.', 'Endomm.'],
          rows: equipment
            .filter((e) => !e.is_archived)
            .map((e) => [
              e.reference,
              e.designation,
              formatQty(e.qty_rental_available),
              formatQty(e.qty_rented),
              formatQty(e.qty_sale_available),
              formatQty(e.qty_maintenance),
              formatQty(e.qty_damaged),
            ]),
        },
        maintenance: {
          title: 'Rapport de maintenance',
          headers: ['Réf.', 'Date', 'Matériel', 'Type', 'Technicien', 'Statut', 'Coût'],
          rows: pMaint.map((m) => [
            m.reference,
            formatDateFR(m.maintenance_date),
            m.equipment_designation,
            m.maintenance_type,
            m.technician_or_supplier || '—',
            m.status,
            formatDZD(m.cost),
          ]),
        },
      },
    };
  }, [equipment, rentals, returns, sales, services, payments, expenses, maintenanceRecords, start, end]);

  const activeTable = reportData.tables[tab];

  return (
    <div className="space-y-6">
      {/* Période & Exports */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F4F6FA] rounded-lg">
          {(
            [
              { id: 'today', label: 'Journalier' },
              { id: 'week', label: 'Hebdomadaire' },
              { id: 'month', label: 'Mensuel' },
              { id: 'year', label: 'Annuel' },
              { id: 'custom', label: 'Personnalisé' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium ${
                preset === p.id ? 'bg-white text-[#172B4D] shadow-xs' : 'text-[#718096]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="min-h-[38px] px-2.5 rounded-lg border border-slate-300" />
            <span>au</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="min-h-[38px] px-2.5 rounded-lg border border-slate-300" />
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              exportRowsToExcel(
                `batigest-${tab}`,
                activeTable.title,
                activeTable.headers,
                activeTable.rows
              )
            }
            className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#172B4D] text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#16A085]" />
            <span>Excel (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={() =>
              generateReportPdf(
                activeTable.title,
                periodLabel,
                activeTable.headers,
                activeTable.rows,
                tab === 'global'
                  ? reportData.globalIndicators.map((i) => `${i.label} : ${i.value}`)
                  : [`Période : ${periodLabel}`, `Lignes : ${activeTable.rows.length}`],
                companySettings
              )
            }
            className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#172B4D] hover:bg-[#1E365F] text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <FileDown className="w-4 h-4" />
            <span>Exporter PDF</span>
          </button>
        </div>
      </div>

      {/* Onglets des 10 rapports */}
      <div className="flex flex-wrap gap-1.5">
        {REPORT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              tab === t.id
                ? 'bg-[#172B4D] text-white border-[#172B4D]'
                : 'bg-white text-[#202B3C] border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Vue spécifique Rapport Financier Global avec formules explicites */}
      {tab === 'global' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reportData.globalIndicators.map((ind) => (
            <div key={ind.label} className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
              <div className="text-xs font-semibold text-[#718096]">{ind.label}</div>
              <div className="text-lg font-bold text-[#172B4D] tabular-nums">{ind.value}</div>
              <div className="text-[11px] text-[#718096] leading-snug pt-1 border-t border-slate-100">
                Formule : {ind.formula}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tableau du rapport sélectionné */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[#172B4D]">{activeTable.title}</h2>
          <span className="text-xs text-[#718096] tabular-nums">{periodLabel}</span>
        </div>

        {activeTable.rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#718096]">
            Aucune donnée disponible pour ce rapport sur la période sélectionnée.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F4F6FA] border-b border-slate-200 text-[#718096]">
                  {activeTable.headers.map((h) => (
                    <th key={h} className="py-3 px-4 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeTable.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="py-2.5 px-4 tabular-nums text-[#202B3C]">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
