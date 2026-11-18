import { db, type AgentCtx } from '@/lib/agent/core';
import { createRec, listRecs, teamMembers } from './store';
import { notify } from './notify';
import type { CommentData, Rec } from './types';

type Member = { id: string; email: string; full_name: string | null; role: string };

/**
 * Find who a note mentions. "@Priya Shah", "@priya" (first name) and "@priya@acme.com" all work; the
 * longest full-name match wins so "@Priya Shah" never also pings a different "Priya".
 */
export function parseMentions(body: string, members: Member[]): string[] {
  const text = String(body || '');
  const found = new Set<string>();
  const lower = text.toLowerCase();
  // emails first
  for (const m of text.matchAll(/@([^\s@,;:()]+@[^\s@,;:()]+\.[a-z]{2,})/gi)) {
    const mem = members.find((x) => String(x.email).toLowerCase() === m[1].toLowerCase());
    if (mem) found.add(mem.id);
  }
  // full names, longest first, then first names
  const byNameLen = [...members].filter((m) => m.full_name).sort((a, b) => String(b.full_name).length - String(a.full_name).length);
  for (const m of byNameLen) {
    const name = String(m.full_name).toLowerCase().trim();
    if (!name) continue;
    const idx = lower.indexOf('@' + name);
    if (idx >= 0) {
      const after = lower[idx + 1 + name.length];
      if (after === undefined || !/[a-z0-9]/.test(after)) found.add(m.id);
    }
  }
  for (const tok of text.matchAll(/@([a-z][\w.-]*)/gi)) {
    const t = tok[1].toLowerCase();
    if (t.includes('@')) continue;
    const firsts = members.filter((m) => String(m.full_name || '').toLowerCase().split(/\s+/)[0] === t
      || String(m.email).toLowerCase().split('@')[0] === t);
    if (firsts.length === 1) found.add(firsts[0].id);   // ambiguous first names ping nobody rather than the wrong person
  }
  return [...found];
}

/** Add an internal note to a quote. @mentions notify the people mentioned. */
export async function addComment(
  tenantId: string,
  c: { quote_id: string; body: string; author_id: string; author_email: string; author_name?: string | null; qn?: string | null },
): Promise<Rec<CommentData>> {
  const body = String(c.body || '').trim();
  if (!body) throw new Error('Write something first.');
  if (body.length > 4000) throw new Error('Keep a note under 4,000 characters.');
  const members = await teamMembers(tenantId);
  const mentions = parseMentions(body, members).filter((id) => id !== c.author_id);
  const rec = await createRec<CommentData>(tenantId, 'comment', body.slice(0, 120), {
    quote_id: c.quote_id, body, author_id: c.author_id, author_email: c.author_email,
    author_name: c.author_name || null, mentions,
  });
  const who = c.author_name || c.author_email;
  if (mentions.length) {
    await notify(tenantId, mentions, {
      title: `${who} mentioned you${c.qn ? ` on ${c.qn}` : ''}`,
      body: body.length > 160 ? body.slice(0, 157) + '…' : body,
      link: { view: 'pipeline', quote_id: c.quote_id },
      from_email: c.author_email,
    });
  }
  try {
    const { emit } = await import('./events');
    await emit({ type: 'comment.added', tenantId, quoteId: c.quote_id, actorEmail: c.author_email, data: { comment_id: rec.id, body, mentions } });
  } catch { /* the note is saved; automations are best effort */ }
  return rec;
}

/**
 * A quote the caller may see: in their workspace, and for an agent, one they created. Returns
 * null otherwise, so a route answers "no such quote" rather than revealing it exists elsewhere.
 */
export async function quoteForCtx(ctx: AgentCtx, quoteId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(String(quoteId || ''))) return null;
  const { data } = await db.from('quotations').select('id, qn_number, created_by_email, status, tenant_id')
    .eq('id', quoteId).eq('tenant_id', ctx.tenantId).maybeSingle();
  if (!data) return null;
  if (!ctx.isManager && String(data.created_by_email || '').toLowerCase() !== String(ctx.email).toLowerCase()) return null;
  return data as { id: string; qn_number: string | null; created_by_email: string | null; status: string | null; tenant_id: string };
}

export async function listComments(tenantId: string, quoteId: string): Promise<Rec<CommentData>[]> {
  const rows = await listRecs<CommentData>(tenantId, 'comment', { match: { quote_id: quoteId }, newestFirst: false, limit: 300 });
  return rows;
}
