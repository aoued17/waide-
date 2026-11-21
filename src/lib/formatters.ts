import type { DatePreset, Rental } from '../types/erp';

export function formatDZD(amount: number | string | null | undefined): string {
  const num = Number(amount ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe) + ' DA'
  );
}

export function formatQty(val: number | string | null | undefined): string {
  const num = Number(val ?? 0);
  const safe = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: safe % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatDateFR(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTimeFR(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '—';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (Number.isNaN(d.getTime())) return '—';
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${formatDateFR(d)} ${hours}:${mins}`;
}

export function toInputDate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toInputTime(date: Date = new Date()): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function isRentalOverdue(rental: Rental, now: Date = new Date()): boolean {
  if (rental.status === 'terminee' || rental.status === 'annulee') return false;
  if (rental.status === 'en_retard') return true;
  const expected = new Date(rental.expected_return_at);
  return !Number.isNaN(expected.getTime()) && now.getTime() > expected.getTime();
}

export function computeLateDuration(expectedReturnAt: string, endRef?: string | null): { days: number; hours: number; totalHours: number } {
  const expected = new Date(expectedReturnAt);
  const actual = endRef ? new Date(endRef) : new Date();
  const diffMs = actual.getTime() - expected.getTime();
  if (diffMs <= 0 || Number.isNaN(diffMs)) return { days: 0, hours: 0, totalHours: 0 };
  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return { days, hours, totalHours };
}

export function getDateRangeForPreset(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string
): { start: Date; end: Date } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (preset === 'today') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
      end: endOfToday,
    };
  }
  if (preset === 'week') {
    const day = now.getDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0);
    return { start: monday, end: endOfToday };
  }
  if (preset === 'month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      end: endOfToday,
    };
  }
  if (preset === 'year') {
    return {
      start: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
      end: endOfToday,
    };
  }
  const s = customStart ? new Date(customStart + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
  const e = customEnd ? new Date(customEnd + 'T23:59:59.999') : endOfToday;
  return { start: s, end: e };
}

export function isWithinRange(dateStr: string | null | undefined, start: Date, end: Date): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}
