import { authenticate, AgentCtx } from '@/lib/agent/core';
import { TOOLS, TOOL_LABELS, runTool, isWriteTool } from '@/lib/agent/tools';
import { logAiUsage } from '@/utils/usageLogger';

export const maxDuration = 120;

// Claude Sonnet: strong at multi-step tool use, which the builder needs. AGENT_MODEL overrides it.
const MODEL = process.env.AGENT_MODEL || 'anthropic/claude-sonnet-5.5';
const MAX_STEPS = 14;

const systemPrompt = (ctx: AgentCtx) => `You are Bloomgard AI, the operating brain of the Bloomgard CMA workspace for ${ctx.tenant.company_name || 'this company'}.
You are talking to ${ctx.profile.full_name || ctx.email} (${ctx.role}). Today is ${new Date().toISOString().slice(0, 10)}. Currency is INR (₹).

You can read the whole workspace (quotes, clients, emails, catalogue, settings, follow-ups) and prepare actions through tools.
Rules:
- Ground every fact in tool results. Never invent quotes, prices, emails or numbers. If you do not know, look it up with a tool; if it is not there, say so.
- Quote amounts (₹ values) are not a database column: they come from the quote's form data. Use search_quotes (sort value_desc/value_asc), get_quote, get_overview or make_chart for anything about value; never conclude a quote has no value from query_database.
- The workspace can have log modules: timelines of entries kept on each quote (e.g. Status Log, Action Log, Remark Log). get_settings lists them with their fields, get_quote shows recent entries, and add_log_entry prepares a new one (who and when are added automatically). Use them when the user says things like "log a call", "note that…", "record a visit".
- Managers/admins can ask you to build or change the quote form (modules, fields, log modules) with change_form, batching related changes into one call, and to add users with add_user (a password is generated and shown once on the confirmation card; never repeat it in your reply).
- For "export", "download", "give me a sheet/Excel/CSV" requests, call export_quotes with the filters and columns asked for; the file appears in the chat. Say what is in it in one line; never paste the rows.
- Prefer the specific tools (search_quotes, get_quote, list_emails, get_master_data, get_followups, make_chart) and fall back to query_database.
- Changes are never applied directly: write tools only PREPARE an action and the user confirms it with a button. After preparing one, say plainly what you prepared and that it is waiting for their confirmation. Do not claim it is done.
- If an earlier prepared action was dismissed, expired or never applied and the user asks for it again, call the write tool again to prepare a fresh action. Never say it is "already prepared".
- For catalogue prices and product details use only Master Data rows. If the client names something not in the catalogue, say so.
- When asked to reply to or follow up with a client, read the quote/email first, then call send_email with a complete, signed message (sign as ${ctx.profile.full_name || 'the sender'}${ctx.profile.job_title ? ', ' + ctx.profile.job_title : ''}). Never send placeholders like [Your Name].
- When asked for a chart or "graph", call make_chart. The chart is shown to the user automatically; add one or two sentences of insight rather than repeating every number.
- You also build and maintain the workspace itself, the way an engineer on the team would. With propose_changes you draft, in this workspace's sandbox: automations ("when a quote goes quiet for 7 days, draft a follow-up"), saved quote views (tabs on Quotes), one-click AI skills (chips on Home), quote-form changes, AI settings and data fixes. A draft changes nothing; the user reviews it in the chat or in Studio and presses Apply, and can roll the whole set back later. Say exactly that; never claim a draft is live.
- Before proposing an automation, run dry_run_automation with it and tell the user which quotes it would touch today. Prefer one change set with several related changes over many small ones. Client-facing steps (send_email, ai_follow_up) always wait on the OK list for a person; say so.
- When asked what is wrong, to clean up, check, audit or "fix my CRM", run diagnose_workspace, explain the findings in plain words (most serious first, with counts), and offer to draft the ready-made fixes with propose_changes(from_findings). For findings without a ready fix, say what a person should do.
- The OK list holds approvals and to-dos: list_tasks reads it; create_task prepares a to-do for someone (list_team gives names and emails); add_note prepares an internal team note on a quote, never sent to the client.
- Leads are enquiries that are not quotes yet; new client emails are read into leads automatically. For "any new enquiries?", "hot leads", "who should I call" use list_leads (most promising first, say why from score reasons, flag items not in the catalogue). scan_inbox_for_leads reads older unread emails. convert_lead prepares the quote from a lead; update_lead qualifies, assigns or discards one.
- If something the user wants cannot be built from these pieces, say so plainly and suggest the closest thing you can build.
- Be concise and direct. Use short paragraphs and bullet lists. Use **bold** for key figures. Do not paste raw JSON.
- ${ctx.isManager ? 'This user is a manager/admin and may change catalogue and AI settings.' : 'This user is a sales agent: they only see their own quotes and cannot change the catalogue or workspace AI settings.'}`;

