"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Plus, Search, X } from "lucide-react";
import { api } from "@/lib/platform/client";
import s from "./LeadsView.module.css";

type Req = { text: string; item_code?: string | null; item_name?: string | null; quantity?: number | null; uom?: string | null; rate?: number | null; match: "code" | "name" | "none" };
type Lead = {
  id: string; title: string; created_at: string;
  status: "new" | "qualified" | "contacted" | "converted" | "discarded";
  kind: string; source: string; email_id?: string | null; subject?: string; received_at?: string; from_email: string;
  contact: { name?: string; company?: string; designation?: string; phone?: string; gstin?: string; city?: string; country?: string; website?: string };
  summary: string; intent?: string; urgency?: string; deadline?: string | null;
  requirements: Req[]; score: number; temperature: "hot" | "warm" | "cold"; score_reasons: string[];
  existing_client?: { id: string; name: string; last_qn?: string | null; quotes: number } | null;
  reply_draft?: string; owner_email?: string | null; quote_id?: string | null; qn?: string | null;
  discarded_reason?: string | null; notes?: string; contacted_at?: string | null;
};
type Stats = { new: number; hot: number; this_week: number; converted: number; conversion: number };
type Member = { id: string; email: string; full_name: string | null };

const TABS: Array<[string, string]> = [["open", "Open"], ["new", "New"], ["qualified", "Qualified"], ["contacted", "Contacted"], ["converted", "Converted"], ["discarded", "Not leads"], ["all", "All"]];
const TEMP_LABEL = { hot: "Hot", warm: "Warm", cold: "Cold" } as const;

const ago = (iso?: string) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
const who = (l: Lead) => l.contact?.company || l.contact?.name || l.from_email;
const reqLabel = (r: Req) => [r.quantity ? `${r.quantity}` : "", r.uom || "", r.item_name || r.text].filter(Boolean).join(" ");
const inStatus = (l: Lead, tab: string) =>
  tab === "all" ? true : tab === "open" ? ["new", "qualified", "contacted"].includes(l.status) : l.status === tab;

/**
 * Lead Gen: enquiries the AI read out of the inbox (and ones people added), scored and matched to
 * the catalogue, worked from a drawer until they become a quote or are set aside.
 */
