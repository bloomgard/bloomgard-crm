"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Wand2, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/platform/client";
import { HealthBlock } from "./BuilderBlocks";
import AutomationsView from "./AutomationsView";
import s from "./StudioView.module.css";

type Changeset = {
  id: string; title: string; created_at: string; status: "draft" | "applied" | "discarded" | "rolled_back" | "failed";
  summary: string; lines?: string[]; created_by?: string; source: "ai" | "user"; applied_by?: string; applied_at?: string; error?: string;
};
type Saved = { id: string; name: string; shared: boolean; mine: boolean; prompt?: string; description?: string; filters?: any; created_by?: string };
type Finding = { id: string; severity: "high" | "medium" | "low"; title: string; detail: string; count?: number; examples?: string[]; advice?: string; fixable?: boolean; fix_summary?: string };

const IDEAS = [
  "Check my workspace for problems and draft the fixes",
  "Chase any quote that is quiet for 7 days with an AI follow-up for my OK",
  "When a quote is Approved, give its owner a task to raise the PO and tell the managers",
  "Save a view of open quotes over ₹5,00,000, biggest first",
  "Make a 'Monday pipeline review' skill for Home",
  "Add a Visit log with outcome and next step to the quote form",
];

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "");
const STATUS: Record<Changeset["status"], string> = { draft: "Draft", applied: "Applied", discarded: "Discarded", rolled_back: "Rolled back", failed: "Failed" };

/**
 * Studio: the workspace as something Bloomgard AI builds with you. Ask for a change, see it drafted
 * here, apply it when it looks right, and roll any applied set back in one step. Also a health
 * check, and the views and skills the team has saved.
 */
export type StudioTab = "build" | "automations" | "saved" | "health" | "history";