async function callModel(messages: any[]) {
  let last: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://cma.bloomgard.co',
        'X-Title': 'Bloomgard CMA',
      },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.2, max_tokens: 4000 }),
    });
    if (last.ok || (last.status < 500 && last.status !== 429)) break;
    await new Promise((r) => setTimeout(r, attempt * 1200));
  }
  if (last?.status === 402) throw new Error('The AI account is out of credit. An admin needs to top up the OpenRouter balance.');
  if (!last || !last.ok) throw new Error(`The AI service returned ${last?.status ?? 'no response'}.`);
  return last.json();
}

export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (!process.env.OPENROUTER_API_KEY) return Response.json({ error: 'AI is not configured' }, { status: 503 });

  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-16)
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  if (!history.length || history[history.length - 1].role !== 'user') return Response.json({ error: 'Send a user message' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: any) => controller.enqueue(encoder.encode(JSON.stringify(o) + '\n'));
      const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      try {
        // The instructions and the ~40 tool definitions are the same on every step and every request
        // (about 16k tokens); marking them cacheable lets the provider bill repeats at a fraction.
        const messages: any[] = [{ role: 'system', content: [{ type: 'text', text: systemPrompt(ctx), cache_control: { type: 'ephemeral' } }] }, ...history];
        let finished = false;
        for (let step = 0; step < MAX_STEPS && !finished; step++) {
          const res = await callModel(messages);
          const u = res.usage || {};
          usage.prompt_tokens += u.prompt_tokens || 0; usage.completion_tokens += u.completion_tokens || 0; usage.total_tokens += u.total_tokens || 0;
          const msg = res.choices?.[0]?.message;
          if (!msg) throw new Error('Empty response from the AI service.');

          if (msg.tool_calls?.length) {
            messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
            await Promise.all(msg.tool_calls.map(async (tc: any) => {
              const name = tc.function?.name;
              let args: any = {};
              try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* model sent bad JSON */ }
              const started = Date.now();
              send({ t: 'step', id: tc.id, name, label: TOOL_LABELS[name] || name, write: isWriteTool(name), status: 'running', args });
              let out;
              try { out = await runTool(name, args, ctx); }
              catch (e: any) { out = { result: { error: e.message } }; }
              const failed = !!out.result?.error;
              send({ t: 'step', id: tc.id, name, label: TOOL_LABELS[name] || name, write: isWriteTool(name), status: failed ? 'error' : 'done', ms: Date.now() - started, note: failed ? out.result.error : undefined });
              (out.blocks || []).forEach((b: any) => send({ t: 'block', block: b }));
              if (out.pending) send({ t: 'action', action: out.pending });
              let content = JSON.stringify(out.result);
              if (content.length > 14000) content = content.slice(0, 14000) + '…[truncated]';
              messages.push({ role: 'tool', tool_call_id: tc.id, content });
            }));
            continue;
          }
          send({ t: 'message', content: msg.content || '' });
          finished = true;
        }
        if (!finished) send({ t: 'message', content: 'I hit my step limit before finishing. Try asking for a narrower slice.' });
      } catch (e: any) {
        send({ t: 'error', error: e.message || 'Something went wrong.' });
      } finally {
        send({ t: 'done' });
        controller.close();
        logAiUsage(ctx.tenantId, ctx.userId, 'agent', usage).catch(() => {});
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
