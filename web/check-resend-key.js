const { Resend } = require('resend');
const resend = new Resend('re_65rYPQU4_5UBsHcTJuacqhgK2AyQZHr2r');

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