export default function LeadsView({ isManager, userEmail, focusLeadId, onOpenQuote, onOpenEmail, onReviewInForm }: {
  isManager: boolean;
  userEmail: string;
  focusLeadId?: string;
  onOpenQuote: (quoteId: string) => void;
  onOpenEmail?: (emailId: string) => void;
  onReviewInForm?: (lead: any) => void;
}) {
  const [all, setAll] = useState<Lead[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState("open");
  const [temp, setTemp] = useState<"" | "hot" | "warm" | "cold">("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string>(focusLeadId || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scan, setScan] = useState<{ busy: boolean; msg: string; remaining: number }>({ busy: false, msg: "", remaining: 0 });
  const [adding, setAdding] = useState(false);
  const [paste, setPaste] = useState({ text: "", from_email: "" });
  const [addBusy, setAddBusy] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await api<{ leads: Lead[]; stats: Stats }>("/api/leads?status=all");
      setAll(r.leads || []); setStats(r.stats); setError("");
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api<{ members: Member[] }>("/api/team?members=1").then((r) => setMembers(r.members || [])).catch(() => {}); }, []);
  useEffect(() => { if (focusLeadId) setOpenId(focusLeadId); }, [focusLeadId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((l) => inStatus(l, tab))
      .filter((l) => !temp || l.temperature === temp)
      .filter((l) => !needle || [l.title, l.from_email, l.contact?.company, l.contact?.name, l.summary].some((x) => String(x || "").toLowerCase().includes(needle)))
      .sort((a, b) => (tab === "open" || tab === "new" ? b.score - a.score : 0) || String(b.created_at).localeCompare(String(a.created_at)));
  }, [all, tab, temp, q]);

  const counts = useMemo(() => Object.fromEntries(TABS.map(([k]) => [k, all.filter((l) => inStatus(l, k)).length])), [all]);
  const open = all.find((l) => l.id === openId) || null;

  const runScan = async () => {
    setScan({ busy: true, msg: "", remaining: 0 });
    try {
      const r = await api<{ read: number; leads: number; skipped: number; remaining: number; errors: string[] }>("/api/leads", { json: { action: "scan", limit: 15 } });
      const msg = r.read === 0 ? "Nothing new to read: every recent email has been read already."
        : `Read ${r.read} email${r.read === 1 ? "" : "s"}: ${r.leads} lead${r.leads === 1 ? "" : "s"}, ${r.skipped} not ${r.skipped === 1 ? "an enquiry" : "enquiries"}${r.remaining ? `; ${r.remaining} older left` : ""}.${r.errors?.length ? ` ${r.errors.length} could not be read.` : ""}`;
      setScan({ busy: false, msg, remaining: r.remaining });
      await load();
    } catch (e: any) { setScan({ busy: false, msg: e.message, remaining: 0 }); }
  };

  const addLead = async () => {
    setAddBusy(true); setError("");
    try {
      const r = await api<{ lead: Lead }>("/api/leads", { json: { action: "manual", text: paste.text, from_email: paste.from_email || undefined } });
      setPaste({ text: "", from_email: "" }); setAdding(false);
      await load(); setOpenId(r.lead.id);
    } catch (e: any) { setError(e.message); }
    finally { setAddBusy(false); }
  };

  const replace = (l: Lead) => setAll((xs) => xs.map((x) => (x.id === l.id ? l : x)));

  return (
    <div className={s.wrap}>
      {stats && (
        <div className={s.stats} aria-label="Lead statistics">
          <div className={s.stat}><span>New</span><b>{stats.new}</b></div>
          <div className={s.stat}><span>Hot</span><b className={stats.hot ? s.hotNum : ""}>{stats.hot}</b></div>
          <div className={s.stat}><span>This week</span><b>{stats.this_week}</b></div>
          <div className={s.stat}><span>Converted</span><b>{stats.converted}</b><small>{stats.conversion}% of leads</small></div>
        </div>
      )}

      <div className={s.actions}>
        <button type="button" className={s.btn} onClick={runScan} disabled={scan.busy}>
          <Inbox aria-hidden />{scan.busy ? "Reading the inbox…" : scan.remaining ? "Read more" : "Read the inbox for leads"}
        </button>
        <button type="button" className={s.ghost} onClick={() => setAdding((v) => !v)} aria-expanded={adding}><Plus aria-hidden />Add a lead</button>
        {scan.msg && <p className={s.note} role="status">{scan.msg}</p>}
      </div>

      {adding && (
        <form className={s.addForm} onSubmit={(e) => { e.preventDefault(); if (paste.text.trim()) addLead(); }}>
          <label className={s.wide}>The enquiry
            <textarea className={s.input} rows={5} value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })}
              placeholder="Paste a WhatsApp message, a phone note or a forwarded email. Bloomgard AI pulls out who it is from and what they want." />
          </label>
          <label>Sender email (optional)
            <input className={s.input} type="email" value={paste.from_email} onChange={(e) => setPaste({ ...paste, from_email: e.target.value })} placeholder="buyer@company.com" />
          </label>
          <div className={s.formFoot}>
            <button type="button" className={s.ghost} onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className={s.btn} disabled={addBusy || paste.text.trim().length < 10}>{addBusy ? "Reading…" : "Add lead"}</button>
          </div>
        </form>
      )}

      <div className={s.tabs} role="tablist" aria-label="Lead status">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${s.tab} ${tab === k ? s.tabOn : ""}`} onClick={() => setTab(k)}>
            {label} <b>{counts[k] ?? 0}</b>
          </button>
        ))}
      </div>

      <div className={s.bar}>
        <div className={s.chips} role="group" aria-label="Temperature">
          {(["hot", "warm", "cold"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={temp === t} className={`${s.chip} ${s[`t_${t}`]} ${temp === t ? s.chipOn : ""}`} onClick={() => setTemp(temp === t ? "" : t)}>{TEMP_LABEL[t]}</button>
          ))}
        </div>
        <div className={s.search}>
          <Search aria-hidden />
          <input aria-label="Search leads" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company, person, email or what they asked for" />
        </div>
      </div>

      {error && <p className={s.error} role="alert">{error}</p>}

      {loading ? <p className={s.empty}>Loading leads…</p> : filtered.length === 0 ? (
        <div className={s.emptyBox}>
          <p>{all.length ? "No leads match this view." : "No leads yet."}</p>
          <small>New client emails are read for leads automatically. Read older ones with &lsquo;Read the inbox for leads&rsquo;.</small>
        </div>
      ) : (
        <ul className={s.list} aria-label="Leads">
          {filtered.map((l) => (
            <li key={l.id}>
              <button type="button" className={`${s.row} ${openId === l.id ? s.rowOn : ""}`} onClick={() => setOpenId(l.id)} data-lead={l.id}>
                <span className={s.rowMain}>
                  <span className={s.rowHead}>
                    <span className={`${s.temp} ${s[`t_${l.temperature}`]}`}>{TEMP_LABEL[l.temperature]}</span>
                    <b className={s.who}>{who(l)}</b>
                    <span className={s.from}>{l.from_email}</span>
                    {l.existing_client && <span className={s.tag}>returning client</span>}
                    {l.status !== "new" && <span className={s.status}>{l.status === "discarded" ? "not a lead" : l.status}</span>}
                  </span>
                  <span className={s.summary}>{l.summary}</span>
                  {l.requirements?.length > 0 && (
                    <span className={s.reqs}>
                      {l.requirements.slice(0, 4).map((r, i) => (
                        <span key={i} className={`${s.req} ${r.match === "none" ? s.reqOff : ""}`}>
                          {reqLabel(r)}{r.match === "none" && <em>not in catalogue</em>}
                        </span>
                      ))}
                      {l.requirements.length > 4 && <span className={s.more}>+{l.requirements.length - 4} more</span>}
                    </span>
                  )}
                </span>
                <span className={s.rowSide}>
                  <span className={s.score} aria-label={`Score ${l.score} of 100`}>{l.score}</span>
                  <span className={s.age}>{ago(l.received_at || l.created_at)}</span>
                  <span className={s.owner}>{l.owner_email ? (members.find((m) => m.email === l.owner_email)?.full_name || l.owner_email) : "Unassigned"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <LeadDrawer
          key={open.id}
          lead={open}
          members={members}
          isManager={isManager}
          userEmail={userEmail}
          onClose={() => setOpenId("")}
          onChange={(l) => { replace(l); load(); }}
          onOpenQuote={onOpenQuote}
          onOpenEmail={onOpenEmail}
          onReviewInForm={onReviewInForm}
        />
      )}
    </div>
  );
}

function LeadDrawer({ lead, members, isManager, userEmail, onClose, onChange, onOpenQuote, onOpenEmail, onReviewInForm }: {
  lead: Lead; members: Member[]; isManager: boolean; userEmail: string;
  onClose: () => void; onChange: (l: Lead) => void;
  onOpenQuote: (quoteId: string) => void; onOpenEmail?: (emailId: string) => void; onReviewInForm?: (lead: any) => void;
}) {
  const [reqs, setReqs] = useState<Req[]>(lead.requirements || []);
  const [reqsDirty, setReqsDirty] = useState(false);
  const [reply, setReply] = useState(lead.reply_draft || "");
  const [subject, setSubject] = useState(lead.subject ? (/^re:/i.test(lead.subject) ? lead.subject : `Re: ${lead.subject}`) : "Your enquiry");
  const [notes, setNotes] = useState(lead.notes || "");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const patch = async (body: any, label: string) => {
    setBusy(label); setError(""); setMsg("");
    try {
      const r = await api<{ lead: Lead }>(`/api/leads/${lead.id}`, { method: "PATCH", json: body });
      onChange(r.lead);
      return r.lead;
    } catch (e: any) { setError(e.message); return null; }
    finally { setBusy(""); }
  };

  const convert = async () => {
    setBusy("convert"); setError("");
    try {
      const r = await api<{ quote_id: string; qn: string }>(`/api/leads/${lead.id}`, { json: { action: "convert" } });
      onChange({ ...lead, status: "converted", quote_id: r.quote_id, qn: r.qn });
      onOpenQuote(r.quote_id);
    } catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  const send = async () => {
    if (!window.confirm(`Send this reply to ${lead.from_email}?`)) return;
    setBusy("reply"); setError(""); setMsg("");
    try {
      const r = await api<{ message: string }>(`/api/leads/${lead.id}`, { json: { action: "reply", subject, body: reply } });
      setMsg(r.message || "Sent.");
      onChange({ ...lead, status: lead.status === "new" || lead.status === "qualified" ? "contacted" : lead.status, reply_draft: reply, contacted_at: new Date().toISOString() });
    } catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  const discard = async () => {
    const reason = window.prompt("Why is this not a lead? (for example: a supplier, spam, already handled)");
    if (reason === null) return;
    await patch({ status: "discarded", discarded_reason: reason.trim() || "Not a lead" }, "discard");
  };

  const c = lead.contact || {};
  const canEdit = isManager || !lead.owner_email || lead.owner_email === userEmail;
  const converted = lead.status === "converted";

  return (
    <div className={s.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className={s.drawer} role="dialog" aria-modal="true" aria-label={`Lead: ${who(lead)}`}>
        <header className={s.dHead}>
          <div>
            <span className={`${s.temp} ${s[`t_${lead.temperature}`]}`}>{TEMP_LABEL[lead.temperature]} · {lead.score}</span>
            <h3 className={s.dTitle}>{who(lead)}</h3>
            <p className={s.dSub}>{lead.status === "discarded" ? `Not a lead: ${lead.discarded_reason || "set aside"}` : `${lead.status[0].toUpperCase()}${lead.status.slice(1)}`} · {ago(lead.received_at || lead.created_at)}</p>
          </div>
          <button type="button" className={s.close} onClick={onClose} aria-label="Close lead"><X aria-hidden /></button>
        </header>

        {error && <p className={s.error} role="alert">{error}</p>}
        {msg && <p className={s.ok} role="status">{msg}</p>}

        <div className={s.primaryRow}>
          {converted && lead.quote_id ? (
            <button type="button" className={s.btn} onClick={() => onOpenQuote(lead.quote_id!)}>Quote {lead.qn} →</button>
          ) : (
            <button type="button" className={s.btn} onClick={convert} disabled={!!busy || !canEdit}>{busy === "convert" ? "Creating…" : "Create quote"}</button>
          )}
          {onReviewInForm && !converted && <button type="button" className={s.ghost} onClick={() => onReviewInForm(lead)}>Review in form</button>}
        </div>

        <section className={s.block} aria-label="Contact">
          <h4>Contact</h4>
          <dl className={s.dl}>
            {c.name && <><dt>Name</dt><dd>{c.name}{c.designation ? `, ${c.designation}` : ""}</dd></>}
            {c.company && <><dt>Company</dt><dd>{c.company}</dd></>}
            <dt>Email</dt><dd><a href={`mailto:${lead.from_email}`}>{lead.from_email}</a></dd>
            {c.phone && <><dt>Phone</dt><dd><a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}>{c.phone}</a></dd></>}
            {c.gstin && <><dt>GSTIN</dt><dd className={s.mono}>{c.gstin}</dd></>}
            {(c.city || c.country) && <><dt>Place</dt><dd>{[c.city, c.country].filter(Boolean).join(", ")}</dd></>}
            {c.website && <><dt>Website</dt><dd><a href={/^https?:/i.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer">{c.website}</a></dd></>}
          </dl>
          {lead.existing_client && (
            <p className={s.returning}>Returning client: <b>{lead.existing_client.name}</b>, {lead.existing_client.quotes} earlier quote{lead.existing_client.quotes === 1 ? "" : "s"}{lead.existing_client.last_qn ? `, last ${lead.existing_client.last_qn}` : ""}.</p>
          )}
        </section>

        <section className={s.block} aria-label="Summary">
          <h4>What they want</h4>
          <p className={s.text}>{lead.summary}</p>
          {(lead.deadline || lead.urgency === "high") && <p className={s.muted}>{lead.deadline ? `Needed by ${lead.deadline}` : "Marked urgent"}</p>}
        </section>

        <section className={s.block} aria-label="What they asked for">
          <h4>What they asked for</h4>
          {reqs.length === 0 ? <p className={s.muted}>No specific items. Ask what they need, or add the items in the quote.</p> : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>Asked for</th><th>Catalogue</th><th className={s.num}>Qty</th><th>Unit</th><th className={s.num}>Rate</th></tr></thead>
                <tbody>
                  {reqs.map((r, i) => (
                    <tr key={i} className={r.match === "none" ? s.offRow : ""}>
                      <td>{r.text}</td>
                      <td>{r.match === "none" ? <span className={s.offMark}>Not in catalogue</span> : <><b>{r.item_name}</b>{r.item_code ? <small className={s.mono}>{r.item_code}</small> : null}</>}</td>
                      <td className={s.num}>
                        <input aria-label={`Quantity for ${r.text}`} className={s.qty} inputMode="decimal" value={r.quantity ?? ""} disabled={!canEdit || converted}
                          onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); setReqs(reqs.map((x, j) => (j === i ? { ...x, quantity: v === "" ? null : Number(v) } : x))); setReqsDirty(true); }} />
                      </td>
                      <td>{r.uom || ""}</td>
                      <td className={s.num}>{r.rate != null ? `₹${Number(r.rate).toLocaleString("en-IN")}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {reqsDirty && (
            <div className={s.inlineActions}>
              <button type="button" className={s.ghost} disabled={!!busy} onClick={async () => { const l = await patch({ requirements: reqs }, "reqs"); if (l) { setReqs(l.requirements); setReqsDirty(false); } }}>{busy === "reqs" ? "Saving…" : "Save quantities"}</button>
              <button type="button" className={s.link} onClick={() => { setReqs(lead.requirements || []); setReqsDirty(false); }}>Undo</button>
            </div>
          )}
        </section>

        <section className={s.block} aria-label="Score">
          <h4>Why it scores {lead.score}</h4>
          {lead.score_reasons?.length ? <ul className={s.reasons}>{lead.score_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p className={s.muted}>No strong signals yet.</p>}
        </section>

        {(lead.email_id || lead.subject) && (
          <section className={s.block} aria-label="Source email">
            <h4>Source</h4>
            <p className={s.text}>{lead.source === "manual" ? "Added by hand" : "Email"}{lead.subject ? `: “${lead.subject}”` : ""}{lead.received_at ? ` · ${new Date(lead.received_at).toLocaleString()}` : ""}</p>
            {lead.email_id && onOpenEmail && <button type="button" className={s.link} onClick={() => onOpenEmail(lead.email_id!)}>Open the email in Inbox</button>}
          </section>
        )}

        {lead.kind === "enquiry" && !converted && (
          <section className={s.block} aria-label="Reply">
            <h4>Reply</h4>
            <label className={s.field}>Subject<input className={s.input} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canEdit} /></label>
            <label className={s.field}>Message<textarea className={s.input} rows={8} value={reply} onChange={(e) => setReply(e.target.value)} disabled={!canEdit} /></label>
            <div className={s.inlineActions}>
              <button type="button" className={s.btn} onClick={send} disabled={!!busy || !canEdit || !reply.trim()}>{busy === "reply" ? "Sending…" : "Send reply"}</button>
              {lead.contacted_at && <span className={s.muted}>Last contacted {ago(lead.contacted_at)}</span>}
            </div>
          </section>
        )}

        <section className={s.block} aria-label="Work the lead">
          <h4>Owner and status</h4>
          <label className={s.field}>Owner
            <select className={s.input} value={lead.owner_email || ""} disabled={!!busy || !canEdit} onChange={(e) => patch({ owner_email: e.target.value || null }, "owner")}>
              <option value="">Unassigned</option>
              {members.map((m) => <option key={m.id} value={m.email}>{m.full_name ? `${m.full_name} (${m.email})` : m.email}</option>)}
            </select>
          </label>
          {!converted && (
            <div className={s.statusRow}>
              {lead.status !== "qualified" && lead.status !== "discarded" && <button type="button" className={s.ghost} disabled={!!busy || !canEdit} onClick={() => patch({ status: "qualified" }, "qualified")}>Qualified</button>}
              {lead.status !== "contacted" && lead.status !== "discarded" && <button type="button" className={s.ghost} disabled={!!busy || !canEdit} onClick={() => patch({ status: "contacted" }, "contacted")}>Contacted</button>}
              {lead.status !== "discarded"
                ? <button type="button" className={s.ghost} disabled={!!busy || !canEdit} onClick={discard}>Not a lead</button>
                : <button type="button" className={s.ghost} disabled={!!busy || !canEdit} onClick={() => patch({ status: "new" }, "reopen")}>Reopen</button>}
            </div>
          )}
          <label className={s.field}>Notes
            <textarea className={s.input} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} placeholder="Only your team sees these." />
          </label>
          {notes !== (lead.notes || "") && (
            <div className={s.inlineActions}>
              <button type="button" className={s.ghost} disabled={!!busy} onClick={() => patch({ notes }, "notes")}>{busy === "notes" ? "Saving…" : "Save notes"}</button>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
