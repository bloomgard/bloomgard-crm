"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/platform/client";
import s from "./BuilderBlocks.module.css";

type CsStatus = "draft" | "applied" | "discarded" | "rolled_back" | "failed";
const STATUS_LABEL: Record<CsStatus, string> = {
  draft: "Draft · not live", applied: "Applied", discarded: "Discarded", rolled_back: "Rolled back", failed: "Failed · nothing changed",
};

/**
 * A change set the AI drafted in the sandbox, shown in the chat. Its state is read fresh from the
 * server, so a card reloaded from history never offers to apply something already applied.
 */
export function ChangesetBlock({ b, onApplied, onOpenStudio }: {
  b: { id: string; summary: string; lines: string[]; can_apply?: boolean };
  onApplied?: (refresh: string[]) => void;
  onOpenStudio?: () => void;
}) {
  const [status, setStatus] = useState<CsStatus>("draft");
  const [canApply, setCanApply] = useState(!!b.can_apply);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    api(`/api/changesets/${b.id}`).then((r) => { if (live) setStatus(r.status); }).catch(() => {});
    api(`/api/changesets`).then((r) => { if (live) setCanApply(!!r.can_apply || !!b.can_apply); }).catch(() => {});
    return () => { live = false; };
  }, [b.id, b.can_apply]);

  const act = async (action: "apply" | "discard" | "rollback") => {
    setBusy(action); setError("");
    try {
      const r = await api(`/api/changesets/${b.id}`, { json: { action } });
      setStatus(r.status);
      if (action !== "discard") onApplied?.(r.refresh || []);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  return (
    <section className={s.card} data-changeset={b.id} aria-label="Drafted changes">
      <header className={s.head}>
        <span className={s.kicker}>Sandbox</span>
        <span className={`${s.state} ${s[`state_${status}`] || ""}`}>{STATUS_LABEL[status]}</span>
      </header>
      <p className={s.summary}>{b.summary}</p>
      <ul className={s.lines}>
        {(b.lines || []).map((l, i) => <li key={i}>{l}</li>)}
      </ul>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}>
        {status === "draft" && (canApply ? (
          <>
            <button className={s.primary} onClick={() => act("apply")} disabled={!!busy}>{busy === "apply" ? "Applying…" : "Apply"}</button>
            <button className={s.ghost} onClick={() => act("discard")} disabled={!!busy}>Discard</button>
          </>
        ) : <span className={s.muted}>A manager or admin applies workspace changes. It is waiting in Studio.</span>)}
        {status === "applied" && canApply && <button className={s.ghost} onClick={() => act("rollback")} disabled={!!busy}>{busy === "rollback" ? "Rolling back…" : "Roll back"}</button>}
        {onOpenStudio && <button className={s.link} onClick={onOpenStudio}>Open in Studio</button>}
      </div>
    </section>
  );
}

type Finding = { id: string; severity: "high" | "medium" | "low"; title: string; detail: string; count?: number; examples?: string[]; advice?: string; fixable?: boolean; fix_summary?: string };

/** The workspace health check the AI ran, with the most serious problems first. */
export function HealthBlock({ b }: { b: { checked: number; findings: Finding[] } }) {
  const [open, setOpen] = useState<string>("");
  if (!b.findings?.length) return <section className={s.card}><p className={s.summary}>Checked {b.checked} quotes. Nothing needs fixing.</p></section>;
  return (
    <section className={s.card} aria-label="Workspace health">
      <header className={s.head}>
        <span className={s.kicker}>Health check</span>
        <span className={s.muted}>{b.checked} quotes checked</span>
      </header>
      <ul className={s.findings}>
        {b.findings.map((f) => (
          <li key={f.id} className={s.finding}>
            <button className={s.findingHead} onClick={() => setOpen(open === f.id ? "" : f.id)} aria-expanded={open === f.id}>
              <i className={`${s.dot} ${s[`sev_${f.severity}`]}`} aria-label={f.severity} />
              <b>{f.title}</b>
              {f.count != null && <span className={s.count}>{f.count}</span>}
              {f.fixable && <span className={s.fixTag}>fix ready</span>}
            </button>
            {open === f.id && (
              <div className={s.findingBody}>
                <p>{f.detail}</p>
                {f.examples?.length ? <ul>{f.examples.map((e, i) => <li key={i}>{e}</li>)}</ul> : null}
                {f.fixable && <p className={s.muted}>Ready fix: {f.fix_summary}</p>}
                {f.advice && <p className={s.muted}>{f.advice}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
