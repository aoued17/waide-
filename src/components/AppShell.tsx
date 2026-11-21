import React, { useState } from 'react';
import {
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Hammer,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  RefreshCw,
  RotateCcw,
  Settings,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  WifiOff,
  Wrench,
  X,
  AlertCircle,
} from 'lucide-react';
import { useErp } from '../context/ErpContext';
import { useOnlineStatus } from '../lib/pwa';
import type { NavSection } from '../types/erp';

export interface NavItemConfig {
  id: NavSection;
  label: string;
  arLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', label: 'Tableau de bord', arLabel: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'rentals', label: 'Locations', arLabel: 'الكراء', icon: ClipboardList },
  { id: 'returns', label: 'Retours', arLabel: 'إرجاع المعدات', icon: RotateCcw },
  { id: 'equipment', label: 'Matériel', arLabel: 'المعدات', icon: Package },
  { id: 'sales', label: 'Ventes', arLabel: 'المبيعات', icon: ShoppingCart },
  { id: 'services', label: 'Services', arLabel: 'الخدمات التقنية', icon: Hammer },
  { id: 'customers', label: 'Clients', arLabel: 'الزبائن', icon: Users },
  { id: 'suppliers', label: 'Fournisseurs', arLabel: 'الموردين', icon: Truck },
  { id: 'stock', label: 'Stock', arLabel: 'المخزون', icon: Boxes },
  { id: 'payments', label: 'Paiements', arLabel: 'المدفوعات', icon: CreditCard },
  { id: 'expenses', label: 'Dépenses', arLabel: 'المصاريف', icon: Receipt },
  { id: 'maintenance', label: 'Maintenance', arLabel: 'الصيانة', icon: Wrench },
  { id: 'reports', label: 'Rapports', arLabel: 'التقارير', icon: BarChart3 },
  { id: 'account', label: 'Compte & Utilisateurs', arLabel: 'الحساب والمستخدمين', icon: UserCog },
  { id: 'settings', label: 'Paramètres', arLabel: 'الإعدادات', icon: Settings },
];

interface AppShellProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onQuickAction: (action: 'new_rental' | 'new_sale') => void;
  children: React.ReactNode;
}

export function AppShell({
  activeSection,
  onSelectSection,
  onQuickAction,
  children,
}: AppShellProps) {
  const { session, profile, companySettings, refreshAll, dataLoading, signOut, toasts, dismissToast } = useErp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isOnline = useOnlineStatus();

  const currentNav = NAV_ITEMS.find((n) => n.id === activeSection) ?? NAV_ITEMS[0];

  const handleSelect = (id: NavSection) => {
    onSelectSection(id);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F4F6FA] text-[#202B3C] flex">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#172B4D]/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[264px] bg-[#172B4D] text-white flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 shrink-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-[#1E365F] flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#FF8A24] flex items-center justify-center font-bold text-white shrink-0">
              BG
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold tracking-tight truncate">
                {companySettings?.company_name || 'BatiGest'}
              </div>
              <div className="text-[11px] text-slate-300 truncate">
                Gestion commerciale &amp; location
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white"
            aria-label="Fermer le menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeSection;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`w-full min-h-[44px] px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-left transition-colors ${
                  active
                    ? 'bg-[#FF8A24] text-white font-semibold'
                    : 'text-slate-200 hover:bg-[#1E365F] hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-sm truncate">{item.label}</span>
                </span>
                <span
                  className={`font-arabic text-[11px] shrink-0 ${
                    active ? 'text-white/90' : 'text-slate-400'
                  }`}
                >
                  {item.arLabel}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#1E365F] space-y-3">
          <button
            type="button"
            onClick={() => handleSelect('account')}
            className="w-full text-left min-w-0 rounded-lg p-1.5 -m-1.5 hover:bg-[#1E365F] transition-colors"
            title="Gérer mon compte et les utilisateurs"
          >
            <div className="text-xs font-semibold text-white truncate">
              {profile?.full_name || 'Utilisateur'}
            </div>
            <div className="text-[11px] text-slate-300 truncate">
              {session?.user?.email || profile?.email || ''} · {profile?.role === 'admin' ? 'Administrateur' : profile?.role === 'manager' ? 'Responsable' : 'Opérateur'}
            </div>
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-[#1E365F] hover:bg-red-600/80 text-slate-100 text-xs font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden min-h-[42px] min-w-[42px] flex items-center justify-center rounded-lg border border-slate-200 text-[#172B4D] hover:bg-slate-50"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-base sm:text-lg font-bold text-[#172B4D] truncate">
                <span>{currentNav.label}</span>
                <span className="text-slate-300 font-normal hidden sm:inline">·</span>
                <span className="font-arabic text-xs font-medium text-[#718096] hidden sm:inline">
                  {currentNav.arLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => void signOut()}
              title="Se déconnecter"
              className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 hover:text-[#E74C3C] text-[#172B4D] text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={dataLoading}
              title="Actualiser les données"
              className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[#172B4D] text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${dataLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
            <button
              type="button"
              onClick={() => onQuickAction('new_rental')}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#FF8A24] hover:bg-[#E87612] text-white text-xs sm:text-sm font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="w-4 h-4" />
              <span>Nouvelle location</span>
            </button>
          </div>
        </header>

        {/* Toast Stack */}
        {toasts.length > 0 && (
          <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm w-full px-4 sm:px-0">
            {toasts.map((t) => (
              <div
                key={t.id}
                className={`p-3.5 rounded-xl border shadow-md bg-white flex items-start gap-2.5 text-sm ${
                  t.type === 'error'
                    ? 'border-red-300 text-[#E74C3C]'
                    : t.type === 'success'
                    ? 'border-emerald-300 text-[#16A085]'
                    : 'border-slate-300 text-[#172B4D]'
                }`}
              >
                {t.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span className="flex-1 text-[#202B3C] text-xs leading-relaxed">{t.message}</span>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="text-slate-400 hover:text-slate-700"
                  aria-label="Fermer la notification"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {!isOnline && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-[#F4B942] shrink-0" />
              <span>
                Mode hors ligne — Vérifiez votre connexion Internet pour synchroniser les opérations avec la base de données.
              </span>
            </div>
            <span className="font-arabic text-amber-800" dir="rtl">
              لا يوجد اتصال بالإنترنت
            </span>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
