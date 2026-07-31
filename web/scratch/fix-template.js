const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/tenant_schemas';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  // 1. Fetch
  const res = await fetch(url + '?select=id,html_template&limit=1', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  const data = await res.json();
  let template = data[0].html_template;
  
  // 2. Replace
  if (template.includes('<h1>Your Company</h1>')) {
    template = template.replace('<h1>Your Company</h1>', '<img src="{{{company_logo}}}" style="max-height: 80px;" alt="Logo" />\n        <h1>Your Company</h1>');
  } else if (!template.includes('company_logo')) {
    // If we can't find <h1>Your Company</h1>, just inject it into the header div
    template = template.replace('<div class="header">', '<div class="header">\n      <img src="{{{company_logo}}}" style="max-height: 80px;" alt="Logo" />');
  }
  
  // 3. Update
  const updateRes = await fetch(url + '?id=eq.' + data[0].id, {
    method: 'PATCH',
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ html_template: template })
  });
  
  console.log("Update status:", updateRes.status);
}
run();
