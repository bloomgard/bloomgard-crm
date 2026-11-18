"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/platform/client";
import type { NotificationData, Rec } from "@/lib/platform/types";
import s from "./NotificationBell.module.css";

type Link = { view: string; quote_id?: string; task_id?: string; sub?: string };
type Props = { onNavigate: (link: Link) => void };

const ago = (iso?: string | null) => {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
};

/** The bell: mentions, assignments and things waiting for an OK. Polls every minute and on focus. */
export default function NotificationBell({ onNavigate }: Props) {
  const [items, setItems] = useState<Rec<NotificationData>[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ notifications: Rec<NotificationData>[]; unread: number }>("/api/notifications");
      setItems(r.notifications); setUnread(r.unread);
    } catch { /* offline or signed out: the bell just stays as it was */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);

  // close on outside click or Escape (and keep Escape from also closing a panel underneath)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey, true); };
  }, [open]);

  const markRead = async (ids: string[] | "all") => {
    const now = new Date().toISOString();
    setItems((xs) => xs.map((x) => (ids === "all" || ids.includes(x.id) ? { ...x, data: { ...x.data, read_at: x.data.read_at || now } } : x)));
    setUnread((u) => (ids === "all" ? 0 : Math.max(0, u - items.filter((x) => ids.includes(x.id) && !x.data.read_at).length)));
    try { await api("/api/notifications", { json: { read: ids } }); } catch { load(); }
  };

  const go = (n: Rec<NotificationData>) => {
    setOpen(false);
    if (!n.data.read_at) markRead([n.id]);
    if (n.data.link) onNavigate(n.data.link);
  };

  return (
    <div className={s.wrap} ref={wrap}>
      <button
        type="button"
        className={`${s.bell} ${open ? s.bellOn : ""}`}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => { setOpen((v) => !v); if (!open) load(); }}
      >
        <Bell aria-hidden />
        {unread > 0 && <span className={s.badge} aria-hidden>{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className={s.panel} role="dialog" aria-label="Notifications">
          <div className={s.panelHead}>
            <h3>Notifications</h3>
            <button type="button" className={s.markAll} disabled={!unread} onClick={() => markRead("all")}>Mark all read</button>
          </div>
          <div className={s.list}>
            {items.length === 0 ? (
              <p className={s.empty}>Nothing yet. Mentions, assignments and anything waiting for your OK show up here.</p>
            ) : items.map((n) => (
              <button key={n.id} type="button" className={`${s.item} ${n.data.read_at ? "" : s.unread}`} onClick={() => go(n)}>
                <div className={s.itemTitle}>{n.title}</div>
                {n.data.body && <div className={s.itemBody}>{n.data.body}</div>}
                <div className={s.itemMeta}>{n.data.from_email ? `${n.data.from_email} · ` : ""}{ago(n.created_at)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
