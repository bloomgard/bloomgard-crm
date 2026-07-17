require('dotenv').config({ path: '.env.local' });
async function check() {
  const res = await fetch("https://api.resend.com/emails/325c36c5-6f86-4e5f-9b25-775eba3a649e", {
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` }
  });
  const data = await res.json();
  console.log(res.status, data);
}
check();
