-- =============================================================================
-- BatiGest — Schéma PostgreSQL complet, RLS et Transactions Atomiques (Supabase)
-- Aucune donnée matériel/client prédéfinie : la base démarre entièrement vide.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PROFILS UTILISATEURS & RÔLES
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT 'Utilisateur',
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'manager', 'operator')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
  assigned_role TEXT;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_profiles;
  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'operator';
  END IF;

  INSERT INTO public.user_profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, 'Utilisateur'), '@', 1)),
    assigned_role,
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Synchronisation des comptes existants éventuels créés avant l'exécution du script
INSERT INTO public.user_profiles (id, email, full_name, role, is_active)
SELECT
  u.id,
  COALESCE(u.email, ''),
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(COALESCE(u.email, 'Utilisateur'), '@', 1)),
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.user_profiles)
      AND u.id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1)
    THEN 'admin'
    ELSE 'operator'
  END,
  TRUE
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_active = TRUE AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND is_active = TRUE AND role IN ('admin', 'manager')
  );
$$;

-- 2. PARAMÈTRES ENTREPRISE
CREATE TABLE IF NOT EXISTS public.company_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name TEXT NOT NULL DEFAULT 'BatiGest',
  subtitle TEXT NOT NULL DEFAULT 'Gestion commerciale, location et services',
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  nif TEXT DEFAULT '',
  nis TEXT DEFAULT '',
  rc TEXT DEFAULT '',
  art_imp TEXT DEFAULT '',
  invoice_footer TEXT DEFAULT 'Merci pour votre confiance.',
  late_fee_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  late_fee_rate_per_day NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_methods JSONB NOT NULL DEFAULT '["Espèces","Virement bancaire","Carte bancaire","Chèque"]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 3. TAXONOMIES DYNAMIQUES (CATÉGORIES & UNITÉS)
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  symbol TEXT DEFAULT '',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. MATÉRIEL & ÉCHAFAUDAGES (DÉMARRE VIDE)
CREATE TABLE IF NOT EXISTS public.equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  designation TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
  category_name TEXT DEFAULT '',
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  unit_id UUID REFERENCES public.units(id) ON DELETE RESTRICT,
  unit_name TEXT NOT NULL DEFAULT 'Unité',
  activity_type TEXT NOT NULL CHECK (activity_type IN ('location', 'vente', 'location_et_vente')),
  tracking_mode TEXT NOT NULL DEFAULT 'quantite' CHECK (tracking_mode IN ('quantite', 'individuel')),
  is_scaffolding_component BOOLEAN NOT NULL DEFAULT FALSE,
  qty_rental_available NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qty_rental_available >= 0),
  qty_rented NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qty_rented >= 0),
  qty_sale_available NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qty_sale_available >= 0),
  qty_maintenance NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qty_maintenance >= 0),
  qty_damaged NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qty_damaged >= 0),
  min_stock_alert NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_stock_alert >= 0),
  purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  sale_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  indicative_rental_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (indicative_rental_price >= 0),
  indicative_rental_period TEXT NOT NULL DEFAULT 'jour',
  status TEXT NOT NULL DEFAULT 'disponible' CHECK (status IN ('disponible', 'en_location', 'en_maintenance', 'endommage', 'archive')),
  notes TEXT DEFAULT '',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.equipment_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE RESTRICT,
  serial_number TEXT NOT NULL,
  internal_code TEXT NOT NULL,
  pool_purpose TEXT NOT NULL DEFAULT 'location' CHECK (pool_purpose IN ('location', 'vente')),
  status TEXT NOT NULL DEFAULT 'disponible' CHECK (status IN ('disponible', 'en_location', 'en_maintenance', 'endommage', 'vendu', 'archive')),
  condition_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (equipment_id, serial_number)
);

CREATE TABLE IF NOT EXISTS public.scaffolding_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.scaffolding_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.scaffolding_packages(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE RESTRICT,
  default_qty NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (default_qty > 0)
);

-- 5. CLIENTS & FOURNISSEURS
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  customer_type TEXT NOT NULL DEFAULT 'particulier' CHECK (customer_type IN ('particulier', 'entreprise', 'artisan', 'institution')),
  tax_id TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name TEXT NOT NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL CHECK (total_amount >= 0),
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  purchase_id UUID REFERENCES public.supplier_purchases(id) ON DELETE RESTRICT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. LOCATIONS & RETOURS
CREATE TABLE IF NOT EXISTS public.rentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT DEFAULT '',
  exit_at TIMESTAMPTZ NOT NULL,
  expected_return_at TIMESTAMPTZ NOT NULL,
  actual_return_at TIMESTAMPTZ,
  additional_fees NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (additional_fees >= 0),
  discount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  deposit_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (deposit_amount >= 0),
  subtotal_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  payment_method TEXT DEFAULT 'Espèces',
  status TEXT NOT NULL DEFAULT 'en_cours' CHECK (status IN ('en_preparation', 'en_cours', 'partiellement_retournee', 'terminee', 'en_retard', 'annulee')),
  condition_at_exit TEXT DEFAULT 'Bon état',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rental_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_id UUID NOT NULL REFERENCES public.rentals(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE RESTRICT,
  equipment_ref TEXT NOT NULL,
  equipment_designation TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  equipment_unit_id UUID REFERENCES public.equipment_units(id) ON DELETE RESTRICT,
  serial_number TEXT DEFAULT '',
  qty_rented NUMERIC(12,2) NOT NULL CHECK (qty_rented > 0),
  qty_returned NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qty_returned >= 0),
  qty_damaged NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qty_damaged >= 0),
  qty_missing NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qty_missing >= 0),
  pricing_type TEXT NOT NULL CHECK (pricing_type IN ('heure', 'jour', 'semaine', 'mois', 'personnalise', 'selon_accord')),
  duration_value NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (duration_value > 0),
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14,2) NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE IF NOT EXISTS public.rental_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  rental_id UUID NOT NULL REFERENCES public.rentals(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  returned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  additional_charges NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (additional_charges >= 0),
  remarks TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rental_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.rental_returns(id) ON DELETE CASCADE,
  rental_item_id UUID NOT NULL REFERENCES public.rental_items(id) ON DELETE RESTRICT,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE RESTRICT,
  equipment_designation TEXT NOT NULL,
  qty_returned_now NUMERIC(12,2) NOT NULL CHECK (qty_returned_now >= 0),
  qty_missing_now NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qty_missing_now >= 0),
  condition TEXT NOT NULL CHECK (condition IN ('bon_etat', 'endommage', 'incomplet', 'necessite_maintenance')),
  damage_notes TEXT DEFAULT ''
);

-- 7. VENTES DE MATÉRIEL & OUTILLAGE
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT DEFAULT '',
  sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  subtotal_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  payment_method TEXT DEFAULT 'Espèces',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE RESTRICT,
  equipment_ref TEXT NOT NULL,
  equipment_designation TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  qty NUMERIC(12,2) NOT NULL CHECK (qty > 0),
  purchase_price_snapshot NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14,2) NOT NULL CHECK (line_total >= 0)
);

