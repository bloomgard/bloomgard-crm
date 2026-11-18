"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Plus, Sparkles, Trash2, X, ArrowUp, ArrowDown, FlaskConical, Pencil } from "lucide-react";
import { api } from "@/lib/platform/client";
import {
  ACTION_OPTIONS, APPROVABLE, BASE_FIELDS, CLIENT_FACING, OP_OPTIONS, PLACEHOLDERS, TRIGGER_OPTIONS,
  WORKFLOW_TEMPLATES, describeWorkflow, inr,
} from "@/lib/platform/workflowTemplates";
import type { ActionType, Condition, TriggerType, WorkflowAction, WorkflowData } from "@/lib/platform/types";
import s from "./AutomationsView.module.css";

type Props = {
  isManager: boolean;
  userEmail: string;
  onOpenQuote?: (quoteId: string) => void;
  onAskAI?: (prompt: string) => void;
};

type Listed = WorkflowData & { id: string; name: string; created_at: string; sentence: string };
type Meta = {
  statuses: string[];
  fields: Array<{ key: string; label: string; type: string }>;
  logModules: Array<{ title: string; fields: Array<{ name: string; label: string; type: string; options?: string }> }>;
  members: Array<{ id: string; email: string; full_name: string | null; role: string }>;
  plugins: string[];
  canEdit: boolean;
};
type Step = { action: ActionType; outcome: string; detail: string };
type Run = { id: string; created_at: string; workflow_id: string; workflow_name: string; qn?: string | null; quote_id?: string | null; outcome: string; steps: Step[] };
type DryResult = { scanned: number; matched: number; samples: Array<{ quote_id: string | null; qn: string | null; client: string | null; amount: number | null; status: string | null; days_quiet: number | null; steps: Step[] }> };
type Draft = { id?: string; name: string; trigger: WorkflowData["trigger"]; conditions: Condition[]; actions: WorkflowAction[]; enabled: boolean };

