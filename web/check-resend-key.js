const { Resend } = require('resend');
require('dotenv').config({ path: '.env.local' });
const resend = new Resend(process.env.RESEND_API_KEY);

async function check() {
  console.log("Checking API key...");
  try {
    const { data, error } = await resend.domains.list();
    if (error) console.error("API Key Error:", error);
    else console.log("API Key has Full Access! Domains:", data);
  } catch (e) {
    console.error("Crash:", e);
  }
}
check();
