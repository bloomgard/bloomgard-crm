const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function test() {
  const { data, error } = await supabase
    .from('inbound_emails')
    .select('from_email')
    .ilike('subject', '%QN-2026-004-Rev-1%')
    .order('created_at', { ascending: false })
    .limit(1);
  console.log("Data:", data);
  console.log("Error:", error);
}
test();
