const { Resend } = require('resend');
const resend = new Resend('re_j3naomwp_Mhqjhk58nXYVtqAc1J1Kfc7K');

async function check() {
  console.log("Checking API key...");
  try {
    const { data, error } = await resend.domains.list();
    if (error) console.error("API Key Error:", error);
    else console.log("API Key has Full Access! Domains:", data);
  } catch(e) {
    console.error("Crash:", e);
  }
}
check();
