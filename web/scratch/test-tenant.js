require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: q } = await supabase.from('quotations').select('tenant_id').eq('qn_number', 'QN-2026-006-Rev-3').single();
  const tenantId = q.tenant_id;
  
  const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
  console.log("Tenant:", tenant);
}
run();
