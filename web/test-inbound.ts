// test-inbound.ts
// Run this script using `npx tsx --env-file=../.env.local test-inbound.ts` 
// to simulate a Resend webhook hitting your local API route.

const LOCAL_URL = 'http://localhost:3000/api/inbound-email';

async function testWebhook(type: 'normal' | 'google_trap') {
  console.log(`\n--- Testing ${type} email ---`);
  
  const payload = {
    type: 'email.received',
    data: {
      to: 'jeevanecotex890@inbound.bloomgard.co', // Assuming 'demo' is the inbound_routing_id
      from: type === 'google_trap' ? 'forwarding-noreply@google.com' : 'client@example.com',
      subject: type === 'google_trap' ? 'Gmail Forwarding Confirmation' : 'Hello about my quote',
      text: 'This is the plain text body of the email.',
      html: '<p>This is the HTML body</p>'
    }
  };

  try {
    const response = await fetch(LOCAL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('Status Code:', response.status);
    console.log('Response:', data);
  } catch (error: any) {
    console.error('Fetch error:', error.message);
  }
}

async function run() {
  await testWebhook('normal');
  await testWebhook('google_trap');
}

run();
