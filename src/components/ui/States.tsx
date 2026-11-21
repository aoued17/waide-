import React from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock,
  Hammer,
  Package,
  Wrench,
  XCircle,
} from 'lucide-react';

export function LoadingState({ message = 'Chargement des données...' }: { message?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
      <div className="flex items-center gap-3 text-sm text-[#718096]">
        <div className="w-4 h-4 border-2 border-[#172B4D] border-t-transparent rounded-full animate-spin" />
        <span>{message}</span>
      </div>
      <div className="space-y-2">
        <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-9 bg-slate-100 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  arTitle?: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, arTitle, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-xl bg-[#F4F6FA] border border-slate-200 flex items-center justify-center text-[#172B4D] mb-4">
        <Package className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-[#172B4D]">{title}</h3>
      {arTitle && <p className="font-arabic text-xs text-[#718096] mt-0.5">{arTitle}</p>}
      <p className="text-sm text-[#718096] mt-2 max-w-md">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 min-h-[42px] px-5 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-sm font-medium transition-colors whitespace-nowrap"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

type StatusTone = 'success' | 'warning' | 'danger' | 'navy' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'text-[#16A085]',
  warning: 'text-[#C2820A]',
  danger: 'text-[#E74C3C]',
  navy: 'text-[#172B4D]',
  neutral: 'text-[#718096]',
};

export function StatusText({
  tone,
  label,
  icon = 'check',
}: {
  tone: StatusTone;
  label: string;
  icon?: 'check' | 'clock' | 'alert' | 'wrench' | 'archive' | 'cancel' | 'work';
}) {
  const IconComp =
    icon === 'clock'
      ? Clock
      : icon === 'alert'
      ? AlertTriangle
      : icon === 'wrench'
      ? Wrench
      : icon === 'archive'
      ? Archive
      : icon === 'cancel'
      ? XCircle
      : icon === 'work'
      ? Hammer
      : CheckCircle2;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[tone]}`}>
      <IconComp className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}