-- 8. SERVICES TECHNIQUES & INTERVENTIONS
CREATE TABLE IF NOT EXISTS public.service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  service_type_id UUID REFERENCES public.service_types(id) ON DELETE RESTRICT,
  service_type_name TEXT NOT NULL,
  description TEXT NOT NULL,
  service_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_start_date DATE,
  expected_end_date DATE,
  actual_end_date DATE,
  agreed_price NUMERIC(14,2) NOT NULL CHECK (agreed_price >= 0),
  amount_paid NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status TEXT NOT NULL DEFAULT 'en_attente' CHECK (status IN ('en_attente', 'en_cours', 'termine', 'livre', 'annule')),
  notes TEXT DEFAULT '',
  attachment_url TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.service_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  site_address TEXT NOT NULL,
  intervention_date DATE NOT NULL,
  description TEXT NOT NULL,
  assigned_employees TEXT DEFAULT '',
  equipment_used TEXT DEFAULT '',
  transport_expense NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (transport_expense >= 0),
  labor_expense NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (labor_expense >= 0),
  status TEXT NOT NULL DEFAULT 'planifiee' CHECK (status IN ('planifiee', 'en_cours', 'terminee')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. PAIEMENTS (HISTORIQUE IMMUABLE)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  operation_type TEXT NOT NULL CHECK (operation_type IN ('location', 'vente', 'service', 'compte')),
  rental_id UUID REFERENCES public.rentals(id) ON DELETE RESTRICT,
  sale_id UUID REFERENCES public.sales(id) ON DELETE RESTRICT,
  service_id UUID REFERENCES public.services(id) ON DELETE RESTRICT,
  operation_reference TEXT DEFAULT '',
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. DÉPENSES & CATÉGORIES DE DÉPENSES
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  category_name TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  supplier_name TEXT DEFAULT '',
  related_operation TEXT DEFAULT '',
  receipt_ref TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. MAINTENANCE
CREATE TABLE IF NOT EXISTS public.maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE RESTRICT,
  equipment_designation TEXT NOT NULL,
  equipment_unit_id UUID REFERENCES public.equipment_units(id) ON DELETE RESTRICT,
  source_pool TEXT NOT NULL DEFAULT 'location' CHECK (source_pool IN ('location', 'vente', 'endommage')),
  qty NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (qty > 0),
  maintenance_type TEXT NOT NULL,
  maintenance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  problem_description TEXT NOT NULL,
  repair_details TEXT DEFAULT '',
  cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  technician_or_supplier TEXT DEFAULT '',
  start_date DATE,
  completion_date DATE,
  status TEXT NOT NULL DEFAULT 'a_verifier' CHECK (status IN ('a_verifier', 'en_reparation', 'en_attente', 'termine')),
  notes TEXT DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. MOUVEMENTS DE STOCK (JOURNAL COMPLET)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  movement_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE RESTRICT,
  equipment_designation TEXT NOT NULL,
  stock_pool TEXT NOT NULL CHECK (stock_pool IN ('location', 'vente', 'maintenance', 'endommage')),
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'entree_stock',
    'sortie_location',
    'retour_location',
    'vente',
    'retour_vente',
    'transfert_usage',
    'mise_maintenance',
    'sortie_reparation',
    'ajustement_manuel'
  )),
  quantity NUMERIC(12,2) NOT NULL,
  previous_qty NUMERIC(12,2) NOT NULL,
  new_qty NUMERIC(12,2) NOT NULL,
  related_operation TEXT DEFAULT '',
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);

