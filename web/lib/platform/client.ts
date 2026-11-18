"use client";
import { supabase } from "@/utils/supabaseClient";

async function authHeaders(fresh = false) {
  const { data } = fresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token || ""}`, "Content-Type": "application/json" };
}

/**
 * Call a platform API route as the signed-in user and return its JSON. A stale token is refreshed
 * once; an error response throws with the server's message, so callers can show it as is.
 */
export async function api<T = any>(url: string, init: RequestInit & { json?: any } = {}): Promise<T> {
  const { json, ...rest } = init;
  const body = json !== undefined ? JSON.stringify(json) : rest.body;
  const method = rest.method || (json !== undefined ? "POST" : "GET");
  let res = await fetch(url, { ...rest, method, body, headers: { ...(await authHeaders()), ...(rest.headers || {}) } });
  if (res.status === 401) res = await fetch(url, { ...rest, method, body, headers: { ...(await authHeaders(true)), ...(rest.headers || {}) } });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out?.error) throw new Error(out?.error || `Request failed (${res.status})`);
  return out as T;
}

/**
 * Tell the server something changed that the browser did itself (a status button, a saved form, a
 * log entry), so workflows and plugins hear about it. Fire and forget: never blocks or fails the UI.
 */
export function emitClientEvent(type: string, quoteId?: string | null, data?: Record<string, any>) {
  api("/api/events", { json: { type, quote_id: quoteId || null, data: data || {} } }).catch(() => {});
}
