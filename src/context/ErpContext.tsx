import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { formatDbError, isSupabaseConfigured, supabase } from '../lib/supabase';
import type {
  Category,
  CompanySettings,
  Customer,
  Equipment,
  EquipmentUnit,
  Expense,
  ExpenseCategory,
  MaintenanceRecord,
  PaymentRecord,
  Rental,
  RentalReturn,
  Sale,
  ScaffoldingPackage,
  ServiceOrder,
  ServiceType,
  StockMovement,
  Supplier,
  SupplierPayment,
  SupplierPurchase,
  Unit,
  UserProfile,
} from '../types/erp';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ErpContextValue {
  session: Session | null;
  authLoading: boolean;
  dataLoading: boolean;
  dataError: string | null;
  profile: UserProfile | null;
  companySettings: CompanySettings | null;
  categories: Category[];
  units: Unit[];
  equipment: Equipment[];
  equipmentUnits: EquipmentUnit[];
  scaffoldingPackages: ScaffoldingPackage[];
  customers: Customer[];
  suppliers: Supplier[];
  supplierPurchases: SupplierPurchase[];
  supplierPayments: SupplierPayment[];
  rentals: Rental[];
  returns: RentalReturn[];
  sales: Sale[];
  serviceTypes: ServiceType[];
  services: ServiceOrder[];
  payments: PaymentRecord[];
  expenseCategories: ExpenseCategory[];
  expenses: Expense[];
  maintenanceRecords: MaintenanceRecord[];
  stockMovements: StockMovement[];
  toasts: ToastMessage[];
  notify: (type: ToastMessage['type'], message: string) => void;
  dismissToast: (id: string) => void;
  refreshAll: () => Promise<void>;
  signOut: () => Promise<void>;
}

const ErpContext = createContext<ErpContextValue | null>(null);

export function ErpProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(isSupabaseConfigured);
  const [dataLoading, setDataLoading] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [equipmentUnits, setEquipmentUnits] = useState<EquipmentUnit[]>([]);
  const [scaffoldingPackages, setScaffoldingPackages] = useState<ScaffoldingPackage[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierPurchases, setSupplierPurchases] = useState<SupplierPurchase[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [returns, setReturns] = useState<RentalReturn[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [services, setServices] = useState<ServiceOrder[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((type: ToastMessage['type'], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const refreshAll = useCallback(async () => {
    if (!supabase || !session?.user) return;
    setDataLoading(true);
    setDataError(null);
    try {
      const [
        profRes,
        compRes,
        catRes,
        unitRes,
        eqRes,
        eqUnitRes,
        pkgRes,
        custRes,
        supRes,
        supPurRes,
        supPayRes,
        rentRes,
        retRes,
        saleRes,
        srvTypeRes,
        srvRes,
        payRes,
        expCatRes,
        expRes,
        mntRes,
        mvtRes,
      ] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', session.user.id).maybeSingle(),
        supabase.from('company_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('categories').select('*').order('name'),
        supabase.from('units').select('*').order('name'),
        supabase.from('equipment').select('*').order('created_at', { ascending: false }),
        supabase.from('equipment_units').select('*').order('created_at', { ascending: false }),
        supabase.from('scaffolding_packages').select('*, items:scaffolding_package_items(*)').order('name'),
        supabase.from('customers').select('*').order('name'),
        supabase.from('suppliers').select('*').order('name'),
        supabase.from('supplier_purchases').select('*').order('purchase_date', { ascending: false }),
        supabase.from('supplier_payments').select('*').order('payment_date', { ascending: false }),
        supabase.from('rentals').select('*, items:rental_items(*)').order('created_at', { ascending: false }),
        supabase.from('rental_returns').select('*, items:rental_return_items(*)').order('returned_at', { ascending: false }),
        supabase.from('sales').select('*, items:sale_items(*)').order('sale_date', { ascending: false }),
        supabase.from('service_types').select('*').order('name'),
        supabase.from('services').select('*, interventions:service_interventions(*)').order('created_at', { ascending: false }),
        supabase.from('payments').select('*').order('payment_date', { ascending: false }),
        supabase.from('expense_categories').select('*').order('name'),
        supabase.from('expenses').select('*').order('expense_date', { ascending: false }),
        supabase.from('maintenance_records').select('*').order('created_at', { ascending: false }),
        supabase.from('stock_movements').select('*').order('movement_at', { ascending: false }).limit(500),
      ]);

      const firstErr = [
        profRes.error,
        compRes.error,
        catRes.error,
        unitRes.error,
        eqRes.error,
        eqUnitRes.error,
        pkgRes.error,
        custRes.error,
        supRes.error,
        supPurRes.error,
        supPayRes.error,
        rentRes.error,
        retRes.error,
        saleRes.error,
        srvTypeRes.error,
        srvRes.error,
        payRes.error,
        expCatRes.error,
        expRes.error,
        mntRes.error,
        mvtRes.error,
      ].find(Boolean);

      if (firstErr) {
        throw firstErr;
      }

      setProfile((profRes.data as UserProfile) ?? null);
      setCompanySettings((compRes.data as CompanySettings) ?? null);
      setCategories((catRes.data as Category[]) ?? []);
      setUnits((unitRes.data as Unit[]) ?? []);
      setEquipment((eqRes.data as Equipment[]) ?? []);
      setEquipmentUnits((eqUnitRes.data as EquipmentUnit[]) ?? []);
      setScaffoldingPackages((pkgRes.data as ScaffoldingPackage[]) ?? []);
      setCustomers((custRes.data as Customer[]) ?? []);
      setSuppliers((supRes.data as Supplier[]) ?? []);
      setSupplierPurchases((supPurRes.data as SupplierPurchase[]) ?? []);
      setSupplierPayments((supPayRes.data as SupplierPayment[]) ?? []);
      setRentals((rentRes.data as Rental[]) ?? []);
      setReturns((retRes.data as RentalReturn[]) ?? []);
      setSales((saleRes.data as Sale[]) ?? []);
      setServiceTypes((srvTypeRes.data as ServiceType[]) ?? []);
      setServices((srvRes.data as ServiceOrder[]) ?? []);
      setPayments((payRes.data as PaymentRecord[]) ?? []);
      setExpenseCategories((expCatRes.data as ExpenseCategory[]) ?? []);
      setExpenses((expRes.data as Expense[]) ?? []);
      setMaintenanceRecords((mntRes.data as MaintenanceRecord[]) ?? []);
      setStockMovements((mvtRes.data as StockMovement[]) ?? []);
    } catch (err) {
      setDataError(formatDbError(err));
    } finally {
      setDataLoading(false);
    }
  }, [session?.user]);

  useEffect(() => {
    if (session?.user) {
      void refreshAll();
    }
  }, [session?.user, refreshAll]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  return (
    <ErpContext.Provider
      value={{
        session,
        authLoading,
        dataLoading,
        dataError,
        profile,
        companySettings,
        categories,
        units,
        equipment,
        equipmentUnits,
        scaffoldingPackages,
        customers,
        suppliers,
        supplierPurchases,
        supplierPayments,
        rentals,
        returns,
        sales,
        serviceTypes,
        services,
        payments,
        expenseCategories,
        expenses,
        maintenanceRecords,
        stockMovements,
        toasts,
        notify,
        dismissToast,
        refreshAll,
        signOut,
      }}
    >
      {children}
    </ErpContext.Provider>
  );
}

export function useErp(): ErpContextValue {
  const ctx = useContext(ErpContext);
  if (!ctx) throw new Error('useErp must be used within ErpProvider');
  return ctx;
}
