require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function runDiagnostics() {
  const { data: quotes, error } = await supabase
    .from('quotations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error("DB Error:", error);
    return;
  }

  console.log(`Fetched ${quotes.length} recent quotes.\n`);

  quotes.forEach(r => {
    console.log(`\n--- Quote: ${r.qn_number || r.id} ---`);
    console.log(`Status: ${r.status}`);
    console.log(`Follow up status: ${r.follow_up_status || r.custom_metadata?.follow_up_status || 'None'}`);
    console.log(`Created By: ${r.created_by_email}`);
    
    let filterPass = true;
    let triageStatusFilters = ['Inquiry', 'Pending'];
    if (triageStatusFilters.length > 0) {
      if (!r.status || !triageStatusFilters.includes(r.status)) filterPass = false;
    }

    let isAgentDispatched = r.follow_up_status === 'Agent Dispatched' || r.custom_metadata?.follow_up_status === 'Agent Dispatched';
    let isApprovedOrLost = r.status === 'Approved' || r.status === 'Lost';

    let dueDate = r.follow_up_due_date || r.custom_metadata?.follow_up_due_date;
    
    let daysOld = 0;
    const parseSafeDate = (dString) => {
      if (!dString) return new Date();
      if (typeof dString === 'number') return new Date(dString);
      const str = String(dString);
      if (str.match(/^\d{2}[\/\-]\d{2}[\/\-]\d{4}/)) {
        const parts = str.split(/[\/\-]/);
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00Z`);
      }
      const parsed = new Date(str);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    };

    const createdDate = parseSafeDate(r.date || r.created_at || Date.now());
    daysOld = (new Date().getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

    console.log(`Filter Match (Inquiry/Pending): ${filterPass}`);
    console.log(`Agent Dispatched: ${isAgentDispatched}`);
    console.log(`Due Date: ${dueDate || 'None'}`);
    console.log(`Days Old: ${daysOld}`);
    
    let isPending = false;
    if (filterPass && !isAgentDispatched) {
        if (!dueDate) {
            isPending = true; // 0 Days filter Bypass
        } else {
            isPending = parseSafeDate(dueDate) <= new Date();
        }
    }
    
    console.log(`==> WOULD IT SHOW UP IN PENDING? : ${isPending}`);
  });
}

runDiagnostics();