const ago = (iso?: string | null) => {
  if (!iso) return "never";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

const blankAction = (type: ActionType): WorkflowAction => {
  switch (type) {
    case "change_status": return { type, params: { status: "", comment: "" } };
    case "add_log_entry": return { type, params: { module: "", values: {} }, approval: false };
    case "create_task": return { type, params: { title: "", assign_to: "owner", due_in_days: 1, note: "" } };
    case "notify": return { type, params: { to: "managers", title: "", body: "" } };
    case "send_email": return { type, params: { to: "client", subject: "", body: "" }, approval: true };
    case "ai_follow_up": return { type, params: { to: "client", instructions: "" }, approval: true };
    case "assign": return { type, params: { to: "" } };
    case "add_note": return { type, params: { body: "" } };
    case "slack": case "webhook": return { type, params: { text: "" } };
    default: return { type, params: {} };
  }
};

const newDraft = (): Draft => ({ name: "", trigger: { type: "quote.quiet", days: 5 }, conditions: [], actions: [blankAction("ai_follow_up")], enabled: true });

export default function AutomationsView({ isManager, onOpenQuote, onAskAI }: Props) {
  const [list, setList] = useState<Listed[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dry, setDry] = useState<DryResult | null>(null);
  const [notice, setNotice] = useState("");
  const [aiText, setAiText] = useState("");
  const canEdit = isManager && (meta?.canEdit ?? true);

  const load = useCallback(async () => {
    try {
      const [l, m, r] = await Promise.all([
        api<{ workflows: Listed[] }>("/api/workflows"),
        api<Meta>("/api/workflows?meta=1"),
        api<{ runs: Run[] }>("/api/workflows/runs?limit=20"),
      ]);
      setList(l.workflows); setMeta(m); setRuns(r.runs); setError("");
    } catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const fieldLabel = useCallback((key: string) => meta?.fields.find((f) => f.key === key)?.label || key.split(".").pop() || key, [meta]);
  const draftSentence = useMemo(() => (draft ? describeWorkflow(draft, fieldLabel) : ""), [draft, fieldLabel]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(""); setNotice("");
    try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  };

  const toggle = (w: Listed) => run(`toggle-${w.id}`, async () => {
    await api(`/api/workflows/${w.id}`, { method: "PATCH", json: { enabled: !w.enabled } });
    setList((all) => all?.map((x) => (x.id === w.id ? { ...x, enabled: !w.enabled } : x)) || null);
  });

  const remove = (w: Listed) => {
    if (!confirm(`Delete "${w.name}"? It stops running straight away. Its run history is kept.`)) return;
    run(`del-${w.id}`, async () => { await api(`/api/workflows/${w.id}`, { method: "DELETE" }); await load(); });
  };

  const runNow = (w: Listed) => {
    if (!confirm(`Run "${w.name}" now on every quote it matches today (at most 25)? Emails still only go to the OK list.`)) return;
    run(`run-${w.id}`, async () => {
      const out = await api<{ runs: number }>(`/api/workflows/${w.id}/run`, { json: {} });
      setNotice(out.runs ? `Ran on ${out.runs} quote${out.runs === 1 ? "" : "s"}. See Recent runs below.` : "Nothing matched today.");
      await load();
    });
  };

  const edit = (w: Listed) => { setDry(null); setDraft({ id: w.id, name: w.name, trigger: { ...w.trigger }, conditions: JSON.parse(JSON.stringify(w.conditions || [])), actions: JSON.parse(JSON.stringify(w.actions || [])), enabled: w.enabled }); };
  const fromTemplate = (id: string) => {
    const t = WORKFLOW_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setDry(null);
    setDraft({ name: t.name, trigger: { ...t.workflow.trigger }, conditions: JSON.parse(JSON.stringify(t.workflow.conditions)), actions: JSON.parse(JSON.stringify(t.workflow.actions)), enabled: true });
  };

  const body = (d: Draft) => ({ name: d.name, workflow: { trigger: d.trigger, conditions: d.conditions, actions: d.actions, enabled: d.enabled } });

  const save = () => draft && run("save", async () => {
    if (!draft.name.trim()) throw new Error("Give the automation a name.");
    if (draft.id) await api(`/api/workflows/${draft.id}`, { method: "PATCH", json: body(draft) });
    else await api("/api/workflows", { json: body(draft) });
    setNotice(`Saved "${draft.name}".${draft.enabled ? " It is on." : ""}`);
    setDraft(null); setDry(null);
    await load();
  });

  const dryRun = () => draft && run("dry", async () => {
    setDry(await api<DryResult>("/api/workflows/draft/dry-run", { json: { workflow: body(draft).workflow, name: draft.name || "This automation" } }));
  });

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchAction = (i: number, a: WorkflowAction) => setDraft((d) => (d ? { ...d, actions: d.actions.map((x, j) => (j === i ? a : x)) } : d));
  const moveAction = (i: number, dir: -1 | 1) => setDraft((d) => {
    if (!d) return d;
    const next = [...d.actions];
    const j = i + dir;
    if (j < 0 || j >= next.length) return d;
    [next[i], next[j]] = [next[j], next[i]];
    return { ...d, actions: next };
  });

  if (error && !list) return <div className={s.empty} role="alert">{error}</div>;
  if (!list || !meta) return <div className={s.empty}>Loading automations…</div>;

  return (
    <div className={s.wrap}>
      <p className={s.intro}>
        Rules that run on their own: when something happens to a quote, check a condition, then act. Anything that would reach a client
        waits on the OK list for a person to approve it.
      </p>

      {notice && <p className={s.notice} role="status">{notice}</p>}
      {error && <p className={s.error} role="alert">{error}</p>}

      {onAskAI && canEdit && !draft && (
        <form className={s.ask} onSubmit={(e) => { e.preventDefault(); if (aiText.trim()) { onAskAI(`Build an automation: ${aiText.trim()}`); setAiText(""); } }}>
          <Sparkles aria-hidden />
          <label htmlFor="wf-ask" className="sr-only">Describe an automation for Bloomgard AI</label>
          <input id="wf-ask" value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="Describe one, e.g. “when a quote over ₹2 lakh goes quiet for a week, tell the manager”" />
          <button type="submit" disabled={!aiText.trim()}>Ask Bloomgard AI</button>
        </form>
      )}

      {draft ? (
        <Builder
          draft={draft} meta={meta} sentence={draftSentence} busy={busy} dry={dry}
          onPatch={patch} onPatchAction={patchAction} onMoveAction={moveAction}
          onSave={save} onDryRun={dryRun} onCancel={() => { setDraft(null); setDry(null); }}
          onOpenQuote={onOpenQuote}
        />
      ) : (
        <>
          <div className={s.head}>
            <h3>Your automations <b>{list.length}</b></h3>
            {canEdit && <button className={s.primary} onClick={() => { setDry(null); setDraft(newDraft()); }}><Plus aria-hidden /> New automation</button>}
          </div>
          {list.length === 0 ? (
            <div className={s.empty}>No automations yet.{canEdit ? " Start from one below, or build your own." : " A manager can set them up."}</div>
          ) : (
            <ul className={s.list}>
              {list.map((w) => (
                <li key={w.id} className={`${s.row} ${w.enabled ? "" : s.off}`}>
                  <Switch on={w.enabled} disabled={!canEdit || busy === `toggle-${w.id}`} label={`${w.enabled ? "Turn off" : "Turn on"} ${w.name}`} onChange={() => toggle(w)} />
                  <div className={s.rowText}>
                    <span className={s.rowName}>{w.name}{w.source === "ai" && <em className={s.tag}>Built by AI</em>}</span>
                    <span className={s.rowSentence}>{describeWorkflow(w, fieldLabel)}</span>
                    <span className={s.rowMeta}>{w.runs ? `Ran ${w.runs} time${w.runs === 1 ? "" : "s"} · last ${ago(w.last_run_at)}` : "Has not run yet"}{w.created_by ? ` · by ${w.created_by}` : ""}</span>
                  </div>
                  {canEdit && (
                    <div className={s.rowActions}>
                      <button className={s.icon} onClick={() => runNow(w)} disabled={busy === `run-${w.id}`} title="Run now" aria-label={`Run ${w.name} now`}><Play aria-hidden /></button>
                      <button className={s.icon} onClick={() => edit(w)} title="Edit" aria-label={`Edit ${w.name}`}><Pencil aria-hidden /></button>
                      <button className={`${s.icon} ${s.danger}`} onClick={() => remove(w)} title="Delete" aria-label={`Delete ${w.name}`}><Trash2 aria-hidden /></button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEdit && (
            <section className={s.section} aria-label="Ready-made automations">
              <h3>Start from a ready-made one</h3>
              <div className={s.templates}>
                {WORKFLOW_TEMPLATES.map((t) => (
                  <button key={t.id} className={s.template} onClick={() => fromTemplate(t.id)}>
                    <b>{t.name}</b>
                    <span>{t.blurb}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className={s.section} aria-label="Recent runs">
            <h3>Recent runs</h3>
            {runs.length === 0 ? <div className={s.emptySmall}>Nothing has run yet.</div> : (
              <ul className={s.runs}>
                {runs.map((r) => (
                  <li key={r.id} className={s.run}>
                    <div className={s.runHead}>
                      <span className={`${s.outcome} ${s[`o_${r.outcome}`] || ""}`}>{r.outcome === "queued" ? "Waiting for OK" : r.outcome}</span>
                      <b>{r.workflow_name}</b>
                      {r.qn && (r.quote_id && onOpenQuote
                        ? <button className={s.qn} onClick={() => onOpenQuote(r.quote_id!)}>{r.qn}</button>
                        : <span className={s.qnText}>{r.qn}</span>)}
                      <span className={s.when}>{ago(r.created_at)}</span>
                    </div>
                    <ul className={s.steps}>{r.steps.map((st, i) => <li key={i}><i className={s[`d_${st.outcome}`] || ""} aria-hidden />{st.detail}</li>)}</ul>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ builder */

function Builder(p: {
  draft: Draft; meta: Meta; sentence: string; busy: string | null; dry: DryResult | null;
  onPatch: (d: Partial<Draft>) => void; onPatchAction: (i: number, a: WorkflowAction) => void; onMoveAction: (i: number, dir: -1 | 1) => void;
  onSave: () => void; onDryRun: () => void; onCancel: () => void; onOpenQuote?: (id: string) => void;
}) {
  const { draft, meta } = p;
  const t = draft.trigger;
  const fields = [...BASE_FIELDS.map((f) => ({ key: f.key, label: f.label })), ...meta.fields.map((f) => ({ key: f.key, label: f.label }))];
  const setTrigger = (type: TriggerType) => p.onPatch({ trigger: type === "quote.quiet" ? { type, days: t.days || 5 } : { type } });

  return (
    <section className={s.builder} aria-label={draft.id ? `Edit ${draft.name}` : "New automation"}>
      <div className={s.builderHead}>
        <label className={s.nameField}>
          <span>Name</span>
          <input value={draft.name} onChange={(e) => p.onPatch({ name: e.target.value })} placeholder="e.g. Chase quiet quotes" />
        </label>
        <Switch on={draft.enabled} label={draft.enabled ? "On once saved" : "Off once saved"} showLabel onChange={() => p.onPatch({ enabled: !draft.enabled })} />
      </div>
      <p className={s.sentence} aria-live="polite">{p.sentence}</p>

      <div className={s.block}>
        <h4><span>When</span></h4>
        <div className={s.line}>
          <label className={s.field}>
            <span className="sr-only">Trigger</span>
            <select value={t.type} onChange={(e) => setTrigger(e.target.value as TriggerType)}>
              {TRIGGER_OPTIONS.map((o) => <option key={o.type} value={o.type}>{o.label}</option>)}
            </select>
          </label>
          {t.type === "quote.quiet" && (
            <label className={s.field}>
              <span>for</span>
              <input type="number" min={1} max={365} value={t.days ?? 5} onChange={(e) => p.onPatch({ trigger: { ...t, days: Number(e.target.value) } })} aria-label="Days quiet" className={s.short} />
              <span>days</span>
            </label>
          )}
          {t.type === "quote.status_changed" && (
            <>
              <label className={s.field}>
                <span>from</span>
                <select value={t.from || ""} onChange={(e) => p.onPatch({ trigger: { ...t, from: e.target.value || undefined } })} aria-label="From stage">
                  <option value="">any stage</option>
                  {meta.statuses.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <label className={s.field}>
                <span>to</span>
                <select value={t.to || ""} onChange={(e) => p.onPatch({ trigger: { ...t, to: e.target.value || undefined } })} aria-label="To stage">
                  <option value="">any stage</option>
                  {meta.statuses.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
            </>
          )}
          {t.type === "log.added" && (
            <label className={s.field}>
              <span>in</span>
              <select value={t.module || ""} onChange={(e) => p.onPatch({ trigger: { ...t, module: e.target.value || undefined } })} aria-label="Log module">
                <option value="">any log</option>
                {meta.logModules.map((m) => <option key={m.title} value={m.title}>{m.title}</option>)}
              </select>
            </label>
          )}
        </div>
      </div>

      <div className={s.block}>
        <h4><span>Only if</span><small>optional</small></h4>
        {draft.conditions.map((c, i) => {
          const op = OP_OPTIONS.find((o) => o.op === c.op);
          return (
            <div className={s.line} key={i}>
              <label className={s.field}>
                <span className="sr-only">Condition {i + 1} field</span>
                <select value={c.field} onChange={(e) => p.onPatch({ conditions: draft.conditions.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>
                  {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </label>
              <label className={s.field}>
                <span className="sr-only">Condition {i + 1} comparison</span>
                <select value={c.op} onChange={(e) => p.onPatch({ conditions: draft.conditions.map((x, j) => (j === i ? { ...x, op: e.target.value as any } : x)) })}>
                  {OP_OPTIONS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                </select>
              </label>
              {op?.needsValue && (
                c.field === "status" && (c.op === "eq" || c.op === "neq") ? (
                  <label className={s.field}>
                    <span className="sr-only">Condition {i + 1} value</span>
                    <select value={String(c.value ?? "")} onChange={(e) => p.onPatch({ conditions: draft.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}>
                      <option value="">Choose a stage</option>
                      {meta.statuses.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </label>
                ) : (
                  <label className={s.field}>
                    <span className="sr-only">Condition {i + 1} value</span>
                    <input
                      value={String(c.value ?? "")} inputMode={op.numeric ? "decimal" : undefined}
                      placeholder={op.numeric ? (c.field === "amount" ? "e.g. 100000" : "a number") : c.op === "in" ? "comma, separated" : "value"}
                      onChange={(e) => p.onPatch({ conditions: draft.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                    />
                    {c.field === "amount" && op.numeric && c.value ? <small className={s.hint}>{inr(c.value)}</small> : null}
                  </label>
                )
              )}
              <button className={s.icon} onClick={() => p.onPatch({ conditions: draft.conditions.filter((_, j) => j !== i) })} aria-label={`Remove condition ${i + 1}`}><X aria-hidden /></button>
            </div>
          );
        })}
        <button className={s.add} onClick={() => p.onPatch({ conditions: [...draft.conditions, { field: "amount", op: "gt", value: "" }] })}><Plus aria-hidden /> Add a condition</button>
      </div>

      <div className={s.block}>
        <h4><span>Then</span></h4>
        <ol className={s.actions}>
          {draft.actions.map((a, i) => (
            <li key={i} className={s.action}>
              <div className={s.line}>
                <span className={s.num}>{String(i + 1).padStart(2, "0")}</span>
                <label className={s.field}>
                  <span className="sr-only">Step {i + 1}</span>
                  <select value={a.type} onChange={(e) => p.onPatchAction(i, blankAction(e.target.value as ActionType))}>
                    {ACTION_OPTIONS.map((o) => <option key={o.type} value={o.type} disabled={(o.type === "slack" || o.type === "webhook") && !meta.plugins.includes(o.type)}>{o.label}{(o.type === "slack" || o.type === "webhook") && !meta.plugins.includes(o.type) ? " (turn on in Plugins)" : ""}</option>)}
                  </select>
                </label>
                <div className={s.stepTools}>
                  <button className={s.icon} onClick={() => p.onMoveAction(i, -1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`}><ArrowUp aria-hidden /></button>
                  <button className={s.icon} onClick={() => p.onMoveAction(i, 1)} disabled={i === draft.actions.length - 1} aria-label={`Move step ${i + 1} down`}><ArrowDown aria-hidden /></button>
                  <button className={`${s.icon} ${s.danger}`} onClick={() => p.onPatch({ actions: draft.actions.filter((_, j) => j !== i) })} aria-label={`Remove step ${i + 1}`}><X aria-hidden /></button>
                </div>
              </div>
              <ActionParams a={a} i={i} meta={meta} onChange={(next) => p.onPatchAction(i, next)} />
              {CLIENT_FACING.has(a.type) ? (
                <p className={s.lock}>Always waits for an OK on the OK list before anything is sent.</p>
              ) : APPROVABLE.has(a.type) ? (
                <Switch on={!!a.approval} showLabel label="Wait for an OK on the OK list first" onChange={() => p.onPatchAction(i, { ...a, approval: !a.approval })} />
              ) : null}
            </li>
          ))}
        </ol>
        <button className={s.add} onClick={() => p.onPatch({ actions: [...draft.actions, blankAction("create_task")] })} disabled={draft.actions.length >= 10}><Plus aria-hidden /> Add a step</button>
        <p className={s.hint}>Text can use {PLACEHOLDERS.slice(0, 7).join(" ")}. Email triggers add {"{{from}} {{subject}}"}; the morning trigger adds {"{{open_quotes}} {{quiet_quotes}} {{pipeline}}"}.</p>
      </div>

      <div className={s.bar}>
        <button className={s.secondary} onClick={p.onDryRun} disabled={p.busy === "dry"}><FlaskConical aria-hidden /> {p.busy === "dry" ? "Testing…" : "Dry run"}</button>
        <span className={s.grow} />
        <button className={s.ghost} onClick={p.onCancel}>Cancel</button>
        <button className={s.primary} onClick={p.onSave} disabled={p.busy === "save"}>{p.busy === "save" ? "Saving…" : "Save automation"}</button>
      </div>

      {p.dry && (
        <div className={s.dry} aria-live="polite">
          <h4>Dry run <small>nothing was sent or changed</small></h4>
          <p className={s.dryHead}>
            {p.dry.scanned ? `${p.dry.matched} of ${p.dry.scanned} quotes match today.` : "This is what one run would do."}
            {p.dry.matched > p.dry.samples.length ? ` Showing ${p.dry.samples.length}.` : ""}
          </p>
          {p.dry.samples.length === 0 ? <div className={s.emptySmall}>No quote matches right now.</div> : (
            <ul className={s.runs}>
              {p.dry.samples.map((x, i) => (
                <li key={x.quote_id || i} className={s.run}>
                  {x.qn && (
                    <div className={s.runHead}>
                      {x.quote_id && p.onOpenQuote ? <button className={s.qn} onClick={() => p.onOpenQuote!(x.quote_id!)}>{x.qn}</button> : <span className={s.qnText}>{x.qn}</span>}
                      <b>{x.client || "—"}</b>
                      <span className={s.when}>{x.status} · {x.amount != null ? inr(x.amount) : ""} · {x.days_quiet} days quiet</span>
                    </div>
                  )}
                  <ul className={s.steps}>{x.steps.map((st, j) => <li key={j}><i className={s[`d_${st.outcome}`] || ""} aria-hidden />{st.detail}</li>)}</ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function ActionParams({ a, i, meta, onChange }: { a: WorkflowAction; i: number; meta: Meta; onChange: (a: WorkflowAction) => void }) {
  const pr = a.params || {};
  const set = (k: string, v: any) => onChange({ ...a, params: { ...pr, [k]: v } });
  const id = (k: string) => `wf-a${i}-${k}`;
  const people = (
    <>
      <option value="owner">The quote owner</option>
      <option value="creator">Whoever made this automation</option>
      {meta.members.map((m) => <option key={m.id} value={m.email}>{m.full_name ? `${m.full_name} (${m.email})` : m.email}</option>)}
    </>
  );
  const text = (k: string, label: string, ph = "", area = false) => (
    <label className={s.param} htmlFor={id(k)}>
      <span>{label}</span>
      {area
        ? <textarea id={id(k)} value={pr[k] ?? ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} rows={3} />
        : <input id={id(k)} value={pr[k] ?? ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} />}
    </label>
  );

  switch (a.type) {
    case "change_status":
      return (
        <div className={s.params}>
          <label className={s.param} htmlFor={id("status")}>
            <span>Stage</span>
            <select id={id("status")} value={pr.status || ""} onChange={(e) => set("status", e.target.value)}>
              <option value="">Choose a stage</option>
              {meta.statuses.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          {text("comment", "Note in the Status Log", "e.g. Moved by automation")}
        </div>
      );
    case "add_log_entry": {
      const mod = meta.logModules.find((m) => m.title === pr.module);
      return (
        <div className={s.params}>
          <label className={s.param} htmlFor={id("module")}>
            <span>Log module</span>
            <select id={id("module")} value={pr.module || ""} onChange={(e) => onChange({ ...a, params: { module: e.target.value, values: {} } })}>
              <option value="">Choose a log</option>
              {meta.logModules.map((m) => <option key={m.title} value={m.title}>{m.title}</option>)}
            </select>
          </label>
          {meta.logModules.length === 0 && <p className={s.hint}>No log modules yet. Turn on “Log?” for a module in the Field Configurator.</p>}
          {mod?.fields.filter((f) => f.type !== "logged_in" && f.type !== "file" && f.type !== "attachment").map((f) => {
            const vid = id(`v-${f.name}`);
            const v = pr.values?.[f.name] ?? "";
            const setV = (val: string) => set("values", { ...(pr.values || {}), [f.name]: val });
            const opts = f.type === "master_status" ? meta.statuses : f.type === "dropdown" ? String(f.options || "").split(",").map((o) => o.trim()).filter(Boolean) : null;
            return (
              <label key={f.name} className={s.param} htmlFor={vid}>
                <span>{f.label}</span>
                {opts ? (
                  <select id={vid} value={v} onChange={(e) => setV(e.target.value)}>
                    <option value="">—</option>
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : <input id={vid} value={v} onChange={(e) => setV(e.target.value)} />}
              </label>
            );
          })}
        </div>
      );
    }
    case "create_task":
      return (
        <div className={s.params}>
          {text("title", "Task", "e.g. Raise PO for {{qn}}")}
          <label className={s.param} htmlFor={id("assign_to")}>
            <span>For</span>
            <select id={id("assign_to")} value={pr.assign_to || "unassigned"} onChange={(e) => set("assign_to", e.target.value)}>
              <option value="unassigned">Nobody in particular (the team)</option>
              {people}
            </select>
          </label>
          <label className={s.param} htmlFor={id("due")}>
            <span>Due in (days)</span>
            <input id={id("due")} type="number" min={0} max={365} value={pr.due_in_days ?? ""} onChange={(e) => set("due_in_days", e.target.value === "" ? "" : Number(e.target.value))} className={s.short} />
          </label>
          {text("note", "Note", "optional", true)}
        </div>
      );
    case "notify":
      return (
        <div className={s.params}>
          <label className={s.param} htmlFor={id("to")}>
            <span>Who</span>
            <select id={id("to")} value={pr.to || "managers"} onChange={(e) => set("to", e.target.value)}>
              <option value="managers">The managers</option>
              {people}
            </select>
          </label>
          {text("title", "Message", "e.g. {{qn}} approved: {{client}}")}
          {text("body", "More detail", "optional")}
        </div>
      );
    case "send_email":
      return (
        <div className={s.params}>
          {text("to", "To", "client — or an email address")}
          {text("subject", "Subject", "e.g. Your quotation {{qn}}")}
          {text("body", "Message", "Dear {{contact}}, …", true)}
        </div>
      );
    case "ai_follow_up":
      return (
        <div className={s.params}>
          <p className={s.hint}>Bloomgard AI writes it from the quote itself, in your AI Settings tone, and never invents prices or dates. It goes to the client email on the quote.</p>
          {text("instructions", "Extra instructions", "optional, e.g. mention that prices hold until month end", true)}
        </div>
      );
    case "assign":
      return (
        <div className={s.params}>
          <label className={s.param} htmlFor={id("to")}>
            <span>Hand it to</span>
            <select id={id("to")} value={pr.to || ""} onChange={(e) => set("to", e.target.value)}>
              <option value="">Choose someone</option>
              {meta.members.map((m) => <option key={m.id} value={m.email}>{m.full_name ? `${m.full_name} (${m.email})` : m.email}</option>)}
            </select>
          </label>
        </div>
      );
    case "add_note":
      return <div className={s.params}>{text("body", "Note", "Visible to the team only", true)}</div>;
    case "slack":
    case "webhook":
      return <div className={s.params}>{text("text", "Message", "e.g. {{qn}} for {{client}} is now {{status}}")}</div>;
    default:
      return null;
  }
}

function Switch({ on, onChange, label, disabled, showLabel }: { on: boolean; onChange: () => void; label: string; disabled?: boolean; showLabel?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={showLabel ? undefined : label} disabled={disabled} onClick={onChange} className={`${s.switch} ${on ? s.switchOn : ""}`}>
      <span className={s.track}><span className={s.dot} /></span>
      {showLabel && <span>{label}</span>}
    </button>
  );
}
