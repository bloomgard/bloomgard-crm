require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const tenantId = 'fa4f1252-36e2-4b4c-8926-c0434953518c';
  
  const { data: schema } = await supabase.from('tenant_schemas').select('schema_config').eq('tenant_id', tenantId).single();
  console.log("Schema Config:", schema?.schema_config);
  
  if (schema?.schema_config) {
      try {
          const aiSettingsConfig = schema.schema_config.find(s => s.is_ai_settings);
          console.log("Settings found:", aiSettingsConfig);
      } catch (e) {
          console.log("Error in find():", e);
      }
  }
}
run();
