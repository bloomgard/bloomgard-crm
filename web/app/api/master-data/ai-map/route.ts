import { authenticate, db } from '@/lib/agent/core';
import { logAiUsage } from '@/utils/usageLogger';

export const maxDuration = 60;

type Col = { column: number; action: 'map' | 'new' | 'ignore'; target: string | null; new_key: string | null; confidence: number; reason: string; question: string | null; options: string[] };
const keyOf = (s: string) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Read an uploaded sheet and predict where each column belongs: an existing field, a new field, or nowhere.
 * Anything below ~70% confidence comes back with a question so the person decides.
 */
export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return Response.json({ error: 'Not signed in' }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const headers: string[] = (body?.headers || []).map((h: any) => String(h ?? '').slice(0, 80)).slice(0, 40);
  const rows: string[][] = (body?.rows || []).slice(0, 12).map((r: any[]) => headers.map((_, i) => String(r?.[i] ?? '').slice(0, 60)));
  const formFields: string[] = (body?.fields || []).map(String).slice(0, 120);
  if (!headers.length) return Response.json({ error: 'No columns' }, { status: 400 });

  // What already exists in this workspace's catalogue, with real examples, so matching is by content not just name.
  const { data: entries } = await db.from('master_data_entries').select('id, key_name, parent_id, ai_description').eq('tenant_id', ctx.tenantId).eq('tab_type', 'manual');
  const ids = (entries || []).map((e: any) => e.id);
  const { data: vals } = ids.length ? await db.from('master_data_values').select('entry_id, value_text').in('entry_id', ids).limit(2000) : { data: [] as any[] };
  const existing = (entries || []).map((e: any) => ({
    key: e.key_name, parent: (entries || []).find((p: any) => p.id === e.parent_id)?.key_name || null, description: e.ai_description || undefined,
    examples: Array.from(new Set((vals || []).filter((v: any) => v.entry_id === e.id).map((v: any) => v.value_text))).slice(0, 6),
  }));
  const targets = Array.from(new Set([...existing.map((e) => e.key), ...formFields]));
  const sheet = headers.map((h, i) => ({ column: i, header: h, samples: rows.map((r) => r[i]).filter(Boolean).slice(0, 8) }));

  const prompt = `You map the columns of a spreadsheet a user uploaded into their product catalogue (Master Data).
Existing catalogue keys (with real example values and their parent in the code -> name -> unit -> rate chain):
${JSON.stringify(existing)}
Quote-form field keys that may also be targets: ${JSON.stringify(formFields)}
Sheet columns with sample values: ${JSON.stringify(sheet)}

For EVERY sheet column decide:
- "map" to one target key (only keys from the lists above), judging by the sample VALUES as much as the header,
- "new" when it is useful catalogue data with no matching key (give new_key in snake_case),
- "ignore" for serial numbers, blank, totals or junk columns.
Confidence 0..1. Below 0.7, write a short plain question for the user and 2-3 options (target keys, "new:<key>" or "ignore").
Never map two columns to the same target; if two compete, keep the better one and ask about the other.
Also give "order": the column indices to import, parent first (usually code, then name, then unit, then rate), leaving out ignored ones.
Reply as JSON: {"columns":[{"column":0,"action":"map","target":"item_code","new_key":null,"confidence":0.95,"reason":"...","question":null,"options":[]}],"order":[0,1],"summary":"one sentence"}`;

  let usage: any = null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ''}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://cma.bloomgard.co', 'X-Title': 'Bloomgard CMA' },
      body: JSON.stringify({ model: 'openai/gpt-4o-2024-11-20', temperature: 0.1, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`AI service returned ${res.status}`);
    const out = await res.json();
    usage = out.usage;
    const parsed = JSON.parse(out.choices?.[0]?.message?.content || '{}');

    // Validate everything the model said; it only ever suggests.
    const used = new Map<string, Col>();
    const columns: Col[] = headers.map((_, i) => {
      const c = (parsed.columns || []).find((x: any) => Number(x.column) === i) || {};
      let action: Col['action'] = ['map', 'new', 'ignore'].includes(c.action) ? c.action : 'ignore';
      let target: string | null = action === 'map' && targets.includes(c.target) ? c.target : null;
      if (action === 'map' && !target) action = c.new_key ? 'new' : 'ignore';
      const newKey = action === 'new' ? keyOf(c.new_key || headers[i]) || null : null;
      let confidence = Math.max(0, Math.min(1, Number(c.confidence) || 0));
      let question: string | null = c.question || null;
      const options = (Array.isArray(c.options) ? c.options : []).map(String).filter((o: string) => o === 'ignore' || o.startsWith('new:') || targets.includes(o)).slice(0, 3);
      const col: Col = { column: i, action, target, new_key: newKey, confidence, reason: String(c.reason || '').slice(0, 200), question, options };
      if (target) {
        const prev = used.get(target);
        if (prev) {
          const loser = prev.confidence >= col.confidence ? col : prev;
          loser.question = `Both "${headers[prev.column]}" and "${headers[col.column]}" look like ${target}. Which is it for "${headers[loser.column]}"?`;
          loser.confidence = Math.min(loser.confidence, 0.5);
          loser.options = Array.from(new Set([target, `new:${keyOf(headers[loser.column])}`, 'ignore']));
          if (loser === prev) used.set(target, col);
        } else used.set(target, col);
      }
      if (col.confidence < 0.7 && !col.question) col.question = `Where should "${headers[i]}" go?`;
      if (col.confidence < 0.7 && !col.options.length) col.options = [...(target ? [target] : []), `new:${keyOf(headers[i])}`, 'ignore'];
      if (col.confidence >= 0.7) col.question = null;
      return col;
    });
    const order = (Array.isArray(parsed.order) ? parsed.order : []).map(Number).filter((n: number) => Number.isInteger(n) && n >= 0 && n < headers.length);
    return Response.json({ columns, order: Array.from(new Set(order)), summary: String(parsed.summary || '').slice(0, 300), targets });
  } catch (e: any) {
    return Response.json({ error: e.message || 'Could not read the sheet' }, { status: 502 });
  } finally {
    if (usage) logAiUsage(ctx.tenantId, ctx.userId, 'master-data-map', usage).catch(() => {});
  }
}
