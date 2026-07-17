async function check() {
  const res = await fetch("https://api.resend.com/emails/325c36c5-6f86-4e5f-9b25-775eba3a649e", {
    headers: { 'Authorization': 'Bearer re_8CEMCQLa_LVTkZoCwpUV2asZVaY6UwTVn' }
  });
  const data = await res.json();
  console.log(res.status, data);
}
check();
