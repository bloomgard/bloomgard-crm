import { db, AgentCtx } from '@/lib/agent/core';
import { createRec, deleteRec, getRec, listRecs, replaceRec, teamMembers } from './store';
import { notify } from './notify';
import type { BoardColumn, BoardData, CardData, Rec } from './types';

/**
 * Team → Planning: boards of cards in columns, like a Trello board, kept in the workspace store.
 * Anyone in the workspace can add and move cards; only a board's creator or a manager can rename,
 * restructure or delete the board itself. Assigning a card to someone tells them through the bell.
 */

export const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: 'backlog', name: 'Backlog' },
  { id: 'todo', name: 'To do' },
  { id: 'doing', name: 'In progress' },
  { id: 'review', name: 'Review' },
  { id: 'done', name: 'Done' },
];

const PRIORITIES = new Set(['low', 'normal', 'high']);
const slug = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'col';

const canManageBoard = (ctx: AgentCtx, b: Rec<BoardData>) => ctx.isManager || b.data.created_by === ctx.email;

function cleanColumns(cols: any): BoardColumn[] {
  if (!Array.isArray(cols)) throw new Error('A board needs columns.');
  const seen = new Set<string>();
  const out: BoardColumn[] = [];
  for (const c of cols.slice(0, 12)) {
    const name = String(c?.name || '').trim().slice(0, 40);
    if (!name) continue;
    let id = String(c?.id || '').trim() || slug(name);
    while (seen.has(id)) id = `${id}-${out.length}`;
    seen.add(id);
    out.push({ id, name });
  }
  if (!out.length) throw new Error('A board needs at least one column.');
  return out;
}

export async function listBoards(ctx: AgentCtx) {
  let boards = await listRecs<BoardData>(ctx.tenantId, 'board', { newestFirst: false, limit: 100 });
  if (!boards.length) {
    // every workspace starts with one board, so Planning is never an empty page
    boards = [await createRec<BoardData>(ctx.tenantId, 'board', 'Team plan', { columns: DEFAULT_COLUMNS, created_by: ctx.email })];
  }
  return boards.map((b) => ({ id: b.id, name: b.title, ...b.data, can_manage: canManageBoard(ctx, b) }));
}

async function board(ctx: AgentCtx, id: string) {
  const b = await getRec<BoardData>(ctx.tenantId, 'board', id);
  if (!b) throw new Error('No such board.');
  return b;
}

