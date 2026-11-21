import React from 'react';
import { formatDZD, formatQty } from '../../lib/formatters';

export interface MonthlySeriesPoint {
  label: string;
  revenue: number;
  expenses: number;
  rentalsCount: number;
}

export function DualBarChart({
  data,
  mode,
}: {
  data: MonthlySeriesPoint[];
  mode: 'revenue' | 'expenses' | 'comparison' | 'rentals';
}) {
  const maxVal = Math.max(
    1,
    ...data.map((d) =>
      mode === 'revenue'
        ? d.revenue
        : mode === 'expenses'
        ? d.expenses
        : mode === 'rentals'
        ? d.rentalsCount
        : Math.max(d.revenue, d.expenses)
    )
  );

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-[#718096]">
        Aucune donnée sur cette période.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-48 flex items-end gap-2 pt-4 pb-1 border-b border-slate-200">
        {data.map((pt) => {
          const revH = Math.max(2, Math.round((pt.revenue / maxVal) * 148));
          const expH = Math.max(2, Math.round((pt.expenses / maxVal) * 148));
          const rentH = Math.max(2, Math.round((pt.rentalsCount / maxVal) * 148));

          return (
            <div key={pt.label} className="flex-1 min-w-0 flex flex-col items-center group relative">
              <div className="w-full flex items-end justify-center gap-1 h-[152px]">
                {(mode === 'revenue' || mode === 'comparison') && (
                  <div
                    className="w-full max-w-[20px] rounded-t bg-[#172B4D] transition-opacity group-hover:opacity-85"
                    style={{ height: `${pt.revenue > 0 ? revH : 2}px` }}
                    title={`${pt.label} — Revenus : ${formatDZD(pt.revenue)}`}
                  />
                )}
                {(mode === 'expenses' || mode === 'comparison') && (
                  <div
                    className="w-full max-w-[20px] rounded-t bg-[#FF8A24] transition-opacity group-hover:opacity-85"
                    style={{ height: `${pt.expenses > 0 ? expH : 2}px` }}
                    title={`${pt.label} — Dépenses : ${formatDZD(pt.expenses)}`}
                  />
                )}
                {mode === 'rentals' && (
                  <div
                    className="w-full max-w-[26px] rounded-t bg-[#16A085] transition-opacity group-hover:opacity-85"
                    style={{ height: `${pt.rentalsCount > 0 ? rentH : 2}px` }}
                    title={`${pt.label} — Locations : ${formatQty(pt.rentalsCount)}`}
                  />
                )}
              </div>
              <span className="text-[11px] text-[#718096] mt-2 truncate max-w-full tabular-nums">
                {pt.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-[#718096]">
        {(mode === 'revenue' || mode === 'comparison') && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#172B4D]" />
            Revenus (encaissements)
          </span>
        )}
        {(mode === 'expenses' || mode === 'comparison') && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#FF8A24]" />
            Dépenses
          </span>
        )}
        {mode === 'rentals' && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#16A085]" />
            Nombre de locations
          </span>
        )}
      </div>
    </div>
  );
}

export interface UtilizationSlice {
  label: string;
  value: number;
  color: string;
}

export function EquipmentUtilizationBar({ slices }: { slices: UtilizationSlice[] }) {
  const total = slices.reduce((acc, s) => acc + s.value, 0);

  if (total === 0) {
    return (
      <div className="py-10 text-center text-sm text-[#718096]">
        Aucun matériel enregistré pour calculer l&apos;utilisation.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="h-5 w-full rounded-lg overflow-hidden bg-slate-100 flex">
        {slices.map((s) => {
          const pct = (s.value / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={s.label}
              style={{ width: `${pct}%`, backgroundColor: s.color }}
              title={`${s.label} : ${formatQty(s.value)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {slices.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <div key={s.label} className="flex items-center justify-between py-2 border-b border-slate-100">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-xs shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-[#202B3C] truncate">{s.label}</span>
              </div>
              <span className="text-xs font-semibold text-[#172B4D] tabular-nums ml-2">
                {formatQty(s.value)} ({pct.toFixed(0)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
