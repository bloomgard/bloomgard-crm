require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: profiles } = await supabase.from('profiles').select('*').eq('role', 'super_admin');
  console.log("Super Admins:", profiles);

  const { data: tenants } = await supabase.from('tenants').select('*');
  console.log("Tenants:", tenants);
}
check();