export async function boardCards(ctx: AgentCtx, boardId: string) {
  const cards = await listRecs<CardData>(ctx.tenantId, 'card', { match: { board_id: boardId }, limit: 1000, newestFirst: false });
  return cards
    .map((c) => ({ id: c.id, title: c.title, created_at: c.created_at, ...c.data }))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export async function createBoard(ctx: AgentCtx, body: { name?: string; columns?: any; description?: string }) {
  const name = String(body.name || '').trim().slice(0, 60);
  if (!name) throw new Error('Give the board a name.');
  const columns = body.columns ? cleanColumns(body.columns) : DEFAULT_COLUMNS;
  const rec = await createRec<BoardData>(ctx.tenantId, 'board', name, { columns, description: String(body.description || '').slice(0, 500), created_by: ctx.email });
  return { id: rec.id };
}

export async function updateBoard(ctx: AgentCtx, id: string, body: { name?: string; columns?: any; description?: string }) {
  const b = await board(ctx, id);
  if (!canManageBoard(ctx, b)) throw new Error('Only the board’s creator or a manager can change the board. Cards are open to everyone.');
  const next: BoardData = { ...b.data, updated_at: new Date().toISOString() };
  if (body.columns) {
    next.columns = cleanColumns(body.columns);
    // cards in a removed column move to the first one rather than disappearing
    const keep = new Set(next.columns.map((c) => c.id));
    const orphans = (await boardCards(ctx, id)).filter((c) => !keep.has(c.column));
    for (const c of orphans) await patchCard(ctx.tenantId, c.id, { column: next.columns[0].id });
  }
  if (body.description != null) next.description = String(body.description).slice(0, 500);
  const name = body.name != null ? String(body.name).trim().slice(0, 60) : undefined;
  if (name === '') throw new Error('Give the board a name.');
  await replaceRec(ctx.tenantId, 'board', id, next, name);
  return { ok: true };
}

export async function deleteBoard(ctx: AgentCtx, id: string) {
  const b = await board(ctx, id);
  if (!canManageBoard(ctx, b)) throw new Error('Only the board’s creator or a manager can delete it.');
  const all = await listRecs<BoardData>(ctx.tenantId, 'board', { limit: 100 });
  if (all.length <= 1) throw new Error('This is the only board. Rename it instead.');
  const cards = await boardCards(ctx, id);
  for (const c of cards) await deleteRec(ctx.tenantId, 'card', c.id);
  await deleteRec(ctx.tenantId, 'board', id);
  return { ok: true, removed_cards: cards.length };
}

/* ------------------------------------------------------------------------------------- cards */

async function patchCard(tenantId: string, id: string, patch: Partial<CardData>, title?: string) {
  const cur = await getRec<CardData>(tenantId, 'card', id);
  if (!cur) throw new Error('No such card.');
  await replaceRec(tenantId, 'card', id, { ...cur.data, ...patch, updated_at: new Date().toISOString() }, title);
}

/** Validate what a person typed into a card. Unknown keys are dropped. */
async function cleanCardPatch(ctx: AgentCtx, body: any, b: Rec<BoardData>): Promise<{ patch: Partial<CardData>; title?: string }> {
  const patch: Partial<CardData> = {};
  let title: string | undefined;
  if (body.title !== undefined) {
    title = String(body.title || '').trim().slice(0, 200);
    if (!title) throw new Error('A card needs a title.');
  }
  if (body.column !== undefined) {
    if (!b.data.columns.some((c) => c.id === body.column)) throw new Error('That column is not on this board.');
    patch.column = body.column;
  }
  if (body.description !== undefined) patch.description = String(body.description || '').slice(0, 5000);
  if (body.due_at !== undefined) {
    const d = String(body.due_at || '');
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Due date must be a date.');
    patch.due_at = d || null;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.has(body.priority)) throw new Error('Priority is low, normal or high.');
    patch.priority = body.priority;
  }
  if (body.labels !== undefined) {
    patch.labels = (Array.isArray(body.labels) ? body.labels : [])
      .map((l: any) => String(l || '').trim().slice(0, 24)).filter(Boolean).slice(0, 8);
  }
  if (body.checklist !== undefined) {
    patch.checklist = (Array.isArray(body.checklist) ? body.checklist : [])
      .map((i: any) => ({ text: String(i?.text || '').trim().slice(0, 200), done: !!i?.done })).filter((i: any) => i.text).slice(0, 50);
  }
  if (body.assignee_id !== undefined) {
    if (!body.assignee_id) { patch.assignee_id = null; patch.assignee_email = null; }
    else {
      const m = (await teamMembers(ctx.tenantId)).find((x) => x.id === body.assignee_id);
      if (!m) throw new Error('That person is not in this workspace.');
      patch.assignee_id = m.id; patch.assignee_email = m.email;
    }
  }
  if (body.quote_id !== undefined) {
    if (!body.quote_id) { patch.quote_id = null; patch.qn = null; }
    else {
      const { data: q } = await db.from('quotations').select('id, qn_number').eq('tenant_id', ctx.tenantId).eq('id', body.quote_id).maybeSingle();
      if (!q) throw new Error('No such quote in this workspace.');
      patch.quote_id = q.id; patch.qn = q.qn_number;
    }
  } else if (body.qn) {
    const { data: q } = await db.from('quotations').select('id, qn_number').eq('tenant_id', ctx.tenantId).ilike('qn_number', String(body.qn).trim()).maybeSingle();
    if (!q) throw new Error(`No quote ${body.qn} in this workspace.`);
    patch.quote_id = q.id; patch.qn = q.qn_number;
  }
  return { patch, title };
}

