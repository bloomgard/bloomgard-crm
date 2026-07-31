const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data } = await supabase.from('tenant_schemas').select('html_template').limit(1);
  const t = data?.[0]?.html_template || '';
  const idx = t.indexOf('company_logo');
  if (idx !== -1) {
    console.log("FOUND AT", idx);
    console.log(t.substring(idx - 100, idx + 100));
  } else {
    console.log("NOT FOUND IN TEMPLATE");
  }
}
check();
