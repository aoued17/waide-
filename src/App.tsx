/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ErpProvider, useErp } from './context/ErpContext';
import { isSupabaseConfigured } from './lib/supabase';
import type { NavSection } from './types/erp';
import { SetupScreen } from './components/SetupScreen';
import { AuthScreen } from './components/AuthScreen';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/ui/States';
import { DashboardPage } from './pages/DashboardPage';
import { RentalsPage } from './pages/RentalsPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { EquipmentPage } from './pages/EquipmentPage';
import { SalesPage } from './pages/SalesPage';
import { ServicesPage } from './pages/ServicesPage';
import { CustomersPage } from './pages/CustomersPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { StockPage } from './pages/StockPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { MaintenancePage } from './pages/MaintenancePage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AccountUsersSection } from './components/AccountUsersSection';

function MainRouter() {
  const { session, authLoading, dataError, refreshAll } = useErp();
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [autoOpenNewRental, setAutoOpenNewRental] = useState(false);

  if (!isSupabaseConfigured) {
    return <SetupScreen />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F4F6FA] flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <LoadingState message="Vérification de la session BatiGest..." />
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  const handleQuickAction = (action: 'new_rental' | 'new_sale') => {
    if (action === 'new_rental') {
      setActiveSection('rentals');
      setAutoOpenNewRental(true);
    } else {
      setActiveSection('sales');
    }
  };

  return (
    <AppShell
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      onQuickAction={handleQuickAction}
    >
      {dataError && (
        <div className="mb-6 bg-white border border-red-300 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#E74C3C]">
          <div>
            <strong>Erreur base de données :</strong> {dataError}. Vérifiez que le script{' '}
            <code className="font-mono bg-red-50 px-1 rounded">supabase/schema.sql</code> a bien été exécuté.
          </div>
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#E74C3C] text-white font-semibold"
          >
            Réessayer
          </button>
        </div>
      )}

      {activeSection === 'dashboard' && <DashboardPage onNavigate={setActiveSection} />}
      {activeSection === 'rentals' && (
        <RentalsPage
          autoOpenNew={autoOpenNewRental}
          onClearAutoOpen={() => setAutoOpenNewRental(false)}
        />
      )}
      {activeSection === 'returns' && <ReturnsPage />}
      {activeSection === 'equipment' && <EquipmentPage />}
      {activeSection === 'sales' && <SalesPage />}
      {activeSection === 'services' && <ServicesPage />}
      {activeSection === 'customers' && <CustomersPage />}
      {activeSection === 'suppliers' && <SuppliersPage />}
      {activeSection === 'stock' && <StockPage />}
      {activeSection === 'payments' && <PaymentsPage />}
      {activeSection === 'expenses' && <ExpensesPage />}
      {activeSection === 'maintenance' && <MaintenancePage />}
      {activeSection === 'reports' && <ReportsPage />}
      {activeSection === 'account' && <AccountUsersSection />}
      {activeSection === 'settings' && <SettingsPage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <ErpProvider>
      <MainRouter />
    </ErpProvider>
  );
}
