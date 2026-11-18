import { findShare, publicQuote, recordView, respond } from '@/lib/platform/share';

/**
 * The client's side of a quote link: no login, the token is the key. GET shows the quote (and
 * counts the opening); POST { action: 'accept' | 'changes', name, note? } records their answer.
 */
type Ctx = { params: Promise<{ token: string }> };

const hits = new Map<string, number[]>();
function limited(key: string, perMinute = 20) {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < 60_000);
  recent.push(now); hits.set(key, recent);
  return recent.length > perMinute;
}

export async function GET(request: Request, { params }: Ctx) {
  const { token } = await params;
  if (limited(`g:${token}`, 60)) return Response.json({ error: 'Too many requests.' }, { status: 429 });
  const share = await findShare(token);
  if (!share) return Response.json({ error: 'This link is not valid any more. Ask your contact for a new one.' }, { status: 404 });
  const quote = await publicQuote(share);
  if (!quote) return Response.json({ error: 'This quote is no longer available.' }, { status: 404 });
  // a preview from inside the app does not count as the client opening it
  if (!new URL(request.url).searchParams.has('preview')) await recordView(share).catch(() => {});
  return Response.json(quote, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, { params }: Ctx) {
  const { token } = await params;
  if (limited(`p:${token}`, 5)) return Response.json({ error: 'Too many requests.' }, { status: 429 });
  const share = await findShare(token);
  if (!share) return Response.json({ error: 'This link is not valid any more.' }, { status: 404 });
  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (!['accept', 'changes'].includes(body.action)) return Response.json({ error: 'Choose accept or changes.' }, { status: 400 });
  try {
    return Response.json(await respond(share, body.action, body.name, body.note));
  } catch (e: any) {
    return Response.json({ error: e.message || 'Could not record your answer.' }, { status: 400 });
  }
}
