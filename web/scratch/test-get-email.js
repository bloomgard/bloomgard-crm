const { Resend } = require('resend');
require('dotenv').config({ path: '.env.local' });
const resend = new Resend(process.env.RESEND_API_KEY);

async function check() {
  console.log("Fetching email...");
  try {
    const { data, error } = await resend.emails.get("325c36c5-6f86-4e5f-9b25-775eba3a649e");
    if (error) {
        console.error("API Error Details:", JSON.stringify(error, null, 2));
    } else {
        console.log("Success! Data:", data);
    }
  } catch(e) {
    console.error("Crash:", e);
  }
}
check();
