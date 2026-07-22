-- 1. Ensure usage_metrics table exists
CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  tokens_used BIGINT DEFAULT 0,
  emails_sent BIGINT DEFAULT 0,
  quotes_made BIGINT DEFAULT 0,
  month_year TEXT NOT NULL -- e.g., '2026-07'
);

-- Ensure features_jsonb exists on tenants
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='features_jsonb') THEN
    ALTER TABLE tenants ADD COLUMN features_jsonb JSONB DEFAULT '{"ai_email": {"enabled": false, "billable": false}, "analytics": {"enabled": false, "billable": false}, "custom_branding": {"enabled": false, "billable": false}}'::jsonb;
  END IF;
END
$$;

-- 2. Apply Row-Level Security (RLS)
-- First, enable RLS on all operational tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_data ENABLE ROW LEVEL SECURITY;

-- Helper function to check if super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing policies if any to avoid conflicts
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('tenants', 'profiles', 'quotations', 'usage_metrics', 'tenant_schemas', 'master_data')) 
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- Policies for 'tenants' table
CREATE POLICY super_admin_all_tenants ON tenants FOR ALL USING (is_super_admin());
CREATE POLICY tenant_isolation_tenants ON tenants FOR ALL USING (id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Policies for 'profiles' table
CREATE POLICY super_admin_all_profiles ON profiles FOR ALL USING (is_super_admin());
CREATE POLICY tenant_isolation_profiles ON profiles FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles p WHERE p.id = auth.uid()));

-- Policies for 'quotations' table
CREATE POLICY super_admin_all_quotations ON quotations FOR ALL USING (is_super_admin());
CREATE POLICY tenant_isolation_quotations ON quotations FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Policies for 'usage_metrics' table
CREATE POLICY super_admin_all_usage_metrics ON usage_metrics FOR ALL USING (is_super_admin());
CREATE POLICY tenant_isolation_usage_metrics ON usage_metrics FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Policies for 'tenant_schemas' table
CREATE POLICY super_admin_all_tenant_schemas ON tenant_schemas FOR ALL USING (is_super_admin());
CREATE POLICY tenant_isolation_tenant_schemas ON tenant_schemas FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Policies for 'master_data' table
CREATE POLICY super_admin_all_master_data ON master_data FOR ALL USING (is_super_admin());
CREATE POLICY tenant_isolation_master_data ON master_data FOR ALL USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
