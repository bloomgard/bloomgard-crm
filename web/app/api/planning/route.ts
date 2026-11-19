import { withCtx } from '@/lib/platform/route';
import { teamMembers } from '@/lib/platform/store';
import {
  listBoards, boardCards, createBoard, updateBoard, deleteBoard,
  createCard, updateCard, moveCard, deleteCard, cardBoard,
} from '@/lib/platform/planning';

/**
 * Team → Planning.
 * GET ?board=<id> (or ?card=<id> to find a card's board) — the boards, one board's cards, and the team.
 * POST { action, ... } — board.create | board.update | board.delete | card.create | card.update | card.move | card.delete
 */
export const GET = withCtx(async (ctx, req) => {
  const q = new URL(req.url).searchParams;
  const boards = await listBoards(ctx);
  let boardId = q.get('board') || '';
  if (q.get('card')) boardId = (await cardBoard(ctx, q.get('card') as string)) || boardId;
  const board = boards.find((b) => b.id === boardId) || boards[0];
  const [cards, members] = await Promise.all([boardCards(ctx, board.id), teamMembers(ctx.tenantId)]);
  return { boards, board, cards, members: members.map((m) => ({ id: m.id, email: m.email, full_name: m.full_name, role: m.role })), me: ctx.userId };
});

export const POST = withCtx(async (ctx, _req, body) => {
  const id = String(body.id || '');
  switch (body.action) {
    case 'board.create': return createBoard(ctx, body);
    case 'board.update': return updateBoard(ctx, id, body);
    case 'board.delete': return deleteBoard(ctx, id);
    case 'card.create': return createCard(ctx, body);
    case 'card.update': return updateCard(ctx, id, body.patch || {});
    case 'card.move': return moveCard(ctx, id, body);
    case 'card.delete': return deleteCard(ctx, id);
    default: throw new Error('Unknown action.');
  }
});
