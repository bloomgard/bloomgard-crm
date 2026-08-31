import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

/**
 * Human-readable digest of a tenant's manual Master Data for LLM prompts.
 * Lists every key (with or without an AI description), a capped sample of its
 * values, the total count, and which parent key a dependent choice hangs off.
 */
export async function buildMasterDataContext(tenantId: string): Promise<string> {
  const { data: entries } = await supabase
    .from('master_data_entries')
    .select('id, key_name, parent_id, ai_description')
    .eq('tenant_id', tenantId)
    .eq('tab_type', 'manual');
  if (!entries || entries.length === 0) return '';

  const { data: values } = await supabase
    .from('master_data_values')
    .select('entry_id, value_text')
    .in('entry_id', entries.map((e) => e.id));

  const CAP = 25;
  const total = new Map<string, number>();
  const byEntry = new Map<string, string[]>();
  (values || []).forEach((v) => {
    total.set(v.entry_id, (total.get(v.entry_id) || 0) + 1);
    if (!byEntry.has(v.entry_id)) byEntry.set(v.entry_id, []);
    const list = byEntry.get(v.entry_id)!;
    if (list.length < CAP && !list.includes(v.value_text)) list.push(v.value_text);
  });

  const byId = new Map(entries.map((e) => [e.id, e]));
  const lines = entries.map((e) => {
    const vals = byEntry.get(e.id) || [];
    const parent = e.parent_id ? byId.get(e.parent_id) : null;
    const rel = parent ? ` (choice depends on ${parent.key_name})` : '';
    const desc = e.ai_description ? ` — ${e.ai_description}` : '';
    const more = (total.get(e.id) || 0) > vals.length ? `, … (${total.get(e.id)} total)` : '';
    const sample = vals.length ? `: ${vals.join(', ')}${more}` : '';
    return `- ${e.key_name}${rel}${desc}${sample}`;
  });

  return `MASTER DATA (authoritative company facts — use these for any product, code, pricing, UOM or terms specifics; do not invent values):\n${lines.join('\n')}`;
}