-- INDEXES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_rentals_customer ON public.rentals(customer_id);
CREATE INDEX IF NOT EXISTS idx_rentals_status ON public.rentals(status);
CREATE INDEX IF NOT EXISTS idx_rentals_dates ON public.rentals(exit_at, expected_return_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_services_customer ON public.services(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_eq ON public.stock_movements(equipment_id, movement_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
DO $$
DECLARE
  tbl TEXT;
  all_tables TEXT[] := ARRAY[
    'user_profiles', 'company_settings', 'categories', 'units',
    'equipment', 'equipment_units', 'scaffolding_packages', 'scaffolding_package_items',
    'customers', 'suppliers', 'supplier_purchases', 'supplier_payments',
    'rentals', 'rental_items', 'rental_returns', 'rental_return_items',
    'sales', 'sale_items', 'service_types', 'services', 'service_interventions',
    'payments', 'expense_categories', 'expenses', 'maintenance_records', 'stock_movements'
  ];
BEGIN
  FOREACH tbl IN ARRAY all_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
  END LOOP;
END $$;

-- Politiques user_profiles
DROP POLICY IF EXISTS "profiles_select_active" ON public.user_profiles;
CREATE POLICY "profiles_select_active" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin_or_manager());

DROP POLICY IF EXISTS "profiles_update_admin" ON public.user_profiles;
CREATE POLICY "profiles_update_admin" ON public.user_profiles
  FOR UPDATE USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.user_profiles;
CREATE POLICY "profiles_delete_admin" ON public.user_profiles
  FOR DELETE USING (public.is_admin_user() AND id <> auth.uid());

-- Politique standard pour toutes les tables opérationnelles (utilisateurs authentifiés actifs uniquement)
DO $$
DECLARE
  tbl TEXT;
  op_tables TEXT[] := ARRAY[
    'categories', 'units', 'equipment', 'equipment_units',
    'scaffolding_packages', 'scaffolding_package_items',
    'customers', 'suppliers', 'supplier_purchases', 'supplier_payments',
    'rentals', 'rental_items', 'rental_returns', 'rental_return_items',
    'sales', 'sale_items', 'service_types', 'services', 'service_interventions',
    'payments', 'expense_categories', 'expenses', 'maintenance_records', 'stock_movements'
  ];
BEGIN
  FOREACH tbl IN ARRAY op_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "active_select_%s" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "active_select_%s" ON public.%I FOR SELECT USING (public.is_active_user());', tbl, tbl);

    EXECUTE format('DROP POLICY IF EXISTS "active_insert_%s" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "active_insert_%s" ON public.%I FOR INSERT WITH CHECK (public.is_active_user());', tbl, tbl);

    EXECUTE format('DROP POLICY IF EXISTS "active_update_%s" ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE POLICY "active_update_%s" ON public.%I FOR UPDATE USING (public.is_active_user()) WITH CHECK (public.is_active_user());', tbl, tbl);
  END LOOP;
END $$;

-- Paramètres entreprise : lecture à tous les actifs, modification Admin/Manager
DROP POLICY IF EXISTS "settings_select_active" ON public.company_settings;
CREATE POLICY "settings_select_active" ON public.company_settings
  FOR SELECT USING (public.is_active_user());

DROP POLICY IF EXISTS "settings_update_admin" ON public.company_settings;
CREATE POLICY "settings_update_admin" ON public.company_settings
  FOR UPDATE USING (public.is_admin_or_manager())
  WITH CHECK (public.is_admin_or_manager());

-- =============================================================================
-- FONCTIONS TRANSACTIONNELLES ATOMIQUES (PRÉVENTION DES STOCKS NÉGATIFS)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.gen_ref(prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN prefix || '-' || to_char(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', ''), 1, 5));
END;
$$;

-- 1. CRÉATION ATOMIQUE D'UNE LOCATION
CREATE OR REPLACE FUNCTION public.create_rental_tx(
  p_customer_id UUID,
  p_exit_at TIMESTAMPTZ,
  p_expected_return_at TIMESTAMPTZ,
  p_additional_fees NUMERIC,
  p_discount NUMERIC,
  p_deposit_amount NUMERIC,
  p_amount_paid NUMERIC,
  p_payment_method TEXT,
  p_status TEXT,
  p_condition_at_exit TEXT,
  p_notes TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_name TEXT;
  v_cust RECORD;
  v_item JSONB;
  v_eq RECORD;
  v_unit RECORD;
  v_rental_id UUID;
  v_rental_ref TEXT;
  v_subtotal NUMERIC(14,2) := 0;
  v_total NUMERIC(14,2) := 0;
  v_qty NUMERIC(12,2);
  v_unit_price NUMERIC(14,2);
  v_duration NUMERIC(12,2);
  v_line_total NUMERIC(14,2);
  v_prev_qty NUMERIC(12,2);
  v_new_qty NUMERIC(12,2);
  v_pay_ref TEXT;
BEGIN
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Accès non autorisé';
  END IF;

  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Veuillez sélectionner au moins un matériel';
  END IF;

  SELECT full_name INTO v_user_name FROM public.user_profiles WHERE id = v_user_id;
  SELECT id, name, phone INTO v_cust FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client introuvable';
  END IF;

  v_rental_ref := public.gen_ref('LOC');

  INSERT INTO public.rentals (
    reference, customer_id, customer_name, customer_phone,
    exit_at, expected_return_at, additional_fees, discount,
    deposit_amount, subtotal_amount, total_amount, amount_paid,
    payment_method, status, condition_at_exit, notes, created_by
  ) VALUES (
    v_rental_ref, v_cust.id, v_cust.name, COALESCE(v_cust.phone, ''),
    p_exit_at, p_expected_return_at, COALESCE(p_additional_fees, 0), COALESCE(p_discount, 0),
    COALESCE(p_deposit_amount, 0), 0, 0, COALESCE(p_amount_paid, 0),
    COALESCE(p_payment_method, 'Espèces'),
    CASE WHEN p_status IN ('en_preparation', 'en_cours') THEN p_status ELSE 'en_cours' END,
    COALESCE(p_condition_at_exit, 'Bon état'), COALESCE(p_notes, ''), v_user_id
  )
  RETURNING id INTO v_rental_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'qty')::NUMERIC, 0);
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
    v_duration := COALESCE((v_item->>'duration_value')::NUMERIC, 1);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'La quantité doit être supérieure à zéro';
    END IF;

    SELECT * INTO v_eq FROM public.equipment WHERE id = (v_item->>'equipment_id')::UUID FOR UPDATE;
    IF NOT FOUND OR v_eq.is_archived THEN
      RAISE EXCEPTION 'Matériel introuvable ou archivé';
    END IF;

    IF v_eq.activity_type NOT IN ('location', 'location_et_vente') THEN
      RAISE EXCEPTION 'Le matériel % n''est pas configuré pour la location', v_eq.designation;
    END IF;

    IF v_eq.qty_rental_available < v_qty THEN
      RAISE EXCEPTION 'Stock de location insuffisant pour % (disponible: %, demandé: %)',
        v_eq.designation, v_eq.qty_rental_available, v_qty;
    END IF;

    IF (v_item->>'equipment_unit_id') IS NOT NULL AND (v_item->>'equipment_unit_id') <> '' THEN
      SELECT * INTO v_unit FROM public.equipment_units
      WHERE id = (v_item->>'equipment_unit_id')::UUID AND equipment_id = v_eq.id FOR UPDATE;
      IF NOT FOUND OR v_unit.status <> 'disponible' THEN
        RAISE EXCEPTION 'L''unité individuelle sélectionnée n''est pas disponible';
      END IF;
      UPDATE public.equipment_units SET status = 'en_location' WHERE id = v_unit.id;
    ELSE
      v_unit := NULL;
    END IF;

    IF (v_item->>'pricing_type') IN ('personnalise', 'selon_accord') THEN
      v_line_total := ROUND(v_unit_price * v_qty, 2);
    ELSE
      v_line_total := ROUND(v_unit_price * v_duration * v_qty, 2);
    END IF;

    v_subtotal := v_subtotal + v_line_total;

    INSERT INTO public.rental_items (
      rental_id, equipment_id, equipment_ref, equipment_designation, unit_name,
      equipment_unit_id, serial_number, qty_rented, pricing_type, duration_value,
      unit_price, line_total
    ) VALUES (
      v_rental_id, v_eq.id, v_eq.reference, v_eq.designation, v_eq.unit_name,
      CASE WHEN v_unit.id IS NOT NULL THEN v_unit.id ELSE NULL END,
      COALESCE(v_unit.serial_number, ''),
      v_qty, COALESCE(v_item->>'pricing_type', 'jour'), v_duration,
      v_unit_price, v_line_total
    );

    v_prev_qty := v_eq.qty_rental_available;
    v_new_qty := v_prev_qty - v_qty;

    UPDATE public.equipment
    SET qty_rental_available = v_new_qty,
        qty_rented = qty_rented + v_qty,
        status = CASE WHEN v_new_qty = 0 AND qty_sale_available = 0 THEN 'en_location' ELSE status END,
        updated_at = NOW()
    WHERE id = v_eq.id;

    INSERT INTO public.stock_movements (
      reference, equipment_id, equipment_designation, stock_pool, movement_type,
      quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes
    ) VALUES (
      public.gen_ref('MVT'), v_eq.id, v_eq.designation, 'location', 'sortie_location',
      -v_qty, v_prev_qty, v_new_qty, v_rental_ref, v_user_id, COALESCE(v_user_name, ''),
      'Sortie location client ' || v_cust.name
    );
  END LOOP;

  v_total := GREATEST(0, v_subtotal + COALESCE(p_additional_fees, 0) - COALESCE(p_discount, 0));

  UPDATE public.rentals
  SET subtotal_amount = v_subtotal,
      total_amount = v_total
  WHERE id = v_rental_id;

  IF COALESCE(p_amount_paid, 0) > 0 THEN
    v_pay_ref := public.gen_ref('PAY');
    INSERT INTO public.payments (
      reference, payment_date, customer_id, customer_name,
      operation_type, rental_id, operation_reference,
      amount, payment_method, notes, created_by
    ) VALUES (
      v_pay_ref, NOW(), v_cust.id, v_cust.name,
      'location', v_rental_id, v_rental_ref,
      p_amount_paid, COALESCE(p_payment_method, 'Espèces'),
      'Paiement initial à la sortie', v_user_id
    );
  END IF;

  RETURN jsonb_build_object('id', v_rental_id, 'reference', v_rental_ref, 'total_amount', v_total);
END;
$$;

-- 2. TRAITEMENT ATOMIQUE D'UN RETOUR (COMPLET OU PARTIEL)
CREATE OR REPLACE FUNCTION public.process_return_tx(
  p_rental_id UUID,
  p_returned_at TIMESTAMPTZ,
  p_additional_charges NUMERIC,
  p_remarks TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_name TEXT;
  v_rental RECORD;
  v_return_id UUID;
  v_return_ref TEXT;
  v_item JSONB;
  v_ri RECORD;
  v_eq RECORD;
  v_qty_now NUMERIC(12,2);
  v_qty_missing NUMERIC(12,2);
  v_remaining NUMERIC(12,2);
  v_cond TEXT;
  v_prev_qty NUMERIC(12,2);
  v_new_qty NUMERIC(12,2);
  v_all_returned BOOLEAN;
BEGIN
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Accès non autorisé';
  END IF;

  SELECT full_name INTO v_user_name FROM public.user_profiles WHERE id = v_user_id;
  SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location introuvable';
  END IF;
  IF v_rental.status IN ('terminee', 'annulee') THEN
    RAISE EXCEPTION 'Cette location est déjà clôturée';
  END IF;

  v_return_ref := public.gen_ref('RET');
  INSERT INTO public.rental_returns (
    reference, rental_id, customer_id, customer_name, returned_at,
    additional_charges, remarks, created_by
  ) VALUES (
    v_return_ref, v_rental.id, v_rental.customer_id, v_rental.customer_name,
    COALESCE(p_returned_at, NOW()), COALESCE(p_additional_charges, 0), COALESCE(p_remarks, ''), v_user_id
  )
  RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty_now := COALESCE((v_item->>'qty_returned_now')::NUMERIC, 0);
    v_qty_missing := COALESCE((v_item->>'qty_missing_now')::NUMERIC, 0);
    v_cond := COALESCE(v_item->>'condition', 'bon_etat');

    IF v_qty_now = 0 AND v_qty_missing = 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_ri FROM public.rental_items
    WHERE id = (v_item->>'rental_item_id')::UUID AND rental_id = v_rental.id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ligne de location introuvable';
    END IF;

    v_remaining := v_ri.qty_rented - v_ri.qty_returned - v_ri.qty_missing;
    IF (v_qty_now + v_qty_missing) > v_remaining THEN
      RAISE EXCEPTION 'Quantité retournée/manquante supérieure au solde restant pour %', v_ri.equipment_designation;
    END IF;

    SELECT * INTO v_eq FROM public.equipment WHERE id = v_ri.equipment_id FOR UPDATE;

    INSERT INTO public.rental_return_items (
      return_id, rental_item_id, equipment_id, equipment_designation,
      qty_returned_now, qty_missing_now, condition, damage_notes
    ) VALUES (
      v_return_id, v_ri.id, v_eq.id, v_ri.equipment_designation,
      v_qty_now, v_qty_missing, v_cond, COALESCE(v_item->>'damage_notes', '')
    );

    UPDATE public.rental_items
    SET qty_returned = qty_returned + v_qty_now,
        qty_missing = qty_missing + v_qty_missing,
        qty_damaged = qty_damaged + CASE WHEN v_cond IN ('endommage', 'incomplet', 'necessite_maintenance') THEN v_qty_now ELSE 0 END
    WHERE id = v_ri.id;

    -- Mise à jour atomique des stocks selon l'état du matériel
    IF v_qty_now > 0 THEN
      IF v_cond = 'bon_etat' THEN
        v_prev_qty := v_eq.qty_rental_available;
        v_new_qty := v_prev_qty + v_qty_now;
        UPDATE public.equipment
        SET qty_rental_available = v_new_qty,
            qty_rented = GREATEST(0, qty_rented - v_qty_now),
            status = 'disponible',
            updated_at = NOW()
        WHERE id = v_eq.id;

        IF v_ri.equipment_unit_id IS NOT NULL THEN
          UPDATE public.equipment_units SET status = 'disponible' WHERE id = v_ri.equipment_unit_id;
        END IF;

        INSERT INTO public.stock_movements (
          reference, equipment_id, equipment_designation, stock_pool, movement_type,
          quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes
        ) VALUES (
          public.gen_ref('MVT'), v_eq.id, v_eq.designation, 'location', 'retour_location',
          v_qty_now, v_prev_qty, v_new_qty, v_return_ref, v_user_id, COALESCE(v_user_name, ''),
          'Retour en bon état (' || v_rental.reference || ')'
        );
      ELSIF v_cond = 'necessite_maintenance' THEN
        v_prev_qty := v_eq.qty_maintenance;
        v_new_qty := v_prev_qty + v_qty_now;
        UPDATE public.equipment
        SET qty_maintenance = v_new_qty,
            qty_rented = GREATEST(0, qty_rented - v_qty_now),
            updated_at = NOW()
        WHERE id = v_eq.id;

        IF v_ri.equipment_unit_id IS NOT NULL THEN
          UPDATE public.equipment_units SET status = 'en_maintenance' WHERE id = v_ri.equipment_unit_id;
        END IF;

        INSERT INTO public.maintenance_records (
          reference, equipment_id, equipment_designation, equipment_unit_id, source_pool, qty,
          maintenance_type, problem_description, status, notes, created_by
        ) VALUES (
          public.gen_ref('MNT'), v_eq.id, v_eq.designation, v_ri.equipment_unit_id, 'location', v_qty_now,
          'Contrôle post-location', COALESCE(NULLIF(v_item->>'damage_notes', ''), 'Signalé lors du retour ' || v_return_ref),
          'a_verifier', 'Créé automatiquement au retour ' || v_rental.reference, v_user_id
        );

        INSERT INTO public.stock_movements (
          reference, equipment_id, equipment_designation, stock_pool, movement_type,
          quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes
        ) VALUES (
          public.gen_ref('MVT'), v_eq.id, v_eq.designation, 'maintenance', 'mise_maintenance',
          v_qty_now, v_prev_qty, v_new_qty, v_return_ref, v_user_id, COALESCE(v_user_name, ''),
          'Retour nécessitant maintenance (' || v_rental.reference || ')'
        );
      ELSE
        -- endommage ou incomplet
        v_prev_qty := v_eq.qty_damaged;
        v_new_qty := v_prev_qty + v_qty_now;
        UPDATE public.equipment
        SET qty_damaged = v_new_qty,
            qty_rented = GREATEST(0, qty_rented - v_qty_now),
            updated_at = NOW()
        WHERE id = v_eq.id;

        IF v_ri.equipment_unit_id IS NOT NULL THEN
          UPDATE public.equipment_units SET status = 'endommage' WHERE id = v_ri.equipment_unit_id;
        END IF;

        INSERT INTO public.stock_movements (
          reference, equipment_id, equipment_designation, stock_pool, movement_type,
          quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes
        ) VALUES (
          public.gen_ref('MVT'), v_eq.id, v_eq.designation, 'endommage', 'retour_location',
          v_qty_now, v_prev_qty, v_new_qty, v_return_ref, v_user_id, COALESCE(v_user_name, ''),
          'Retour ' || v_cond || ' (' || v_rental.reference || ')'
        );
      END IF;
    END IF;

    IF v_qty_missing > 0 THEN
      UPDATE public.equipment
      SET qty_rented = GREATEST(0, qty_rented - v_qty_missing),
          updated_at = NOW()
      WHERE id = v_eq.id;

      INSERT INTO public.stock_movements (
        reference, equipment_id, equipment_designation, stock_pool, movement_type,
        quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes
      ) VALUES (
        public.gen_ref('MVT'), v_eq.id, v_eq.designation, 'location', 'ajustement_manuel',
        -v_qty_missing, v_eq.qty_rented, GREATEST(0, v_eq.qty_rented - v_qty_missing),
        v_return_ref, v_user_id, COALESCE(v_user_name, ''),
        'Matériel manquant déclaré au retour (' || v_rental.reference || ')'
      );
    END IF;
  END LOOP;

  SELECT NOT EXISTS (
    SELECT 1 FROM public.rental_items
    WHERE rental_id = v_rental.id
      AND (qty_rented - qty_returned - qty_missing) > 0
  ) INTO v_all_returned;

  UPDATE public.rentals
  SET additional_fees = additional_fees + COALESCE(p_additional_charges, 0),
      total_amount = total_amount + COALESCE(p_additional_charges, 0),
      status = CASE WHEN v_all_returned THEN 'terminee' ELSE 'partiellement_retournee' END,
      actual_return_at = CASE WHEN v_all_returned THEN COALESCE(p_returned_at, NOW()) ELSE actual_return_at END
  WHERE id = v_rental.id;

  RETURN jsonb_build_object('id', v_return_id, 'reference', v_return_ref, 'completed', v_all_returned);
END;
$$;

-- 3. CRÉATION ATOMIQUE D'UNE VENTE
CREATE OR REPLACE FUNCTION public.create_sale_tx(
  p_customer_id UUID,
  p_sale_date TIMESTAMPTZ,
  p_discount NUMERIC,
  p_amount_paid NUMERIC,
  p_payment_method TEXT,
  p_notes TEXT,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_name TEXT;
  v_cust RECORD;
  v_sale_id UUID;
  v_sale_ref TEXT;
  v_item JSONB;
  v_eq RECORD;
  v_qty NUMERIC(12,2);
  v_unit_price NUMERIC(14,2);
  v_line_total NUMERIC(14,2);
  v_subtotal NUMERIC(14,2) := 0;
  v_total_cost NUMERIC(14,2) := 0;
  v_total NUMERIC(14,2) := 0;
  v_prev_qty NUMERIC(12,2);
  v_new_qty NUMERIC(12,2);
BEGIN
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Accès non autorisé';
  END IF;

  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Veuillez ajouter au moins un article à la vente';
  END IF;

  SELECT full_name INTO v_user_name FROM public.user_profiles WHERE id = v_user_id;
  SELECT id, name, phone INTO v_cust FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client introuvable';
  END IF;

  v_sale_ref := public.gen_ref('VTE');

  INSERT INTO public.sales (
    reference, customer_id, customer_name, customer_phone, sale_date,
    discount, amount_paid, payment_method, notes, created_by
  ) VALUES (
    v_sale_ref, v_cust.id, v_cust.name, COALESCE(v_cust.phone, ''),
    COALESCE(p_sale_date, NOW()), COALESCE(p_discount, 0),
    COALESCE(p_amount_paid, 0), COALESCE(p_payment_method, 'Espèces'),
    COALESCE(p_notes, ''), v_user_id
  )
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'qty')::NUMERIC, 0);
    v_unit_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'La quantité vendue doit être supérieure à zéro';
    END IF;

    SELECT * INTO v_eq FROM public.equipment WHERE id = (v_item->>'equipment_id')::UUID FOR UPDATE;
    IF NOT FOUND OR v_eq.is_archived THEN
      RAISE EXCEPTION 'Matériel introuvable ou archivé';
    END IF;

    IF v_eq.activity_type NOT IN ('vente', 'location_et_vente') THEN
      RAISE EXCEPTION 'Le matériel % n''est pas destiné à la vente', v_eq.designation;
    END IF;

    IF v_eq.qty_sale_available < v_qty THEN
      RAISE EXCEPTION 'Stock de vente insuffisant pour % (disponible: %, demandé: %)',
        v_eq.designation, v_eq.qty_sale_available, v_qty;
    END IF;

    v_line_total := ROUND(v_qty * v_unit_price, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_total_cost := v_total_cost + ROUND(v_qty * v_eq.purchase_price, 2);

    INSERT INTO public.sale_items (
      sale_id, equipment_id, equipment_ref, equipment_designation, unit_name,
      qty, purchase_price_snapshot, unit_price, line_total
    ) VALUES (
      v_sale_id, v_eq.id, v_eq.reference, v_eq.designation, v_eq.unit_name,
      v_qty, v_eq.purchase_price, v_unit_price, v_line_total
    );

    v_prev_qty := v_eq.qty_sale_available;
    v_new_qty := v_prev_qty - v_qty;

    UPDATE public.equipment
    SET qty_sale_available = v_new_qty,
        updated_at = NOW()
    WHERE id = v_eq.id;

    INSERT INTO public.stock_movements (
      reference, equipment_id, equipment_designation, stock_pool, movement_type,
      quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes
    ) VALUES (
      public.gen_ref('MVT'), v_eq.id, v_eq.designation, 'vente', 'vente',
      -v_qty, v_prev_qty, v_new_qty, v_sale_ref, v_user_id, COALESCE(v_user_name, ''),
      'Vente client ' || v_cust.name
    );
  END LOOP;

  v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

  UPDATE public.sales
  SET subtotal_amount = v_subtotal,
      total_amount = v_total,
      total_cost = v_total_cost
  WHERE id = v_sale_id;

  IF COALESCE(p_amount_paid, 0) > 0 THEN
    INSERT INTO public.payments (
      reference, payment_date, customer_id, customer_name,
      operation_type, sale_id, operation_reference,
      amount, payment_method, notes, created_by
    ) VALUES (
      public.gen_ref('PAY'), NOW(), v_cust.id, v_cust.name,
      'vente', v_sale_id, v_sale_ref,
      p_amount_paid, COALESCE(p_payment_method, 'Espèces'),
      'Paiement lors de la vente', v_user_id
    );
  END IF;

  RETURN jsonb_build_object('id', v_sale_id, 'reference', v_sale_ref, 'total_amount', v_total);
END;
$$;

-- 4. ENREGISTREMENT ATOMIQUE D'UN PAIEMENT (IMMUABLE)
CREATE OR REPLACE FUNCTION public.record_payment_tx(
  p_customer_id UUID,
  p_operation_type TEXT,
  p_operation_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_date TIMESTAMPTZ,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cust RECORD;
  v_op_ref TEXT := '';
  v_pay_id UUID;
  v_pay_ref TEXT;
BEGIN
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Accès non autorisé';
  END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Le montant du paiement doit être supérieur à zéro';
  END IF;

  SELECT id, name INTO v_cust FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client introuvable';
  END IF;

  IF p_operation_type = 'location' AND p_operation_id IS NOT NULL THEN
    SELECT reference INTO v_op_ref FROM public.rentals WHERE id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Location introuvable'; END IF;
    UPDATE public.rentals SET amount_paid = amount_paid + p_amount WHERE id = p_operation_id;
  ELSIF p_operation_type = 'vente' AND p_operation_id IS NOT NULL THEN
    SELECT reference INTO v_op_ref FROM public.sales WHERE id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vente introuvable'; END IF;
    UPDATE public.sales SET amount_paid = amount_paid + p_amount WHERE id = p_operation_id;
  ELSIF p_operation_type = 'service' AND p_operation_id IS NOT NULL THEN
    SELECT reference INTO v_op_ref FROM public.services WHERE id = p_operation_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Service introuvable'; END IF;
    UPDATE public.services SET amount_paid = amount_paid + p_amount WHERE id = p_operation_id;
  END IF;

  v_pay_ref := public.gen_ref('PAY');
  INSERT INTO public.payments (
    reference, payment_date, customer_id, customer_name,
    operation_type,
    rental_id, sale_id, service_id,
    operation_reference, amount, payment_method, notes, created_by
  ) VALUES (
    v_pay_ref, COALESCE(p_payment_date, NOW()), v_cust.id, v_cust.name,
    p_operation_type,
    CASE WHEN p_operation_type = 'location' THEN p_operation_id ELSE NULL END,
    CASE WHEN p_operation_type = 'vente' THEN p_operation_id ELSE NULL END,
    CASE WHEN p_operation_type = 'service' THEN p_operation_id ELSE NULL END,
    v_op_ref, p_amount, COALESCE(p_payment_method, 'Espèces'), COALESCE(p_notes, ''), v_user_id
  )
  RETURNING id INTO v_pay_id;

  RETURN jsonb_build_object('id', v_pay_id, 'reference', v_pay_ref);
END;
$$;

-- 5. AJUSTEMENT / ENTRÉE / TRANSFERT ATOMIQUE DE STOCK
CREATE OR REPLACE FUNCTION public.adjust_stock_tx(
  p_equipment_id UUID,
  p_action TEXT,
  p_pool TEXT,
  p_target_pool TEXT,
  p_qty NUMERIC,
  p_reason TEXT,
  p_related_operation TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_name TEXT;
  v_eq RECORD;
  v_prev NUMERIC(12,2);
  v_new NUMERIC(12,2);
BEGIN
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Accès non autorisé';
  END IF;
  IF COALESCE(TRIM(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Un motif est obligatoire pour tout mouvement de stock';
  END IF;

  SELECT full_name INTO v_user_name FROM public.user_profiles WHERE id = v_user_id;
  SELECT * INTO v_eq FROM public.equipment WHERE id = p_equipment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Matériel introuvable';
  END IF;

  IF p_action = 'entree_stock' THEN
    IF p_qty <= 0 THEN RAISE EXCEPTION 'La quantité d''entrée doit être positive'; END IF;
    IF p_pool = 'location' THEN
      v_prev := v_eq.qty_rental_available;
      v_new := v_prev + p_qty;
      UPDATE public.equipment SET qty_rental_available = v_new, updated_at = NOW() WHERE id = v_eq.id;
    ELSE
      v_prev := v_eq.qty_sale_available;
      v_new := v_prev + p_qty;
      UPDATE public.equipment SET qty_sale_available = v_new, updated_at = NOW() WHERE id = v_eq.id;
    END IF;
    INSERT INTO public.stock_movements (
      reference, equipment_id, equipment_designation, stock_pool, movement_type,
      quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes
    ) VALUES (
      public.gen_ref('MVT'), v_eq.id, v_eq.designation, p_pool, 'entree_stock',
      p_qty, v_prev, v_new, COALESCE(p_related_operation, ''), v_user_id, COALESCE(v_user_name, ''), p_reason
    );

  ELSIF p_action = 'transfert_usage' THEN
    IF p_qty <= 0 THEN RAISE EXCEPTION 'La quantité à transférer doit être positive'; END IF;
    IF p_pool = p_target_pool THEN RAISE EXCEPTION 'Le stock source et destination doivent être différents'; END IF;
    IF p_pool = 'location' AND p_target_pool = 'vente' THEN
      IF v_eq.qty_rental_available < p_qty THEN RAISE EXCEPTION 'Stock location disponible insuffisant'; END IF;
      UPDATE public.equipment
      SET qty_rental_available = qty_rental_available - p_qty,
          qty_sale_available = qty_sale_available + p_qty,
          updated_at = NOW()
      WHERE id = v_eq.id;
      INSERT INTO public.stock_movements (reference, equipment_id, equipment_designation, stock_pool, movement_type, quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes)
      VALUES (public.gen_ref('MVT'), v_eq.id, v_eq.designation, 'location', 'transfert_usage', -p_qty, v_eq.qty_rental_available, v_eq.qty_rental_available - p_qty, 'TRANSFERT', v_user_id, COALESCE(v_user_name, ''), p_reason);
      INSERT INTO public.stock_movements (reference, equipment_id, equipment_designation, stock_pool, movement_type, quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes)
      VALUES (public.gen_ref('MVT'), v_eq.id, v_eq.designation, 'vente', 'transfert_usage', p_qty, v_eq.qty_sale_available, v_eq.qty_sale_available + p_qty, 'TRANSFERT', v_user_id, COALESCE(v_user_name, ''), p_reason);
    ELSIF p_pool = 'vente' AND p_target_pool = 'location' THEN
      IF v_eq.qty_sale_available < p_qty THEN RAISE EXCEPTION 'Stock vente disponible insuffisant'; END IF;
      UPDATE public.equipment
      SET qty_sale_available = qty_sale_available - p_qty,
          qty_rental_available = qty_rental_available + p_qty,
          updated_at = NOW()
      WHERE id = v_eq.id;
      INSERT INTO public.stock_movements (reference, equipment_id, equipment_designation, stock_pool, movement_type, quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes)
      VALUES (public.gen_ref('MVT'), v_eq.id, v_eq.designation, 'vente', 'transfert_usage', -p_qty, v_eq.qty_sale_available, v_eq.qty_sale_available - p_qty, 'TRANSFERT', v_user_id, COALESCE(v_user_name, ''), p_reason);
      INSERT INTO public.stock_movements (reference, equipment_id, equipment_designation, stock_pool, movement_type, quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes)
      VALUES (public.gen_ref('MVT'), v_eq.id, v_eq.designation, 'location', 'transfert_usage', p_qty, v_eq.qty_rental_available, v_eq.qty_rental_available + p_qty, 'TRANSFERT', v_user_id, COALESCE(v_user_name, ''), p_reason);
    ELSE
      RAISE EXCEPTION 'Transfert non supporté entre % et %', p_pool, p_target_pool;
    END IF;

  ELSIF p_action = 'ajustement_manuel' THEN
    IF p_pool = 'location' THEN
      v_prev := v_eq.qty_rental_available; v_new := v_prev + p_qty;
      IF v_new < 0 THEN RAISE EXCEPTION 'Impossible : le stock deviendrait négatif'; END IF;
      UPDATE public.equipment SET qty_rental_available = v_new, updated_at = NOW() WHERE id = v_eq.id;
    ELSIF p_pool = 'vente' THEN
      v_prev := v_eq.qty_sale_available; v_new := v_prev + p_qty;
      IF v_new < 0 THEN RAISE EXCEPTION 'Impossible : le stock deviendrait négatif'; END IF;
      UPDATE public.equipment SET qty_sale_available = v_new, updated_at = NOW() WHERE id = v_eq.id;
    ELSIF p_pool = 'endommage' THEN
      v_prev := v_eq.qty_damaged; v_new := v_prev + p_qty;
      IF v_new < 0 THEN RAISE EXCEPTION 'Impossible : le stock deviendrait négatif'; END IF;
      UPDATE public.equipment SET qty_damaged = v_new, updated_at = NOW() WHERE id = v_eq.id;
    END IF;
    INSERT INTO public.stock_movements (
      reference, equipment_id, equipment_designation, stock_pool, movement_type,
      quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes
    ) VALUES (
      public.gen_ref('MVT'), v_eq.id, v_eq.designation, p_pool, 'ajustement_manuel',
      p_qty, v_prev, v_new, COALESCE(p_related_operation, 'AJUSTEMENT'), v_user_id, COALESCE(v_user_name, ''), p_reason
    );
  END IF;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- 6. MISE EN MAINTENANCE & CLÔTURE ATOMIQUES
CREATE OR REPLACE FUNCTION public.start_maintenance_tx(
  p_equipment_id UUID,
  p_equipment_unit_id UUID,
  p_source_pool TEXT,
  p_qty NUMERIC,
  p_maintenance_type TEXT,
  p_problem_description TEXT,
  p_technician TEXT,
  p_cost NUMERIC,
  p_start_date DATE,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_name TEXT;
  v_eq RECORD;
  v_mnt_id UUID;
  v_mnt_ref TEXT;
  v_prev NUMERIC(12,2);
BEGIN
  IF NOT public.is_active_user() THEN RAISE EXCEPTION 'Accès non autorisé'; END IF;
  IF COALESCE(p_qty, 0) <= 0 THEN RAISE EXCEPTION 'Quantité invalide'; END IF;

  SELECT full_name INTO v_user_name FROM public.user_profiles WHERE id = v_user_id;
  SELECT * INTO v_eq FROM public.equipment WHERE id = p_equipment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Matériel introuvable'; END IF;

  IF p_source_pool = 'location' THEN
    IF v_eq.qty_rental_available < p_qty THEN RAISE EXCEPTION 'Stock location insuffisant'; END IF;
    UPDATE public.equipment SET qty_rental_available = qty_rental_available - p_qty, qty_maintenance = qty_maintenance + p_qty, updated_at = NOW() WHERE id = v_eq.id;
  ELSIF p_source_pool = 'vente' THEN
    IF v_eq.qty_sale_available < p_qty THEN RAISE EXCEPTION 'Stock vente insuffisant'; END IF;
    UPDATE public.equipment SET qty_sale_available = qty_sale_available - p_qty, qty_maintenance = qty_maintenance + p_qty, updated_at = NOW() WHERE id = v_eq.id;
  ELSIF p_source_pool = 'endommage' THEN
    IF v_eq.qty_damaged < p_qty THEN RAISE EXCEPTION 'Stock endommagé insuffisant'; END IF;
    UPDATE public.equipment SET qty_damaged = qty_damaged - p_qty, qty_maintenance = qty_maintenance + p_qty, updated_at = NOW() WHERE id = v_eq.id;
  ELSE
    RAISE EXCEPTION 'Source stock invalide';
  END IF;

  IF p_equipment_unit_id IS NOT NULL THEN
    UPDATE public.equipment_units SET status = 'en_maintenance' WHERE id = p_equipment_unit_id;
  END IF;

  v_mnt_ref := public.gen_ref('MNT');
  INSERT INTO public.maintenance_records (
    reference, equipment_id, equipment_designation, equipment_unit_id, source_pool, qty,
    maintenance_type, maintenance_date, problem_description, cost, technician_or_supplier,
    start_date, status, notes, created_by
  ) VALUES (
    v_mnt_ref, v_eq.id, v_eq.designation, p_equipment_unit_id, p_source_pool, p_qty,
    p_maintenance_type, COALESCE(p_start_date, CURRENT_DATE), p_problem_description,
    COALESCE(p_cost, 0), COALESCE(p_technician, ''), p_start_date, 'en_reparation',
    COALESCE(p_notes, ''), v_user_id
  )
  RETURNING id INTO v_mnt_id;

  v_prev := v_eq.qty_maintenance;
  INSERT INTO public.stock_movements (
    reference, equipment_id, equipment_designation, stock_pool, movement_type,
    quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes
  ) VALUES (
    public.gen_ref('MVT'), v_eq.id, v_eq.designation, 'maintenance', 'mise_maintenance',
    p_qty, v_prev, v_prev + p_qty, v_mnt_ref, v_user_id, COALESCE(v_user_name, ''),
    p_problem_description
  );

  RETURN jsonb_build_object('id', v_mnt_id, 'reference', v_mnt_ref);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_maintenance_tx(
  p_maintenance_id UUID,
  p_return_pool TEXT,
  p_repair_details TEXT,
  p_cost NUMERIC,
  p_completion_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_name TEXT;
  v_mnt RECORD;
  v_eq RECORD;
  v_prev NUMERIC(12,2);
  v_new NUMERIC(12,2);
BEGIN
  IF NOT public.is_active_user() THEN RAISE EXCEPTION 'Accès non autorisé'; END IF;
  SELECT full_name INTO v_user_name FROM public.user_profiles WHERE id = v_user_id;
  SELECT * INTO v_mnt FROM public.maintenance_records WHERE id = p_maintenance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fiche maintenance introuvable'; END IF;
  IF v_mnt.status = 'termine' THEN RAISE EXCEPTION 'Cette maintenance est déjà terminée'; END IF;

  SELECT * INTO v_eq FROM public.equipment WHERE id = v_mnt.equipment_id FOR UPDATE;
  IF v_eq.qty_maintenance < v_mnt.qty THEN RAISE EXCEPTION 'Quantité en maintenance incohérente'; END IF;

  IF p_return_pool = 'location' THEN
    v_prev := v_eq.qty_rental_available; v_new := v_prev + v_mnt.qty;
    UPDATE public.equipment SET qty_maintenance = qty_maintenance - v_mnt.qty, qty_rental_available = v_new, status = 'disponible', updated_at = NOW() WHERE id = v_eq.id;
  ELSIF p_return_pool = 'vente' THEN
    v_prev := v_eq.qty_sale_available; v_new := v_prev + v_mnt.qty;
    UPDATE public.equipment SET qty_maintenance = qty_maintenance - v_mnt.qty, qty_sale_available = v_new, status = 'disponible', updated_at = NOW() WHERE id = v_eq.id;
  ELSE
    v_prev := v_eq.qty_damaged; v_new := v_prev + v_mnt.qty;
    UPDATE public.equipment SET qty_maintenance = qty_maintenance - v_mnt.qty, qty_damaged = v_new, updated_at = NOW() WHERE id = v_eq.id;
  END IF;

  IF v_mnt.equipment_unit_id IS NOT NULL THEN
    UPDATE public.equipment_units
    SET status = CASE WHEN p_return_pool = 'endommage' THEN 'endommage' ELSE 'disponible' END
    WHERE id = v_mnt.equipment_unit_id;
  END IF;

  UPDATE public.maintenance_records
  SET status = 'termine',
      repair_details = COALESCE(p_repair_details, repair_details),
      cost = COALESCE(p_cost, cost),
      completion_date = COALESCE(p_completion_date, CURRENT_DATE)
  WHERE id = v_mnt.id;

  INSERT INTO public.stock_movements (
    reference, equipment_id, equipment_designation, stock_pool, movement_type,
    quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes
  ) VALUES (
    public.gen_ref('MVT'), v_eq.id, v_eq.designation, p_return_pool, 'sortie_reparation',
    v_mnt.qty, v_prev, v_new, v_mnt.reference, v_user_id, COALESCE(v_user_name, ''),
    'Fin maintenance : ' || COALESCE(p_repair_details, '')
  );

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- 7. ANNULATION ATOMIQUE D'UNE LOCATION (RESTAURATION STOCK)
CREATE OR REPLACE FUNCTION public.cancel_rental_tx(
  p_rental_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_name TEXT;
  v_rental RECORD;
  v_ri RECORD;
  v_eq RECORD;
  v_unreturned NUMERIC(12,2);
  v_prev NUMERIC(12,2);
  v_new NUMERIC(12,2);
BEGIN
  IF NOT public.is_active_user() THEN RAISE EXCEPTION 'Accès non autorisé'; END IF;
  SELECT full_name INTO v_user_name FROM public.user_profiles WHERE id = v_user_id;
  SELECT * INTO v_rental FROM public.rentals WHERE id = p_rental_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Location introuvable'; END IF;
  IF v_rental.status IN ('terminee', 'annulee') THEN RAISE EXCEPTION 'Location déjà clôturée ou annulée'; END IF;

  FOR v_ri IN SELECT * FROM public.rental_items WHERE rental_id = v_rental.id FOR UPDATE LOOP
    v_unreturned := GREATEST(0, v_ri.qty_rented - v_ri.qty_returned - v_ri.qty_missing);
    IF v_unreturned > 0 THEN
      SELECT * INTO v_eq FROM public.equipment WHERE id = v_ri.equipment_id FOR UPDATE;
      v_prev := v_eq.qty_rental_available;
      v_new := v_prev + v_unreturned;
      UPDATE public.equipment
      SET qty_rental_available = v_new,
          qty_rented = GREATEST(0, qty_rented - v_unreturned),
          status = 'disponible',
          updated_at = NOW()
      WHERE id = v_eq.id;

      IF v_ri.equipment_unit_id IS NOT NULL THEN
        UPDATE public.equipment_units SET status = 'disponible' WHERE id = v_ri.equipment_unit_id;
      END IF;

      INSERT INTO public.stock_movements (
        reference, equipment_id, equipment_designation, stock_pool, movement_type,
        quantity, previous_qty, new_qty, related_operation, user_id, user_name, notes
      ) VALUES (
        public.gen_ref('MVT'), v_eq.id, v_eq.designation, 'location', 'retour_location',
        v_unreturned, v_prev, v_new, v_rental.reference, v_user_id, COALESCE(v_user_name, ''),
        'Annulation location : ' || COALESCE(p_reason, '')
      );
    END IF;
  END LOOP;

  UPDATE public.rentals SET status = 'annulee', notes = COALESCE(notes, '') || ' | Annulée: ' || COALESCE(p_reason, '') WHERE id = v_rental.id;
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- 8. CRÉATION ATOMIQUE D'UN ORDRE DE SERVICE TECHNIQUE
CREATE OR REPLACE FUNCTION public.create_service_tx(
  p_customer_id UUID,
  p_service_type_id UUID,
  p_service_type_name TEXT,
  p_description TEXT,
  p_service_date DATE,
  p_expected_start_date DATE,
  p_expected_end_date DATE,
  p_agreed_price NUMERIC,
  p_advance_paid NUMERIC,
  p_payment_method TEXT,
  p_status TEXT,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_cust RECORD;
  v_srv_id UUID;
  v_srv_ref TEXT;
BEGIN
  IF NOT public.is_active_user() THEN RAISE EXCEPTION 'Accès non autorisé'; END IF;
  SELECT id, name INTO v_cust FROM public.customers WHERE id = p_customer_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Client introuvable'; END IF;

  v_srv_ref := public.gen_ref('SRV');
  INSERT INTO public.services (
    reference, customer_id, customer_name, service_type_id, service_type_name,
    description, service_date, expected_start_date, expected_end_date,
    agreed_price, amount_paid, status, notes, created_by
  ) VALUES (
    v_srv_ref, v_cust.id, v_cust.name, p_service_type_id, p_service_type_name,
    p_description, COALESCE(p_service_date, CURRENT_DATE), p_expected_start_date, p_expected_end_date,
    COALESCE(p_agreed_price, 0), COALESCE(p_advance_paid, 0),
    COALESCE(p_status, 'en_attente'), COALESCE(p_notes, ''), v_user_id
  )
  RETURNING id INTO v_srv_id;

  IF COALESCE(p_advance_paid, 0) > 0 THEN
    INSERT INTO public.payments (
      reference, payment_date, customer_id, customer_name,
      operation_type, service_id, operation_reference,
      amount, payment_method, notes, created_by
    ) VALUES (
      public.gen_ref('PAY'), NOW(), v_cust.id, v_cust.name,
      'service', v_srv_id, v_srv_ref,
      p_advance_paid, COALESCE(p_payment_method, 'Espèces'),
      'Avance à la création du service', v_user_id
    );
  END IF;

  RETURN jsonb_build_object('id', v_srv_id, 'reference', v_srv_ref);
END;
$$;

-- 9. PAIEMENT FOURNISSEUR ATOMIQUE
CREATE OR REPLACE FUNCTION public.record_supplier_payment_tx(
  p_supplier_id UUID,
  p_purchase_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT,
  p_payment_date DATE,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_pay_id UUID;
  v_pay_ref TEXT;
BEGIN
  IF NOT public.is_active_user() THEN RAISE EXCEPTION 'Accès non autorisé'; END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN RAISE EXCEPTION 'Le montant doit être positif'; END IF;

  IF p_purchase_id IS NOT NULL THEN
    UPDATE public.supplier_purchases SET amount_paid = amount_paid + p_amount WHERE id = p_purchase_id;
  END IF;

  v_pay_ref := public.gen_ref('PF');
  INSERT INTO public.supplier_payments (
    reference, supplier_id, purchase_id, payment_date, amount, payment_method, notes, created_by
  ) VALUES (
    v_pay_ref, p_supplier_id, p_purchase_id, COALESCE(p_payment_date, CURRENT_DATE), p_amount,
    COALESCE(p_payment_method, 'Espèces'), COALESCE(p_notes, ''), v_user_id
  )
  RETURNING id INTO v_pay_id;

  RETURN jsonb_build_object('id', v_pay_id, 'reference', v_pay_ref);
END;
$$;

-- 11. SUPPRESSION SÉCURISÉE D'UN COMPTE UTILISATEUR (AVEC PRÉSERVATION DE L'HISTORIQUE)
CREATE OR REPLACE FUNCTION public.delete_user_account_tx(
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_target_email TEXT;
BEGIN
  IF v_caller_id IS NULL OR NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Seul un administrateur actif peut supprimer un compte utilisateur.';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant utilisateur manquant.';
  END IF;

  IF p_target_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas supprimer le compte actuellement connecté.';
  END IF;

  SELECT email INTO v_target_email FROM public.user_profiles WHERE id = p_target_user_id;
  IF v_target_email IS NULL THEN
    SELECT email INTO v_target_email FROM auth.users WHERE id = p_target_user_id;
  END IF;

  -- Dissocier les références d'audit afin de préserver tout l'historique opérationnel
  UPDATE public.supplier_purchases SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.supplier_payments SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.rentals SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.rental_returns SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.sales SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.services SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.payments SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.expenses SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.maintenance_records SET created_by = NULL WHERE created_by = p_target_user_id;
  UPDATE public.stock_movements SET user_id = NULL WHERE user_id = p_target_user_id;

  DELETE FROM public.user_profiles WHERE id = p_target_user_id;
  DELETE FROM auth.users WHERE id = p_target_user_id;

  RETURN jsonb_build_object(
    'deleted', TRUE,
    'user_id', p_target_user_id,
    'email', COALESCE(v_target_email, '')
  );
END;
$$;

