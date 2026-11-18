import { db, AgentCtx } from '@/lib/agent/core';

/**
 * The identity automation acts as. A workflow runs as the person who made it (so the audit trail
 * says who is responsible), falling back to the workspace's first admin. It always has manager
 * reach, because a workflow is a workspace-level rule, not one agent's view.
 */
export async function systemCtx(tenantId: string, actingEmail?: string | null): Promise<AgentCtx> {
  const { data: tenant } = await db.from('tenants').select('*').eq('id', tenantId).maybeSingle();
  if (!tenant) throw new Error('Workspace not found.');
  let profile: any = null;
  if (actingEmail) ({ data: profile } = await db.from('profiles').select('*').eq('tenant_id', tenantId).ilike('email', actingEmail).maybeSingle());
  if (!profile) {
    const { data: admins } = await db.from('profiles').select('*').eq('tenant_id', tenantId).in('role', ['admin', 'manager']).order('created_at', { ascending: true }).limit(1);
    profile = admins?.[0] || null;
  }
  return {
    userId: profile?.id || '00000000-0000-0000-0000-000000000000',
    email: profile?.email || 'automation@bloomgard.co',
    tenantId,
    role: 'manager',
    isManager: true,
    profile: profile || { full_name: 'Bloomgard automation' },
    tenant,
  };
}
