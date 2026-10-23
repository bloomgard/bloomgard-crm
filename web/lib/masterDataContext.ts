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
export async function buildMasterDataContext(tenantId: string, relevantText = ''): Promise<string> {
  const { data: entries } = await supabase
    .from('master_data_entries')
    .select('id, key_name, parent_id, ai_description')
    .eq('tenant_id', tenantId)
    .eq('tab_type', 'manual');
  if (!entries || entries.length === 0) return '';

  const { data: values } = await supabase
    .from('master_data_values')
    .select('id, entry_id, value_text, parent_value_id')
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

  const rows = relevantText ? matchingRows(entries, values || [], relevantText) : '';

  return `MASTER DATA (authoritative company facts — use these for any product, code, pricing, UOM or terms specifics; do not invent values):\n${lines.join('\n')}${rows}`;
}

/**
 * Linked rows (e.g. code | name | unit | rate) for the catalogue items the email actually mentions.
 * The per-key samples above are capped, so without this the model cannot see the real rate of a
 * specific item in a large catalogue and tends to invent one.
 */
function matchingRows(entries: any[], values: any[], text: string): string {
  const hay = text.toLowerCase();
  const byId = new Map(entries.map((e) => [e.id, e]));
  const vById = new Map(values.map((v) => [v.id, v]));
  const hasChild = new Set(values.map((v) => v.parent_value_id).filter(Boolean));
  const leaves = values.filter((v) => !hasChild.has(v.id) && v.parent_value_id);
  const words = new Set(hay.match(/[a-z0-9][a-z0-9.\-/]{3,}/g) || []);
  const out: string[] = [];
  for (const leaf of leaves) {
    const chain: any[] = [];
    for (let cur: any = leaf, n = 0; cur && n < 10; cur = vById.get(cur.parent_value_id), n++) chain.unshift(cur);
    const hit = chain.some((v) => {
      const t = String(v.value_text || '').trim().toLowerCase();
      if (t.length < 3 || /^[\d.,]+$/.test(t)) return false;
      return hay.includes(t) || t.split(/\s+/).some((w) => w.length >= 4 && words.has(w));
    });
    if (!hit) continue;
    out.push('- ' + chain.map((v) => `${byId.get(v.entry_id)?.key_name}=${v.value_text}`).join(' | '));
    if (out.length >= 30) break;
  }
  return out.length
    ? `\n\nCATALOGUE ROWS MATCHING THIS EMAIL (exact linked values — quote these code/name/unit/rate combinations):\n${out.join('\n')}`
    : '';
}
