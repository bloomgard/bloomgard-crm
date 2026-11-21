import { createClient } from '@supabase/supabase-js';

/**
 * Quote numbers (QN-2026-291) are allocated here, on the server, from every quote in the workspace.
 *
 * They used to be worked out in each person's browser from the quotes it had loaded when the page
 * opened, so two people (or one person with an old tab) got the same number. The database has no
 * unique constraint to fall back on, so allocation is two steps:
 *   1. next  — the highest number in the workspace right now, plus one
 *   2. verify — after the quote is saved: if another quote got the same number first, this one
 *               moves to the next free number (a revision moves to its next free Rev instead)
 *
 * Self-contained on purpose (its own service-role client, no app imports) so it can ship to
 * production on its own.
 */
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key',
  { auth: { persistSession: false } },
);

/** Today in India (the server runs on UTC, which is 5½ hours behind). */
export function todayIST(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const BASE = /^QN-(\d+)-(\d+)/i;
const REV = /-Rev-(\d+)$/i;

async function allNumbers(tenantId: string): Promise<Array<{ id: string; qn_number: string | null; created_at: string }>> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('quotations').select('id, qn_number, created_at').eq('tenant_id', tenantId)
      .order('created_at', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const maxBase = (rows: Array<{ qn_number: string | null }>) =>
  rows.reduce((m, r) => { const x = String(r.qn_number || '').match(BASE); return x ? Math.max(m, parseInt(x[2], 10)) : m; }, 0);

const format = (n: number) => `QN-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`;

/** The next quote number for this workspace. */
export async function nextQuoteNumber(tenantId: string): Promise<string> {
  return format(maxBase(await allNumbers(tenantId)) + 1);
}

/**
 * Call after saving a quote. If an earlier quote in the workspace already has this number, give
 * this one a free number and save it. Returns the number the quote ends up with.
 */
export async function settleQuoteNumber(tenantId: string, quoteId: string): Promise<{ qn: string; renumbered: boolean; was?: string }> {
  let was: string | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    const rows = await allNumbers(tenantId);
    const me = rows.find((r) => r.id === quoteId);
    if (!me || !me.qn_number) throw new Error('No such quote.');
    const same = rows.filter((r) => String(r.qn_number).toLowerCase() === String(me.qn_number).toLowerCase());
    // the earliest holder keeps the number
    same.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
    if (same.length <= 1 || same[0].id === quoteId) return { qn: me.qn_number, renumbered: !!was, ...(was ? { was } : {}) };

    was ||= me.qn_number;
    let next: string;
    const rev = me.qn_number.match(REV);
    if (rev) {
      const stem = me.qn_number.replace(REV, '');
      const taken = rows.map((r) => String(r.qn_number || '')).filter((q) => q.toLowerCase().startsWith(stem.toLowerCase() + '-rev-'))
        .map((q) => parseInt(q.match(REV)?.[1] || '0', 10));
      next = `${stem}-Rev-${Math.max(parseInt(rev[1], 10), ...taken) + 1}`;
    } else {
      next = format(maxBase(rows) + 1);
    }
    const { error } = await db.from('quotations').update({ qn_number: next }).eq('id', quoteId).eq('tenant_id', tenantId);
    if (error) throw new Error(error.message);
    // loop: check the new number too, in case someone took it in the meantime
  }
  throw new Error('Could not find a free quote number.');
}

/** Who is calling: their workspace, from their own sign-in token (never from the request body). */
export async function callerTenant(request: Request): Promise<string | null> {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data } = await db.auth.getUser(token);
  if (!data?.user) return null;
  const { data: p } = await db.from('profiles').select('tenant_id').eq('id', data.user.id).maybeSingle();
  return p?.tenant_id || null;
}
