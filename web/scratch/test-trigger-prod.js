require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function testTrigger() {
    const threadId = '0106019f729a0b13-3945fb3e-b46f-4981-aa4e-95557744de0f-000000@ap-northeast-1.amazonses.com';
    const tenantId = 'fa4f1252-36e2-4b4c-8926-c0434953518c';
    
    console.log("Triggering auto-reply for tenant:", tenantId);
    
    try {
        const res = await fetch('https://bloomgard-crm-git-deployment-bloomgard.vercel.app/api/ai-auto-reply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId, tenantId })
        });
        const text = await res.text();
        console.log("Response:", res.status, text);
    } catch(e) {
        console.log("Error:", e);
    }
}
testTrigger();
