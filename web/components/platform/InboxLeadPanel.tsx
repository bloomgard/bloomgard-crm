"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/platform/client";
import s from "./InboxLeadPanel.module.css";

type Req = { text: string; item_code?: string | null; item_name?: string | null; quantity?: number | null; uom?: string | null; match: "code" | "name" | "none" };
type Lead = {
  id: string; status: string; kind: string; summary: string; from_email: string; score: number; temperature: "hot" | "warm" | "cold";
  score_reasons: string[]; requirements: Req[]; reply_draft?: string; discarded_reason?: string | null;
  contact: { name?: string; company?: string; designation?: string; phone?: string; city?: string };
  quote_id?: string | null; qn?: string | null; existing_client?: { name: string; quotes: number } | null;
};

const KIND_LABEL: Record<string, string> = { reply: "Reply", newsletter: "Newsletter", spam: "Spam", other: "Not a sales enquiry" };

/**
 * What Bloomgard AI made of one inbox email: an enquiry (who, what, how promising, a drafted reply)
 * or something else, and the buttons that move it on. The reading is kept on the lead, so opening
 * the email again shows it straight away.
 */
export default function InboxLeadPanel({ emailId, onOpenLead, onOpenQuote, onUseReply }: {
  emailId: string;
  onOpenLead: (leadId: string) => void;
  onOpenQuote: (quoteId: string) => void;
  onUseReply: (body: string) => void;
}) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoaded(false); setError(""); setLead(null);
    try {
      const r = await api<{ leads: Lead[] }>(`/api/leads?status=all&email_ids=${encodeURIComponent(emailId)}`);
      setLead(r.leads?.[0] || null);
    } catch (e: any) { setError(e.message); }
    finally { setLoaded(true); }
  }, [emailId]);
  useEffect(() => { load(); }, [load]);

  const read = async (force = false) => {
    setBusy(force ? "again" : "read"); setError("");
    try {
      const r = await api<{ lead: Lead }>("/api/leads", { json: { action: "from_email", email_id: emailId, force } });
      setLead(r.lead);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  const patch = async (body: any, label: string) => {
    if (!lead) return;
    setBusy(label); setError("");
    try { const r = await api<{ lead: Lead }>(`/api/leads/${lead.id}`, { method: "PATCH", json: body }); setLead(r.lead); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  const convert = async () => {
    if (!lead) return;
    setBusy("convert"); setError("");
    try {
      const r = await api<{ quote_id: string; qn: string }>(`/api/leads/${lead.id}`, { json: { action: "convert" } });
      setLead({ ...lead, status: "converted", quote_id: r.quote_id, qn: r.qn });
      onOpenQuote(r.quote_id);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  const head = (
    <div className={s.head}>
      <span className="agent-orb agent-orb--sm" aria-hidden />
      <span className={s.title}>Bloomgard AI read this</span>
      {lead && <button type="button" className={s.again} onClick={() => read(true)} disabled={!!busy}>{busy === "again" ? "Reading…" : "Read again"}</button>}
    </div>
  );

  if (!loaded) return <section className={s.card} aria-label="AI reading">{head}<p className={s.muted}>Loading…</p></section>;

  if (!lead) return (
    <section className={s.card} aria-label="AI reading">
      <div className={s.head}><span className="agent-orb agent-orb--sm" aria-hidden /><span className={s.title}>Bloomgard AI hasn&rsquo;t read this email yet</span></div>
      <p className={s.muted}>It reads client emails for enquiries: who wrote, what they want, how it matches your catalogue, and a reply to send.</p>
      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}><button type="button" className={s.btn} onClick={() => read(false)} disabled={!!busy}>{busy === "read" ? "Reading…" : "Read it"}</button></div>
    </section>
  );

  // anything not set aside is worked as an enquiry, including one a person said is a lead
  const enquiry = lead.status !== "discarded";
  const c = lead.contact || {};
  return (
    <section className={s.card} aria-label="AI reading" data-email-lead={lead.id}>
      {head}
      <div className={s.chipRow}>
        {enquiry
          ? <span className={`${s.chip} ${s[`t_${lead.temperature}`]}`}>Enquiry · {lead.temperature} {lead.score}</span>
          : <span className={`${s.chip} ${s.chipMuted}`}>{lead.kind === "enquiry" ? "Not a lead" : KIND_LABEL[lead.kind] || "Not a sales enquiry"}</span>}
        {lead.status === "converted" && lead.qn && <span className={s.chip}>Quote {lead.qn}</span>}
        {lead.existing_client && <span className={s.tag}>returning client</span>}
      </div>
      <p className={s.summary}>{lead.summary}</p>

      {enquiry ? (
        <>
          {(c.name || c.company || c.phone) && (
            <p className={s.contact}>
              {[c.name && `${c.name}${c.designation ? `, ${c.designation}` : ""}`, c.company, c.city].filter(Boolean).join(" · ")}
              {c.phone && <> · <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}>{c.phone}</a></>}
            </p>
          )}
          {lead.requirements?.length > 0 && (
            <ul className={s.reqs} aria-label="What they asked for">
              {lead.requirements.slice(0, 6).map((r, i) => (
                <li key={i} className={r.match === "none" ? s.off : ""}>
                  <span>{[r.quantity ? `${r.quantity}` : "", r.uom || "", r.item_name || r.text].filter(Boolean).join(" ")}</span>
                  {r.match === "none" ? <em>not in catalogue</em> : r.item_code ? <code>{r.item_code}</code> : null}
                </li>
              ))}
            </ul>
          )}
          {lead.score_reasons?.length > 0 && <p className={s.muted}>Scores {lead.score}: {lead.score_reasons.slice(0, 2).join(", ")}.</p>}
          {error && <p className={s.error} role="alert">{error}</p>}
          <div className={s.actions}>
            {lead.status === "converted" && lead.quote_id
              ? <button type="button" className={s.btn} onClick={() => onOpenQuote(lead.quote_id!)}>Open {lead.qn}</button>
              : <button type="button" className={s.btn} onClick={convert} disabled={!!busy}>{busy === "convert" ? "Creating…" : "Create quote"}</button>}
            {lead.reply_draft && <button type="button" className={s.ghost} onClick={() => onUseReply(lead.reply_draft || "")}>Use reply</button>}
            <button type="button" className={s.ghost} onClick={() => onOpenLead(lead.id)}>Open lead</button>
            {lead.status !== "converted" && (
              <button type="button" className={s.link} disabled={!!busy} onClick={() => {
                const reason = window.prompt("Why is this not a lead?");
                if (reason !== null) patch({ status: "discarded", discarded_reason: reason.trim() || "Not a lead" }, "discard");
              }}>Not a lead</button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className={s.muted}>{lead.discarded_reason || "Not a sales enquiry"}, so it was not added to leads.</p>
          {error && <p className={s.error} role="alert">{error}</p>}
          <div className={s.actions}>
            <button type="button" className={s.ghost} disabled={!!busy} onClick={() => patch({ status: "new" }, "reopen")}>{busy === "reopen" ? "Saving…" : "It is an enquiry"}</button>
          </div>
        </>
      )}
    </section>
  );
}
