"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/platform/client";
import type { Rec, TaskData } from "@/lib/platform/types";
import s from "./TasksView.module.css";

type Member = { id: string; email: string; full_name: string | null; role: string };
type Counts = { approvals: number; todos: number; mine: number };
type Props = {
  isManager: boolean;
  userId: string;
  userEmail: string;
  onOpenQuote?: (quoteId: string) => void;
  onCountsChange?: (c: { approvals: number; todos: number }) => void;
};

const when = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};
const ago = (iso?: string | null) => {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};
const isOverdue = (iso?: string | null) => !!iso && new Date(iso).getTime() < new Date().setHours(0, 0, 0, 0);
const sourceLabel = (t: TaskData) => t.source_label || (t.source === "ai" ? "Bloomgard AI" : t.source === "workflow" ? "Workflow" : t.created_by || "Team");

/**
 * The OK list: everything waiting on a person. Approvals are actions the AI or a workflow has
 * prepared, which happen only when someone presses Approve; to-dos are plain tasks for the team.
 */
export default function TasksView({ isManager, userId, userEmail, onOpenQuote, onCountsChange }: Props) {
  const [tab, setTab] = useState<"approvals" | "todos" | "done">("approvals");
  const [open, setOpen] = useState<Rec<TaskData>[]>([]);
  const [closed, setClosed] = useState<Rec<TaskData>[]>([]);
  const [counts, setCounts] = useState<Counts>({ approvals: 0, todos: 0, mine: 0 });
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { subject?: string; body?: string }>>({});
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", assigned_to: "", due_at: "", note: "" });

  // the parent may pass a new function each render; keep the latest without re-running the load
  const countsCb = useRef(onCountsChange);
  countsCb.current = onCountsChange;

  const load = useCallback(async () => {
    try {
      const [o, c] = await Promise.all([
        api<{ tasks: Rec<TaskData>[]; counts: Counts }>("/api/tasks?status=open"),
        api<{ tasks: Rec<TaskData>[] }>("/api/tasks?status=closed"),
      ]);
      setOpen(o.tasks); setClosed(c.tasks); setCounts(o.counts); setError("");
      countsCb.current?.({ approvals: o.counts.approvals, todos: o.counts.todos });
    } catch (e: any) { setError(e.message); }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api<{ members: Member[] }>("/api/team?members=1").then((r) => setMembers(r.members)).catch(() => {}); }, []);

  const approvals = useMemo(() => open.filter((t) => t.data.type === "approval"), [open]);
  const todos = useMemo(() => open.filter((t) => t.data.type === "todo"), [open]);
  const nameOf = (id?: string | null, email?: string | null) => {
    const m = members.find((x) => x.id === id) || members.find((x) => email && x.email === email);
    return m ? (m.id === userId ? "you" : m.full_name || m.email) : email || "";
  };

  const decide = async (t: Rec<TaskData>, decision: "approve" | "dismiss" | "done" | "reopen") => {
    setBusy(t.id); setError("");
    try {
      const d = drafts[t.id];
      const payload = decision === "approve" && d ? { ...(d.subject !== undefined ? { subject: d.subject } : {}), ...(d.body !== undefined ? { body: d.body } : {}) } : undefined;
      await api(`/api/tasks/${t.id}`, { json: { decision, payload } });
      await load();
    } catch (e: any) { setError(e.message); await load(); }
    finally { setBusy(null); }
  };

  const patch = async (t: Rec<TaskData>, body: Record<string, any>) => {
    setBusy(t.id); setError("");
    try { await api(`/api/tasks/${t.id}`, { method: "PATCH", json: body }); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const create = async () => {
    if (!form.title.trim()) return;
    setBusy("new"); setError("");
    try {
      await api("/api/tasks", { json: { title: form.title, note: form.note || undefined, assigned_to: form.assigned_to || undefined, due_at: form.due_at || undefined } });
      setForm({ title: "", assigned_to: "", due_at: "", note: "" }); setAdding(false); setTab("todos");
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(null); }
  };

  const canDecide = (t: TaskData) => isManager || t.assigned_to === userId || t.created_by === userEmail || (!t.assigned_to && t.type === "todo");
  const quoteLink = (t: TaskData) => t.quote_id && (
    <button type="button" className={s.link} onClick={() => onOpenQuote?.(t.quote_id as string)}>{t.qn || "Open quote"}</button>
  );

  const renderApproval = (t: Rec<TaskData>) => {
    const d = t.data, a = d.action;
    const email = a?.kind === "send_email";
    const draft = drafts[t.id] || {};
    return (
      <div key={t.id} className={s.item} data-task-id={t.id}>
        <div className={s.row}>
          <div className={s.main}>
            <span className={s.src}>{sourceLabel(d)}</span>
            <div className={s.itemTitle}>{t.title}</div>
            <div className={s.meta}>
              {quoteLink(d)}
              {d.assigned_to && <span>For {nameOf(d.assigned_to, d.assigned_email)}</span>}
              <span>{ago(t.created_at)}</span>
            </div>
            {a?.summary && <p className={s.summary}>{a.summary}</p>}
            {a?.details?.length ? (
              <dl className={s.details}>
                {a.details.filter(([k]) => !(email && /^subject$/i.test(k))).map(([k, v], i) => <Fragment key={i}><dt>{k}</dt><dd>{v}</dd></Fragment>)}
              </dl>
            ) : null}
            {email && (
              <div className={s.draft}>
                <label className={s.src} htmlFor={`subj-${t.id}`}>Subject</label>
                <input id={`subj-${t.id}`} className={s.input} value={draft.subject ?? a?.payload?.subject ?? ""}
                  onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...draft, subject: e.target.value } })} />
                <label className={s.src} htmlFor={`body-${t.id}`}>Message — edit it before you approve</label>
                <textarea id={`body-${t.id}`} className={s.input} value={draft.body ?? a?.payload?.body ?? ""}
                  onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...draft, body: e.target.value } })} />
              </div>
            )}
            {!email && d.note && <p className={s.result}>{d.note}</p>}
          </div>
          <div className={s.side}>
            {canDecide(d) ? (
              <>
                <button type="button" className={s.ghost} disabled={busy === t.id} onClick={() => decide(t, "dismiss")} aria-label={`Dismiss ${t.title}`}>Dismiss</button>
                <button type="button" className={s.btn} disabled={busy === t.id} onClick={() => decide(t, "approve")} aria-label={`Approve ${t.title}`}>{busy === t.id ? "Working…" : email ? "Approve and send" : "Approve"}</button>
              </>
            ) : <span className={s.result}>Waiting on {d.assigned_to ? nameOf(d.assigned_to, d.assigned_email) : "a manager"}</span>}
          </div>
        </div>
      </div>
    );
  };

  const renderTodo = (t: Rec<TaskData>) => {
    const d = t.data;
    const doneNow = d.status !== "open";
    return (
      <div key={t.id} className={`${s.item} ${doneNow ? s.done : ""}`} data-task-id={t.id}>
        <div className={s.row}>
          <input type="checkbox" className={s.check} checked={doneNow} disabled={busy === t.id || !canDecide(d)}
            aria-label={doneNow ? `Reopen ${t.title}` : `Mark ${t.title} done`}
            onChange={() => decide(t, doneNow ? "reopen" : "done")} />
          <div className={s.main}>
            <div className={s.itemTitle}>{t.title}</div>
            <div className={s.meta}>
              {quoteLink(d)}
              {d.due_at && <span className={!doneNow && isOverdue(d.due_at) ? s.overdue : ""}>{!doneNow && isOverdue(d.due_at) ? "Overdue · " : "Due "}{when(d.due_at)}</span>}
              <span>{d.source === "user" ? `From ${d.created_by === userEmail ? "you" : nameOf(null, d.created_by)}` : sourceLabel(d)}</span>
            </div>
            {d.note && <p className={s.summary}>{d.note}</p>}
          </div>
          <div className={s.side}>
            <select className={s.select} aria-label={`Assignee for ${t.title}`} value={d.assigned_to || ""} disabled={busy === t.id || doneNow || !canDecide(d)}
              onChange={(e) => patch(t, { assigned_to: e.target.value || null })}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.id === userId ? "Me" : m.full_name || m.email}</option>)}
            </select>
          </div>
        </div>
      </div>
    );
  };

  const renderClosed = (t: Rec<TaskData>) => {
    const d = t.data;
    if (d.type === "todo") return renderTodo(t);
    return (
      <div key={t.id} className={s.item} data-task-id={t.id}>
        <div className={s.row}>
          <div className={s.main}>
            <span className={s.src}>{sourceLabel(d)}</span>
            <div className={s.itemTitle}>{t.title}</div>
            <div className={s.meta}>
              {quoteLink(d)}
              <span>{d.status === "done" ? "Approved" : d.status === "dismissed" ? "Dismissed" : "Failed"}{d.decided_by ? ` by ${d.decided_by === userEmail ? "you" : nameOf(null, d.decided_by)}` : ""} · {ago(d.decided_at)}</span>
            </div>
            {d.result && <p className={`${s.result} ${d.status === "failed" ? s.failed : ""}`}>{d.result}</p>}
          </div>
          {d.status === "failed" && canDecide(d) && (
            <div className={s.side}><button type="button" className={s.ghost} onClick={() => decide(t, "reopen")}>Try again</button></div>
          )}
        </div>
      </div>
    );
  };

  const list = tab === "approvals" ? approvals : tab === "todos" ? todos : closed;

  return (
    <div className={s.wrap}>
      {/* the page heading ("OK list") is the dashboard's; this row only holds the action */}
      <header className={s.head} style={{ justifyContent: "flex-end" }}>
        <button type="button" className={s.btn} onClick={() => setAdding((v) => !v)} aria-expanded={adding}>{adding ? "Close" : "New task"}</button>
      </header>

      {adding && (
        <form className={s.form} onSubmit={(e) => { e.preventDefault(); create(); }} aria-label="New task">
          <label className={s.wide}>Task<input className={s.input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Call Rohit about the revised rate" autoFocus required /></label>
          <label>Assign to
            <select className={s.input} value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
              <option value="">Nobody yet</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.id === userId ? "Me" : m.full_name || m.email}</option>)}
            </select>
          </label>
          <label>Due<input type="date" className={s.input} value={form.due_at} onChange={(e) => setForm({ ...form, due_at: e.target.value })} /></label>
          <label className={s.wide}>Note (optional)<textarea className={s.input} rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <div className={s.formFoot}>
            <button type="button" className={s.ghost} onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className={s.btn} disabled={busy === "new" || !form.title.trim()}>{busy === "new" ? "Adding…" : "Add task"}</button>
          </div>
        </form>
      )}

      <div className={s.tabs} role="tablist" aria-label="Tasks">
        {([["approvals", "Needs your OK", counts.approvals], ["todos", "To-dos", counts.todos], ["done", "Done", closed.length]] as const).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`${s.tab} ${tab === k ? s.tabOn : ""}`} onClick={() => setTab(k)}>
            {label} <b>{n}</b>
          </button>
        ))}
      </div>

      {error && <p className={s.error} role="alert">{error}</p>}

      {loaded && list.length === 0 ? (
        <div className={s.empty}>
          {tab === "approvals" ? "Nothing is waiting for an OK." : tab === "todos" ? "No open to-dos." : "Nothing finished yet."}
          <small>{tab === "approvals" ? "When Bloomgard AI or a workflow prepares an email or a change, it waits here until someone approves it." : tab === "todos" ? "Add one with New task, or ask Bloomgard AI to assign one." : "Approved, dismissed and finished tasks are kept here."}</small>
        </div>
      ) : (
        <div className={s.list}>{list.map((t) => tab === "approvals" ? renderApproval(t) : tab === "todos" ? renderTodo(t) : renderClosed(t))}</div>
      )}
    </div>
  );
}