// awaited: on a serverless host, work left running after the response can be cut off
const tellAssignee = async (ctx: AgentCtx, card: { id: string; title: string; assignee_id?: string | null }, boardName: string) => {
  if (!card.assignee_id || card.assignee_id === ctx.userId) return;
  await notify(ctx.tenantId, [card.assignee_id], {
    title: `${ctx.profile?.full_name || ctx.email} gave you a card`,
    body: `${card.title} · ${boardName}`,
    link: { view: 'team', sub: `planning:${card.id}` },
    from_email: ctx.email,
  });
};

export async function createCard(ctx: AgentCtx, body: any) {
  const b = await board(ctx, String(body.board_id || ''));
  const { patch, title } = await cleanCardPatch(ctx, { ...body, column: body.column || b.data.columns[0].id }, b);
  if (!title) throw new Error('A card needs a title.');
  const inColumn = (await boardCards(ctx, b.id)).filter((c) => c.column === patch.column);
  const position = inColumn.length ? Math.max(...inColumn.map((c) => c.position ?? 0)) + 1 : 0;
  const rec = await createRec<CardData>(ctx.tenantId, 'card', title, {
    board_id: b.id, column: patch.column as string, position, priority: 'normal', labels: [], checklist: [],
    ...patch, created_by: ctx.email,
  });
  await tellAssignee(ctx, { id: rec.id, title, assignee_id: rec.data.assignee_id }, b.title);
  return { id: rec.id };
}

export async function updateCard(ctx: AgentCtx, id: string, body: any) {
  const cur = await getRec<CardData>(ctx.tenantId, 'card', id);
  if (!cur) throw new Error('No such card.');
  const b = await board(ctx, cur.data.board_id);
  const { patch, title } = await cleanCardPatch(ctx, body, b);
  await patchCard(ctx.tenantId, id, patch, title);
  if (patch.assignee_id && patch.assignee_id !== cur.data.assignee_id) await tellAssignee(ctx, { id, title: title || cur.title, assignee_id: patch.assignee_id }, b.title);
  return { ok: true };
}

/** Put a card at `index` in `column` (0 = top) and renumber that column. */
export async function moveCard(ctx: AgentCtx, id: string, body: { column?: string; index?: number }) {
  const cur = await getRec<CardData>(ctx.tenantId, 'card', id);
  if (!cur) throw new Error('No such card.');
  const b = await board(ctx, cur.data.board_id);
  const column = body.column || cur.data.column;
  if (!b.data.columns.some((c) => c.id === column)) throw new Error('That column is not on this board.');
  const rest = (await boardCards(ctx, b.id)).filter((c) => c.column === column && c.id !== id);
  const at = Math.max(0, Math.min(rest.length, Number.isFinite(Number(body.index)) ? Number(body.index) : rest.length));
  const order = [...rest.slice(0, at).map((c) => c.id), id, ...rest.slice(at).map((c) => c.id)];
  const positions = new Map(rest.map((c) => [c.id, c.position]));
  await Promise.all(order.map((cid, i) => {
    if (cid === id) return patchCard(ctx.tenantId, id, { column, position: i });
    return positions.get(cid) === i ? null : patchCard(ctx.tenantId, cid, { position: i });
  }));
  return { ok: true };
}

export async function deleteCard(ctx: AgentCtx, id: string) {
  const cur = await getRec<CardData>(ctx.tenantId, 'card', id);
  if (!cur) throw new Error('No such card.');
  const mine = cur.data.created_by === ctx.email || cur.data.assignee_id === ctx.userId;
  if (!mine && !ctx.isManager) throw new Error('Only the card’s creator, its assignee or a manager can delete it.');
  await deleteRec(ctx.tenantId, 'card', id);
  return { ok: true };
}

/** Which board a card is on (for links from the bell). */
export async function cardBoard(ctx: AgentCtx, id: string) {
  const c = await getRec<CardData>(ctx.tenantId, 'card', id);
  return c ? c.data.board_id : null;
}
