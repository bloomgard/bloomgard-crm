import { createClient } from '@supabase/supabase-js';

// We use the service role key to bypass client RLS rules, since this is a server-side trusted action.
// The tenant_id ensures it's billed/tracked to the correct tenant.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function logAiUsage(
  tenantId: string,
  userId: string | null,
  featureName: string,
  usageData: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
) {
  if (!tenantId) {
    console.error("logAiUsage: Missing tenantId");
    return;
  }

  const { prompt_tokens = 0, completion_tokens = 0, total_tokens = 0 } = usageData || {};
  
  if (total_tokens === 0) return; // No usage to log

  const { error } = await supabaseAdmin.from('tenant_token_usage').insert([{
    tenant_id: tenantId,
    user_id: userId,
    feature_name: featureName,
    prompt_tokens,
    completion_tokens,
    total_tokens
  }]);

  if (error) {
    console.error(`logAiUsage Error for feature ${featureName}:`, error.message);
  } else {
    console.log(`[Usage Logger] Logged ${total_tokens} tokens for ${featureName} (Tenant: ${tenantId})`);
  }
}

export async function logEmailSent(
  tenantId: string,
  recipient: string,
  subject: string
) {
  if (!tenantId) {
    console.error("logEmailSent: Missing tenantId");
    return;
  }

  const { error } = await supabaseAdmin.from('sent_emails').insert([{
    tenant_id: tenantId,
    recipient,
    subject
  }]);

  if (error) {
    console.error(`logEmailSent Error:`, error.message);
  } else {
    console.log(`[Usage Logger] Logged email sent to ${recipient} (Tenant: ${tenantId})`);
  }
}
