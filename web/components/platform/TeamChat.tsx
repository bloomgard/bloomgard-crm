"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hash, Plus, Send, Pencil, Trash2, X } from "lucide-react";
import { api } from "@/lib/platform/client";
import s from "./TeamChat.module.css";

type Member = { id: string; email: string; full_name: string | null; role: string };
type Channel = { id: string; name: string; type: "channel" | "dm"; description: string; members: string[]; last_message_at: string | null; unread: number; can_delete?: boolean };
type Message = { id: string; created_at: string; channel_id: string; body: string; author_id: string; author_email: string; author_name?: string | null; mentions?: string[]; edited_at?: string | null };
type Props = { isManager: boolean; focusChannelId?: string; onFocusUsed?: () => void; onOpenQuoteByQn?: (qn: string) => void };

const POLL_MS = 4000;
const LIST_MS = 20000;
const nameOf = (m?: Member | null) => m?.full_name || (m?.email || "Someone").split("@")[0];
const initials = (n: string) => n.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "?";
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const day = (iso: string) => {
  const d = new Date(iso); const t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
};

/**
 * Team → Chat: #channels for the whole workspace and direct messages. New messages arrive by
 * polling while Chat is open. @name rings that person's bell; a quote number becomes a link.
 */
export default function TeamChat({ isManager, focusChannelId, onFocusUsed, onOpenQuoteByQn }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState("");
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [mention, setMention] = useState<{ q: string; at: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);   // follow new messages unless the reader scrolled up

  const loadChannels = useCallback(async () => {
    try {
      const r = await api<{ channels: Channel[]; members: Member[]; me: string }>("/api/chat");
      setChannels(r.channels); setMembers(r.members); setMe(r.me);
      return r.channels;
    } catch (e: any) { setError(e.message); return []; }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    loadChannels().then((cs) => {
      const want = focusChannelId && cs.find((c) => c.id === focusChannelId);
      setActiveId((cur) => (want ? want.id : cur || cs[0]?.id || ""));
      if (focusChannelId) onFocusUsed?.();
    });
    const t = setInterval(loadChannels, LIST_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusChannelId]);

  // the open conversation: load it, then poll for anything newer
  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    let last = "";
    stick.current = true;
    setMessages([]); setEditing(null);
    const pull = async (first: boolean) => {
      try {
        const r = await api<{ messages: Message[] }>(`/api/chat?channel=${activeId}${last ? `&after=${encodeURIComponent(last)}` : ""}`);
        if (!alive) return;
        if (r.messages.length) {
          last = r.messages[r.messages.length - 1].created_at;
          setMessages((xs) => {
            const seen = new Set(xs.map((x) => x.id));
            return first ? r.messages : [...xs, ...r.messages.filter((m) => !seen.has(m.id))];
          });
          setChannels((cs) => cs.map((c) => (c.id === activeId ? { ...c, unread: 0 } : c)));
        }
      } catch { /* a missed poll is retried on the next tick */ }
    };
    pull(true);
    const t = setInterval(() => pull(false), POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, [activeId]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const active = channels.find((c) => c.id === activeId) || null;
  const dmWith = (c: Channel) => memberById.get(c.members.find((id) => id !== me) || "") || null;
  const titleOf = (c: Channel) => (c.type === "dm" ? nameOf(dmWith(c)) : `#${c.name}`);
  const dmByMember = new Map(channels.filter((c) => c.type === "dm").map((c) => [c.members.find((id) => id !== me) || "", c]));
  const others = members.filter((m) => m.id !== me);

  const openDm = async (memberId: string) => {
    const existing = dmByMember.get(memberId);
    if (existing) { setActiveId(existing.id); return; }
    try { const r = await api<{ id: string }>("/api/chat", { json: { action: "dm", member_id: memberId } }); await loadChannels(); setActiveId(r.id); }
    catch (e: any) { setError(e.message); }
  };

  const newChannel = async () => {
    const name = prompt("Name the channel (for example sales, exports or trade-fair):");
    if (!name?.trim()) return;
    try { const r = await api<{ id: string }>("/api/chat", { json: { action: "channel.create", name } }); await loadChannels(); setActiveId(r.id); }
    catch (e: any) { setError(e.message); }
  };

  const removeChannel = async () => {
    if (!active || !confirm(`Delete #${active.name} and all its messages? This cannot be undone.`)) return;
    try { await api("/api/chat", { json: { action: "channel.delete", id: active.id } }); const cs = await loadChannels(); setActiveId(cs[0]?.id || ""); }
    catch (e: any) { setError(e.message); }
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !activeId || sending) return;
    setSending(true); setError("");
    try {
      const r = await api<{ message: Message }>("/api/chat", { json: { action: "send", channel_id: activeId, body } });
      stick.current = true;
      setMessages((xs) => (xs.some((x) => x.id === r.message.id) ? xs : [...xs, r.message]));
      setText(""); setMention(null);
    } catch (e: any) { setError(e.message); }
    finally { setSending(false); input.current?.focus(); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api("/api/chat", { json: { action: "edit", id: editing.id, body: editing.body } });
      setMessages((xs) => xs.map((x) => (x.id === editing.id ? { ...x, body: editing.body.trim(), edited_at: new Date().toISOString() } : x)));
      setEditing(null);
    } catch (e: any) { setError(e.message); }
  };

  const remove = async (m: Message) => {
    if (!confirm("Delete this message?")) return;
    try { await api("/api/chat", { json: { action: "delete", id: m.id } }); setMessages((xs) => xs.filter((x) => x.id !== m.id)); }
    catch (e: any) { setError(e.message); }
  };

  /* @mention picker: shows while the word before the caret starts with @ */
  const onType = (v: string, caret: number) => {
    setText(v);
    const m = /(^|\s)@([\p{L}\p{N}._-]*)$/u.exec(v.slice(0, caret));
    setMention(m ? { q: m[2].toLowerCase(), at: caret - m[2].length - 1 } : null);
  };
  const mentionOptions = mention ? others.filter((m) => `${m.full_name || ""} ${m.email}`.toLowerCase().includes(mention.q)).slice(0, 6) : [];
  const pickMention = (m: Member) => {
    if (!mention) return;
    const handle = (m.full_name || "").split(/\s+/)[0] || m.email.split("@")[0];
    const caret = input.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, mention.at)}@${handle} ${text.slice(caret)}`;
    setText(next); setMention(null);
    requestAnimationFrame(() => { const p = mention.at + handle.length + 2; input.current?.focus(); input.current?.setSelectionRange(p, p); });
  };

  /** Bold @mentions of known people and turn quote numbers into links. */
  const render = (body: string) => body.split(/(@[\p{L}\p{N}._-]+|\bQN-[A-Za-z0-9-]+)/u).map((part, i) => {
    if (/^QN-/i.test(part)) return <button key={i} type="button" className={s.qn} onClick={() => onOpenQuoteByQn?.(part)}>{part}</button>;
    if (part.startsWith("@")) return <b key={i} className={s.mention}>{part}</b>;
    return <Fragment key={i}>{part}</Fragment>;
  });

  if (!loaded) return <p className={s.muted}>Loading chat…</p>;

  return (
    <div className={s.wrap}>
      <aside className={s.side} aria-label="Conversations">
        <div className={s.sideHead}><span>Channels</span><button type="button" className={s.iconBtn} onClick={newChannel} aria-label="New channel" title="New channel"><Plus /></button></div>
        {channels.filter((c) => c.type === "channel").map((c) => (
          <button key={c.id} type="button" className={`${s.conv} ${c.id === activeId ? s.convOn : ""} ${c.unread ? s.convUnread : ""}`} onClick={() => setActiveId(c.id)} aria-current={c.id === activeId}>
            <Hash aria-hidden /><span className={s.convName}>{c.name}</span>{c.unread > 0 && <b className={s.badge}>{c.unread}</b>}
          </button>
        ))}
        <div className={s.sideHead}><span>Direct messages</span></div>
        {others.map((m) => {
          const c = dmByMember.get(m.id);
          return (
            <button key={m.id} type="button" className={`${s.conv} ${c && c.id === activeId ? s.convOn : ""} ${c?.unread ? s.convUnread : ""}`} onClick={() => openDm(m.id)} aria-current={!!c && c.id === activeId}>
              <span className={s.dot} aria-hidden>{initials(nameOf(m))}</span><span className={s.convName}>{nameOf(m)}</span>{!!c?.unread && <b className={s.badge}>{c.unread}</b>}
            </button>
          );
        })}
        {!others.length && <p className={s.muted}>Add teammates under Settings → User Access to message them.</p>}
      </aside>

      <section className={s.main} aria-label={active ? titleOf(active) : "Conversation"}>
        {active ? (
          <>
            <header className={s.head}>
              <div>
                <h3>{titleOf(active)}</h3>
                <p>{active.type === "dm" ? dmWith(active)?.email : active.description || "Anyone in the workspace can read and post here."}</p>
              </div>
              {active.can_delete && (
                <button type="button" className={s.iconBtn} onClick={removeChannel} aria-label={`Delete #${active.name}`} title="Delete channel"><Trash2 /></button>
              )}
            </header>
            <div ref={scroller} className={s.log} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
              {!messages.length && <p className={s.empty}>{active.type === "dm" ? `This is the start of your conversation with ${titleOf(active)}.` : `No messages in ${titleOf(active)} yet. Say hello.`}</p>}
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const newDay = !prev || day(prev.created_at) !== day(m.created_at);
                const grouped = !newDay && prev && prev.author_id === m.author_id && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60000;
                const author = memberById.get(m.author_id);
                const name = m.author_name || nameOf(author) || m.author_email;
                const mine = m.author_id === me;
                return (
                  <Fragment key={m.id}>
                    {newDay && <div className={s.day}><span>{day(m.created_at)}</span></div>}
                    <div className={`${s.msg} ${grouped ? s.msgGrouped : ""} ${m.mentions?.includes(me) ? s.msgMentioned : ""}`}>
                      {grouped ? <span className={s.gutterTime}>{time(m.created_at)}</span> : <span className={s.avatar} aria-hidden>{initials(name)}</span>}
                      <div className={s.msgBody}>
                        {!grouped && <p className={s.msgHead}><b>{name}</b><time dateTime={m.created_at}>{time(m.created_at)}</time></p>}
                        {editing?.id === m.id ? (
                          <div className={s.editBox}>
                            <textarea value={editing.body} autoFocus onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === "Escape") setEditing(null); }} aria-label="Edit message" />
                            <div><button type="button" className={s.link} onClick={saveEdit}>Save</button><button type="button" className={s.linkMuted} onClick={() => setEditing(null)}>Cancel</button></div>
                          </div>
                        ) : (
                          <p className={s.text}>{render(m.body)}{m.edited_at && <span className={s.edited}> (edited)</span>}</p>
                        )}
                      </div>
                      {editing?.id !== m.id && (mine || isManager) && (
                        <span className={s.tools}>
                          {mine && <button type="button" className={s.iconBtn} onClick={() => setEditing({ id: m.id, body: m.body })} aria-label="Edit message"><Pencil /></button>}
                          <button type="button" className={s.iconBtn} onClick={() => remove(m)} aria-label="Delete message"><Trash2 /></button>
                        </span>
                      )}
                    </div>
                  </Fragment>
                );
              })}
            </div>
            {error && <p className={s.error} role="alert">{error}<button type="button" className={s.iconBtn} onClick={() => setError("")} aria-label="Dismiss"><X /></button></p>}
            <div className={s.composer}>
              {mentionOptions.length > 0 && (
                <ul className={s.mentions} role="listbox" aria-label="Mention someone">
                  {mentionOptions.map((m) => (
                    <li key={m.id}><button type="button" onMouseDown={(e) => { e.preventDefault(); pickMention(m); }}><span className={s.dot}>{initials(nameOf(m))}</span>{nameOf(m)}<i>{m.email}</i></button></li>
                  ))}
                </ul>
              )}
              <textarea ref={input} value={text} rows={1} placeholder={`Message ${titleOf(active)}`} aria-label={`Message ${titleOf(active)}`}
                onChange={(e) => onType(e.target.value, e.target.selectionStart ?? e.target.value.length)}
                onKeyDown={(e) => {
                  if (mentionOptions.length && (e.key === "Tab" || e.key === "Enter")) { e.preventDefault(); pickMention(mentionOptions[0]); return; }
                  if (e.key === "Escape") setMention(null);
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }} />
              <button type="button" className={s.send} onClick={send} disabled={!text.trim() || sending} aria-label="Send"><Send /></button>
            </div>
            <p className={s.hint}>Enter sends, Shift+Enter adds a line. @name tells someone; a quote number like QN-2026-012 becomes a link.</p>
          </>
        ) : <p className={s.empty}>Pick a conversation.</p>}
      </section>
    </div>
  );
}
