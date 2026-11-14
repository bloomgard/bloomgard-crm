import { createClient } from '@supabase/supabase-js';
import type { APIRequestContext } from '@playwright/test';
import { ENV, need, protectionHeaders } from './env';

/** A real access token for the E2E user, the same one the browser would send. */
export async function userToken(): Promise<string> {
  const sb = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  const { data, error } = await sb.auth.signInWithPassword({ email: ENV.email, password: ENV.password });
  if (error || !data.session) throw new Error(`E2E sign-in failed: ${error?.message}`);
  return data.session.access_token;
}

export const authed = (token: string) => ({ ...protectionHeaders(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

export type AgentEvent = { t: string; [k: string]: any };

/** Talk to the agent and collect its NDJSON event stream. */
export async function ask(request: APIRequestContext, token: string, content: string, history: any[] = []) {
  const res = await request.post(`${ENV.baseUrl}/api/agent/chat`, {
    headers: authed(token), data: { messages: [...history, { role: 'user', content }] }, timeout: 120_000,
  });
  const events: AgentEvent[] = (await res.text()).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return {
    status: res.status(), events,
    message: events.find((e) => e.t === 'message')?.content as string | undefined,
    steps: events.filter((e) => e.t === 'step' && e.status !== 'running'),
    blocks: events.filter((e) => e.t === 'block').map((e) => e.block),
    actions: events.filter((e) => e.t === 'action').map((e) => e.action),
    error: events.find((e) => e.t === 'error')?.error as string | undefined,
  };
}
