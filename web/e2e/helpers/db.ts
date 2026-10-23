import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ENV } from './env';

let _admin: SupabaseClient | null = null;
/** Service-role client: used only to set up fixtures, assert side effects and clean up. */
export function admin(): SupabaseClient {
  if (!_admin) _admin = createClient(ENV.supabaseUrl, ENV.serviceKey, { auth: { persistSession: false } });
  return _admin;
}

export type Actor = {
  userId: string;
  email: string;
  tenantId: string;
  role: string;
  fullName: string | null;
  inboundEmail: string | null;
  tenant: { company_name: string; inbound_routing_id: string; custom_email_sender: string | null; ai_enabled: boolean };
};

/** Resolve the workspace under test from the E2E account, so no ids live in code. */
export async function resolveActor(): Promise<Actor> {
  const db = admin();
  const { data: p, error } = await db.from('profiles')
    .select('id, email, tenant_id, role, full_name, inbound_email').ilike('email', ENV.email).single();
  if (error || !p?.tenant_id) throw new Error(`E2E account ${ENV.email} has no workspace: ${error?.message || 'no tenant'}`);
  const { data: t } = await db.from('tenants')
    .select('company_name, inbound_routing_id, custom_email_sender, ai_enabled').eq('id', p.tenant_id).single();
  return {
    userId: p.id, email: p.email, tenantId: p.tenant_id, role: p.role,
    fullName: p.full_name, inboundEmail: p.inbound_email, tenant: t as Actor['tenant'],
  };
}

type Undo = () => Promise<unknown>;

/** Collects undo steps during a spec and runs them newest-first in afterAll. */
export class Cleanup {
  private steps: Undo[] = [];
  add(undo: Undo) { this.steps.push(undo); }
  delete(table: string, column: string, value: string | string[]) {
    this.steps.push(async () => {
      const q = admin().from(table).delete();
      return Array.isArray(value) ? q.in(column, value) : q.eq(column, value);
    });
  }
  async run() {
    for (const undo of this.steps.reverse()) {
      try { await undo(); } catch (e) { console.warn('cleanup step failed:', (e as Error).message); }
    }
    this.steps = [];
  }
}

/** Poll until `fn` returns a truthy value or the timeout passes. */
export async function waitFor<T>(
  fn: () => Promise<T | null | undefined | false>, timeoutMs = 30_000, intervalMs = 1_000, what = 'condition'
): Promise<T> {
  const end = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < end) {
    try { const v = await fn(); if (v) return v as T; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}${last ? ` (${(last as Error).message})` : ''}`);
}

export async function aiSettingsBackup(tenantId: string) {
  const { data } = await admin().from('tenant_schemas').select('id, schema_config').eq('tenant_id', tenantId).single();
  return data as { id: string; schema_config: any[] };
}
