require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function testTrigger() {
    const threadId = '0106019f729a0b13-3945fb3e-b46f-4981-aa4e-95557744de0f-000000@ap-northeast-1.amazonses.com';
    const tenantId = '6be5bfa0-5629-4171-bad7-7c73faaa09eb'; // get it from DB
    
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const {data: q} = await supabase.from('quotations').select('tenant_id').eq('qn_number', 'QN-2026-006-Rev-3').single();
    
    console.log("Triggering auto-reply for tenant:", q.tenant_id);
    
    try {
        const res = await fetch('http://localhost:3000/api/ai-auto-reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId, tenantId: q.tenant_id })
        });
        const text = await res.text();
        console.log("Response:", res.status, text);
    } catch(e) {
        console.log("Error:", e);
    }
}
testTrigger();
