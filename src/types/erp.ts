export type NavSection =
  | 'dashboard'
  | 'rentals'
  | 'returns'
  | 'equipment'
  | 'sales'
  | 'services'
  | 'customers'
  | 'suppliers'
  | 'stock'
  | 'payments'
  | 'expenses'
  | 'maintenance'
  | 'reports'
  | 'account'
  | 'settings';

export type UserRole = 'admin' | 'manager' | 'operator';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface CompanySettings {
  id: number;
  company_name: string;
  subtitle: string;
  address: string;
  phone: string;
  email: string;
  nif: string;
  nis: string;
  rc: string;
  art_imp: string;
  invoice_footer: string;
  late_fee_enabled: boolean;
  late_fee_rate_per_day: number;
  payment_methods: string[];
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  is_archived: boolean;
  created_at: string;
}

export interface Unit {
  id: string;
  name: string;
  symbol: string;
  is_archived: boolean;
  created_at: string;
}

export type ActivityType = 'location' | 'vente' | 'location_et_vente';
export type TrackingMode = 'quantite' | 'individuel';
export type EquipmentStatus = 'disponible' | 'en_location' | 'en_maintenance' | 'endommage' | 'archive';

export interface Equipment {
  id: string;
  reference: string;
  designation: string;
  category_id: string | null;
  category_name: string;
  description: string;
  image_url: string;
  unit_id: string | null;
  unit_name: string;
  activity_type: ActivityType;
  tracking_mode: TrackingMode;
  is_scaffolding_component: boolean;
  qty_rental_available: number;
  qty_rented: number;
  qty_sale_available: number;
  qty_maintenance: number;
  qty_damaged: number;
  min_stock_alert: number;
  purchase_price: number;
  sale_price: number;
  indicative_rental_price: number;
  indicative_rental_period: string;
  status: EquipmentStatus;
  notes: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface EquipmentUnit {
  id: string;
  equipment_id: string;
  serial_number: string;
  internal_code: string;
  pool_purpose: 'location' | 'vente';
  status: 'disponible' | 'en_location' | 'en_maintenance' | 'endommage' | 'vendu' | 'archive';
  condition_notes: string;
  created_at: string;
}

export interface ScaffoldingPackage {
  id: string;
  name: string;
  description: string;
  is_archived: boolean;
  created_at: string;
  items?: ScaffoldingPackageItem[];
}

export interface ScaffoldingPackageItem {
  id: string;
  package_id: string;
  equipment_id: string;
  default_qty: number;
}

export type CustomerType = 'particulier' | 'entreprise' | 'artisan' | 'institution';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  customer_type: CustomerType;
  tax_id: string;
  notes: string;
  is_archived: boolean;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  contact_person: string;
  notes: string;
  is_archived: boolean;
  created_at: string;
}

export interface SupplierPurchase {
  id: string;
  reference: string;
  supplier_id: string;
  supplier_name: string;
  purchase_date: string;
  description: string;
  total_amount: number;
  amount_paid: number;
  notes: string;
  created_at: string;
}

export interface SupplierPayment {
  id: string;
  reference: string;
  supplier_id: string;
  purchase_id: string | null;
  payment_date: string;
  amount: number;
  payment_method: string;
  notes: string;
  created_at: string;
}

export type RentalStatus =
  | 'en_preparation'
  | 'en_cours'
  | 'partiellement_retournee'
  | 'terminee'
  | 'en_retard'
  | 'annulee';

export type PricingType = 'heure' | 'jour' | 'semaine' | 'mois' | 'personnalise' | 'selon_accord';

export interface Rental {
  id: string;
  reference: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  exit_at: string;
  expected_return_at: string;
  actual_return_at: string | null;
  additional_fees: number;
  discount: number;
  deposit_amount: number;
  subtotal_amount: number;
  total_amount: number;
  amount_paid: number;
  payment_method: string;
  status: RentalStatus;
  condition_at_exit: string;
  notes: string;
  created_at: string;
  items?: RentalItem[];
}

export interface RentalItem {
  id: string;
  rental_id: string;
  equipment_id: string;
  equipment_ref: string;
  equipment_designation: string;
  unit_name: string;
  equipment_unit_id: string | null;
  serial_number: string;
  qty_rented: number;
  qty_returned: number;
  qty_damaged: number;
  qty_missing: number;
  pricing_type: PricingType;
  duration_value: number;
  unit_price: number;
  line_total: number;
}

