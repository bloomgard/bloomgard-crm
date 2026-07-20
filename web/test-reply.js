require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: emails } = await supabase
    .from('inbound_emails')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);

  console.log("Recent Inbound Emails:");
  emails.forEach(e => {
    console.log(`- Subject: ${e.subject}`);
    console.log(`  Thread ID: ${e.thread_id}`);
    console.log(`  Message ID: ${e.message_id}`);
    console.log(`  From: ${e.sender_email}`);
    console.log(`  Time: ${e.created_at}`);
  });
  
  if (emails.length > 0) {
      const qnMatch = emails[0].subject.match(/QN-\d{4}-\d{3}(?:-Rev-\d+)?/);
      console.log(`\nQuote Match in last email: ${qnMatch ? qnMatch[0] : 'None'}`);
      
      if (qnMatch) {
          const { data: quote } = await supabase.from('quotations').select('*').eq('qn_number', qnMatch[0]).single();
          if (quote) {
              console.log(`\nFound Quote: ${quote.qn_number}`);
              console.log(`Follow-up status: ${quote.follow_up_status}`);
              console.log(`Custom metadata follow-up status: ${quote.custom_metadata?.follow_up_status}`);
          }
      }
  }
}
run();