export default function StudioView({ isManager, userEmail, onAskAI, onChanged, tab: tabProp, onTabChange, onOpenQuote }: {
  isManager: boolean;
  userEmail: string;
  onAskAI: (prompt: string) => void;
  onChanged?: (refresh: string[]) => void;
  tab?: StudioTab;
  onTabChange?: (t: StudioTab) => void;
  onOpenQuote?: (quoteId: string) => void;
}) {
  const [tabState, setTabState] = useState<StudioTab>(tabProp || "build");
  useEffect(() => { if (tabProp) setTabState(tabProp); }, [tabProp]);
  const tab = tabState;
  const setTab = (t: StudioTab) => { setTabState(t); onTabChange?.(t); };
  const [ask, setAsk] = useState("");
  const [sets, setSets] = useState<Changeset[]>([]);
  const [views, setViews] = useState<Saved[]>([]);
  const [skills, setSkills] = useState<Saved[]>([]);
  const [health, setHealth] = useState<{ checked: number; findings: Finding[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [c, v, k] = await Promise.all([
      api("/api/changesets").catch(() => ({ changesets: [] })),
      api("/api/views").catch(() => ({ items: [] })),
      api("/api/skills").catch(() => ({ items: [] })),
    ]);
    setSets(c.changesets || []); setViews(v.items || []); setSkills(k.items || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const check = async () => {
    setChecking(true); setError("");
    try { const h = await api("/api/diagnose"); setHealth(h); setPicked(h.findings.filter((f: Finding) => f.fixable).map((f: Finding) => f.id)); }
    catch (e: any) { setError(e.message); }
    finally { setChecking(false); }
  };

  const draftFixes = async () => {
    setBusy("fix"); setError("");
    try { await api("/api/diagnose", { json: { ids: picked } }); await load(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  const act = async (id: string, action: "apply" | "discard" | "rollback") => {
    setBusy(id + action); setError("");
    try {
      const r = await api(`/api/changesets/${id}`, { json: { action } });
      await load();
      if (action !== "discard") onChanged?.(r.refresh || []);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  const remove = async (kind: "views" | "skills", id: string) => {
    setError("");
    try { await api(`/api/${kind}?id=${id}`, { method: "DELETE" }); await load(); onChanged?.([kind]); }
    catch (e: any) { setError(e.message); }
  };

  const submit = (text: string) => { const t = text.trim(); if (t) { onAskAI(t); setAsk(""); } };
  const drafts = sets.filter((c) => c.status === "draft");
  const history = sets.filter((c) => c.status !== "draft");

  return (
    <div className={s.page}>
      <header className={s.header}>
        <h2 className="text-3xl font-bold text-gray-900">Studio</h2>
        <p className={s.lede}>Where your workspace gets built. Ask Bloomgard AI for automations, quote views, skills, form changes or data fixes: it drafts them here, nothing goes live until it is applied, and anything applied can be rolled back. The automations it builds, and the ones you make by hand, all live under Automations.</p>
      </header>

      <nav className={s.tabs} role="tablist" aria-label="Studio">
        {([
          ["build", "Build", drafts.length],
          ["automations", "Automations", null],
          ["saved", "Views & skills", views.length + skills.length],
          ["health", "Health check", health ? health.findings.length : null],
          ["history", "History", history.length],
        ] as Array<[StudioTab, string, number | null]>).map(([k, label, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`${s.tab} ${tab === k ? s.tabOn : ""}`} onClick={() => setTab(k)}>
            {label}{n != null && n > 0 ? <b>{n}</b> : null}
          </button>
        ))}
      </nav>

      {tab === "build" && <>
      <section className={s.ask} aria-label="Ask Bloomgard AI to build something">
        <label htmlFor="studio-ask" className={s.askLabel}><Wand2 aria-hidden /> What should your workspace do?</label>
        <div className={s.askRow}>
          <textarea id="studio-ask" value={ask} onChange={(e) => setAsk(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(ask); } }}
            placeholder="e.g. When a big quote is created, ask a manager to check the price before it goes out" />
          <button className={s.primary} onClick={() => submit(ask)} disabled={!ask.trim()}>Build it</button>
        </div>
        <div className={s.ideas}>
          {IDEAS.map((i) => <button key={i} onClick={() => submit(i)} className={s.idea}><Sparkles aria-hidden />{i}</button>)}
        </div>
      </section>

      {error && <p className={s.error} role="alert">{error}</p>}

      <section className={s.section} aria-labelledby="studio-drafts">
        <div className={s.sectionHead}>
          <h3 id="studio-drafts">Waiting to be applied <b>{drafts.length}</b></h3>
        </div>
        {drafts.length === 0 ? <p className={s.empty}>No drafts. Ask for a change above, or run a health check.</p> : (
          <ul className={s.list}>
            {drafts.map((c) => (
              <li key={c.id} className={s.cs} data-changeset-row={c.id}>
                <div className={s.csMain}>
                  <p className={s.csSummary}>{c.summary}</p>
                  <ul className={s.csLines}>{(c.lines || []).map((l, i) => <li key={i}>{l}</li>)}</ul>
                  <p className={s.meta}>{c.source === "ai" ? "Drafted by Bloomgard AI" : "Drafted"} for {c.created_by} · {when(c.created_at)}</p>
                </div>
                <div className={s.csActions}>
                  {isManager ? <button className={s.primary} disabled={!!busy} onClick={() => act(c.id, "apply")}>{busy === c.id + "apply" ? "Applying…" : "Apply"}</button>
                    : <span className={s.meta}>A manager applies this</span>}
                  <button className={s.ghost} disabled={!!busy} onClick={() => act(c.id, "discard")}>Discard</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      </>}

      {tab === "automations" && (
        <AutomationsView isManager={isManager} userEmail={userEmail} onOpenQuote={onOpenQuote} />
      )}

      {tab === "health" && (
      <section className={s.section} aria-labelledby="studio-health">
        <div className={s.sectionHead}>
          <h3 id="studio-health">Health check</h3>
          <button className={s.ghost} onClick={check} disabled={checking}>{checking ? "Checking…" : health ? "Check again" : "Check my workspace"}</button>
        </div>
        {!health ? <p className={s.empty}>Looks for quotes whose form disagrees with their status, statuses outside your pipeline, quotes nobody can follow up on, quiet quotes nothing chases, and setup gaps.</p> : (
          <>
            <HealthBlock b={health} />
            {health.findings.some((f) => f.fixable) && (
              <div className={s.fixRow}>
                {health.findings.filter((f) => f.fixable).map((f) => (
                  <label key={f.id} className={s.fixPick}>
                    <input type="checkbox" checked={picked.includes(f.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, f.id] : picked.filter((x) => x !== f.id))} />
                    {f.fix_summary}
                  </label>
                ))}
                <button className={s.primary} disabled={!picked.length || busy === "fix"} onClick={draftFixes}>{busy === "fix" ? "Drafting…" : "Draft these fixes"}</button>
              </div>
            )}
          </>
        )}
      </section>

      )}

      {tab === "saved" && <>
      <div className={s.grid}>
        <section className={s.section} aria-labelledby="studio-views">
          <div className={s.sectionHead}><h3 id="studio-views">Quote views <b>{views.length}</b></h3></div>
          {views.length === 0 ? <p className={s.empty}>Saved views show up as tabs on Quotes.</p> : (
            <ul className={s.saved}>{views.map((v) => (
              <li key={v.id}><span><b>{v.name}</b>{v.shared ? " · team" : " · just you"}</span>
                {(v.mine || isManager) && <button aria-label={`Delete view ${v.name}`} onClick={() => remove("views", v.id)}><Trash2 aria-hidden /></button>}</li>
            ))}</ul>
          )}
        </section>
        <section className={s.section} aria-labelledby="studio-skills">
          <div className={s.sectionHead}><h3 id="studio-skills">AI skills <b>{skills.length}</b></h3></div>
          {skills.length === 0 ? <p className={s.empty}>Skills are one-click instructions on Home, like a Monday pipeline review.</p> : (
            <ul className={s.saved}>{skills.map((k) => (
              <li key={k.id}><span><b>{k.name}</b>{k.shared ? " · team" : " · just you"}<small>{k.prompt}</small></span>
                {(k.mine || isManager) && <button aria-label={`Delete skill ${k.name}`} onClick={() => remove("skills", k.id)}><Trash2 aria-hidden /></button>}</li>
            ))}</ul>
          )}
        </section>
      </div>
      </>}

      {tab === "history" && (
      <section className={s.section} aria-labelledby="studio-history">
        <div className={s.sectionHead}><h3 id="studio-history">History</h3></div>
        {history.length === 0 ? <p className={s.empty}>Applied, discarded and rolled-back changes are kept here.</p> : (
          <ul className={s.list}>
            {history.map((c) => (
              <li key={c.id} className={s.cs}>
                <div className={s.csMain}>
                  <p className={s.csSummary}><span className={`${s.badge} ${s[`b_${c.status}`] || ""}`}>{STATUS[c.status]}</span>{c.summary}</p>
                  <ul className={s.csLines}>{(c.lines || []).map((l, i) => <li key={i}>{l}</li>)}</ul>
                  <p className={s.meta}>{c.applied_at ? `Applied by ${c.applied_by} · ${when(c.applied_at)}` : when(c.created_at)}{c.error ? ` · ${c.error}` : ""}</p>
                </div>
                {c.status === "applied" && isManager && (
                  <div className={s.csActions}>
                    <button className={s.ghost} disabled={!!busy} onClick={() => act(c.id, "rollback")}><RotateCcw aria-hidden />{busy === c.id + "rollback" ? "Rolling back…" : "Roll back"}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </div>
  );
}
