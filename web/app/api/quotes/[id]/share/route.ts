import { withCtx } from '@/lib/platform/route';
import { createShareLink } from '@/lib/platform/share';

/** Make (or replace) the client link for a quote. The token is shown once, inside the URL. */
export const POST = withCtx(async (ctx, req, _body, params) => {
  const { token } = await createShareLink(ctx, params.id);
  const origin = req.headers.get('origin') || new URL(req.url).origin;
  return { url: `${origin}/q/${token}` };
});
