require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: cols, error: e2 } = await supabase.from('master_data_entries').select('*').limit(1);
  if (e2) {
    console.log('Error:', e2.message);
  } else {
    console.log('Columns:', cols.length > 0 ? Object.keys(cols[0]).join(', ') : 'Table exists but is empty. We need to know if tenant_id exists.');
    // To get columns of empty table, insert a dummy and rollback, or just try selecting tenant_id
    const { error: e3 } = await supabase.from('master_data_entries').select('tenant_id').limit(1);
    if (e3) {
      console.log('tenant_id column missing!', e3.message);
    } else {
      console.log('tenant_id exists!');
    }
  }
}
check();
