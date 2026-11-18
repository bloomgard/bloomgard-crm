import { createRec, teamMembers } from './store';
import type { NotificationData } from './types';

/**
 * Tell people something in the app (the bell in the sidebar). `to` takes profile ids, emails, or
 * "managers" for every manager and admin. Never throws: a failed notification must not fail the
 * thing that caused it.
 */
export async function notify(
  tenantId: string,
  to: Array<string> | 'managers',
  n: Omit<NotificationData, 'user_id' | 'read_at'>,
) {
  try {
    const members = await teamMembers(tenantId);
    const ids = new Set<string>();
    if (to === 'managers') members.filter((m) => ['manager', 'admin'].includes(String(m.role).toLowerCase())).forEach((m) => ids.add(m.id));
    else for (const t of to) {
      const m = members.find((x) => x.id === t || String(x.email).toLowerCase() === String(t).toLowerCase());
      if (m) ids.add(m.id);
    }
    await Promise.all([...ids].map((user_id) =>
      createRec<NotificationData>(tenantId, 'notification', n.title, { ...n, user_id, read_at: null })));
    return ids.size;
  } catch {
    return 0;
  }
}
