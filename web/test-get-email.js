const { Resend } = require('resend');
const resend = new Resend('re_65rYPQU4_5UBsHcTJuacqhgK2AyQZHr2r');

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