export type ReturnCondition = 'bon_etat' | 'endommage' | 'incomplet' | 'necessite_maintenance';

export interface RentalReturn {
  id: string;
  reference: string;
  rental_id: string;
  customer_id: string;
  customer_name: string;
  returned_at: string;
  additional_charges: number;
  remarks: string;
  created_at: string;
  items?: RentalReturnItem[];
}

export interface RentalReturnItem {
  id: string;
  return_id: string;
  rental_item_id: string;
  equipment_id: string;
  equipment_designation: string;
  qty_returned_now: number;
  qty_missing_now: number;
  condition: ReturnCondition;
  damage_notes: string;
}

export interface Sale {
  id: string;
  reference: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  sale_date: string;
  discount: number;
  subtotal_amount: number;
  total_amount: number;
  total_cost: number;
  amount_paid: number;
  payment_method: string;
  notes: string;
  created_at: string;
  items?: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  equipment_id: string;
  equipment_ref: string;
  equipment_designation: string;
  unit_name: string;
  qty: number;
  purchase_price_snapshot: number;
  unit_price: number;
  line_total: number;
}

export interface ServiceType {
  id: string;
  name: string;
  description: string;
  is_archived: boolean;
  created_at: string;
}

export type ServiceStatus = 'en_attente' | 'en_cours' | 'termine' | 'livre' | 'annule';

export interface ServiceOrder {
  id: string;
  reference: string;
  customer_id: string;
  customer_name: string;
  service_type_id: string | null;
  service_type_name: string;
  description: string;
  service_date: string;
  expected_start_date: string | null;
  expected_end_date: string | null;
  actual_end_date: string | null;
  agreed_price: number;
  amount_paid: number;
  status: ServiceStatus;
  notes: string;
  attachment_url: string;
  created_at: string;
  interventions?: ServiceIntervention[];
}

export interface ServiceIntervention {
  id: string;
  service_id: string;
  site_address: string;
  intervention_date: string;
  description: string;
  assigned_employees: string;
  equipment_used: string;
  transport_expense: number;
  labor_expense: number;
  status: 'planifiee' | 'en_cours' | 'terminee';
  notes: string;
  created_at: string;
}

export interface PaymentRecord {
  id: string;
  reference: string;
  payment_date: string;
  customer_id: string;
  customer_name: string;
  operation_type: 'location' | 'vente' | 'service' | 'compte';
  rental_id: string | null;
  sale_id: string | null;
  service_id: string | null;
  operation_reference: string;
  amount: number;
  payment_method: string;
  notes: string;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string;
  is_archived: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  reference: string;
  expense_date: string;
  category_id: string | null;
  category_name: string;
  description: string;
  amount: number;
  payment_method: string;
  supplier_id: string | null;
  supplier_name: string;
  related_operation: string;
  receipt_ref: string;
  notes: string;
  created_at: string;
}

export type MaintenanceStatus = 'a_verifier' | 'en_reparation' | 'en_attente' | 'termine';

export interface MaintenanceRecord {
  id: string;
  reference: string;
  equipment_id: string;
  equipment_designation: string;
  equipment_unit_id: string | null;
  source_pool: 'location' | 'vente' | 'endommage';
  qty: number;
  maintenance_type: string;
  maintenance_date: string;
  problem_description: string;
  repair_details: string;
  cost: number;
  technician_or_supplier: string;
  start_date: string | null;
  completion_date: string | null;
  status: MaintenanceStatus;
  notes: string;
  created_at: string;
}

export type StockMovementType =
  | 'entree_stock'
  | 'sortie_location'
  | 'retour_location'
  | 'vente'
  | 'retour_vente'
  | 'transfert_usage'
  | 'mise_maintenance'
  | 'sortie_reparation'
  | 'ajustement_manuel';

export interface StockMovement {
  id: string;
  reference: string;
  movement_at: string;
  equipment_id: string;
  equipment_designation: string;
  stock_pool: 'location' | 'vente' | 'maintenance' | 'endommage';
  movement_type: StockMovementType;
  quantity: number;
  previous_qty: number;
  new_qty: number;
  related_operation: string;
  user_name: string;
  notes: string;
}

export type DatePreset = 'today' | 'week' | 'month' | 'year' | 'custom';
