"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const panel = useRef<HTMLDivElement>(null);
  // The panel is portalled to <body> and placed from the bell's position: inside the sidebar it was
  // clipped by the sidebar's edge and painted under the page next to it.
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const place = useCallback(() => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    const w = Math.min(360, window.innerWidth - 24);
    setPos({ left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)), bottom: Math.max(12, window.innerHeight - r.top + 8) });
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, place]);

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
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!wrap.current?.contains(t) && !panel.current?.contains(t)) setOpen(false); };
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
      {open && pos && createPortal(
        <div ref={panel} className={s.panel} style={{ left: pos.left, bottom: pos.bottom }} role="dialog" aria-label="Notifications">
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
        </div>,
        // inside the themed root, so the dark theme's colours still apply
        (wrap.current?.closest(".jaali") as HTMLElement) || document.body,
      )}
    </div>
  );
}
