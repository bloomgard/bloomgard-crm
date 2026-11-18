"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/platform/client";
import type { CommentData, Rec } from "@/lib/platform/types";
import s from "./QuoteNotes.module.css";

type Member = { id: string; email: string; full_name: string | null; role: string };
type Props = { quoteId: string; qn?: string };

const ago = (iso?: string | null) => {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/** Highlight @mentions of people in the workspace; everything else stays plain text. */
function Body({ text, members }: { text: string; members: Member[] }) {
  const names = members.flatMap((m) => [m.full_name, m.email].filter(Boolean) as string[])
    .sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!names.length) return <>{text}</>;
  const alt = names.join("|");
  const splitter = new RegExp(`(@(?:${alt}))`, "i");
  const whole = new RegExp(`^@(?:${alt})$`, "i");
  return <>{text.split(new RegExp(splitter.source, "gi")).map((p, i) => (whole.test(p) ? <span key={i} className={s.mention}>{p}</span> : p))}</>;
}

/** Internal notes on a quote, for the team only. Type @ to mention someone; they are notified. */
export default function QuoteNotes({ quoteId, qn }: Props) {
  const [notes, setNotes] = useState<Rec<CommentData>[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState<string | null>(null);   // text after "@" being typed
  const [active, setActive] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoaded(false); setNotes([]); setError("");
    api<{ notes: Rec<CommentData>[] }>(`/api/comments?quote_id=${encodeURIComponent(quoteId)}`)
      .then((r) => { if (alive) setNotes(r.notes); })
      .catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [quoteId]);
  useEffect(() => { api<{ members: Member[] }>("/api/team?members=1").then((r) => setMembers(r.members)).catch(() => {}); }, []);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [notes.length]);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return members.filter((m) => (m.full_name || "").toLowerCase().includes(q) || m.email.toLowerCase().includes(q)).slice(0, 8);
  }, [query, members]);

  // the word being typed right before the caret, if it starts with "@"
  const trackMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = before.match(/(?:^|\s)@([\w.\- ]{0,30})$/);
    if (m && !/\s{2}/.test(m[1])) { setQuery(m[1]); setActive(0); } else setQuery(null);
  };

  const insertMention = (m: Member) => {
    const el = box.current;
    const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w.\- ]{0,30})$/, "");
    const label = m.full_name || m.email;
    const next = `${before}@${label} ${text.slice(caret)}`;
    setText(next); setQuery(null);
    requestAnimationFrame(() => { if (el) { const pos = before.length + label.length + 2; el.focus(); el.setSelectionRange(pos, pos); } });
  };

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const r = await api<{ note: Rec<CommentData> }>("/api/comments", { json: { quote_id: quoteId, body: text } });
      setNotes((n) => [...n, r.note]); setText("");
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <section className={s.wrap} aria-label={`Team notes${qn ? ` on ${qn}` : ""}`} data-testid="quote-notes">
      <div className={s.head}><h4>Team notes</h4><span>Only your team sees these</span></div>
      <div className={s.list} ref={listRef}>
        {loaded && notes.length === 0 && !error && <p className={s.empty}>No notes yet. Leave one for whoever picks this up next, or @mention a teammate.</p>}
        {notes.map((n) => (
          <div key={n.id} className={s.note}>
            <div className={s.who}><b>{n.data.author_name || n.data.author_email}</b><time dateTime={n.created_at}>{ago(n.created_at)}</time></div>
            <p className={s.body}><Body text={n.data.body} members={members} /></p>
          </div>
        ))}
      </div>
      <div className={s.composer}>
        {query !== null && matches.length > 0 && (
          <div className={s.pick} role="listbox" aria-label="Mention someone">
            {matches.map((m, i) => (
              <div key={m.id} role="option" aria-selected={i === active} className={`${s.opt} ${i === active ? s.optOn : ""}`}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}>
                <span>{m.full_name || m.email}</span><em>{m.full_name ? m.email : m.role}</em>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={box}
          className={s.input}
          aria-label="Write a team note"
          placeholder="Write a note. Type @ to mention a teammate."
          value={text}
          onChange={(e) => { setText(e.target.value); trackMention(e.target.value, e.target.selectionStart); }}
          onKeyDown={(e) => {
            if (query !== null && matches.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, matches.length - 1)); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(matches[active]); return; }
            }
            if (e.key === "Escape") { e.stopPropagation(); if (query !== null) { e.preventDefault(); setQuery(null); } return; }
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
          }}
          onBlur={() => setTimeout(() => setQuery(null), 150)}
        />
        <div className={s.foot}>
          <span className={s.hint}>⌘ Enter to post</span>
          <button type="button" className={s.btn} disabled={busy || !text.trim()} onClick={send}>{busy ? "Posting…" : "Post note"}</button>
        </div>
        {error && <p className={s.error} role="alert">{error}</p>}
      </div>
    </section>
  );
}
