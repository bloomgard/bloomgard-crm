const payload = {
  type: "email.received",
  created_at: new Date().toISOString(),
  data: {
    to: ["jeevanecotex890@inbound.bloomgard.co"],
    from: "test-client@example.com",
    subject: "Hello, this is a test from Antigravity!",
    email_id: "test_email_id_123",
    message_id: "test_msg_id_123"
  }
};

fetch("http://localhost:3000/api/inbound-email", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
})
.then(res => res.json().then(data => console.log("Status:", res.status, "Response:", data)))
.catch(err => console.error(err));
