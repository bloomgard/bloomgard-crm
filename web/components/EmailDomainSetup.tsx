"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleDashed, Copy, ExternalLink, Globe, Loader2, Mail, RefreshCw, Send, ShieldCheck, Trash2, TriangleAlert, Zap } from "lucide-react";
import { supabase } from "@/utils/supabaseClient";

type Rec = { purpose: string; type: string; name: string; fqdn: string; value: string; priority?: number; status?: string; seen?: boolean | null };
type View = {
  company?: string; routing_address: string; sender: string; can_manage: boolean; suggested?: string;
  domain: null | { name: string; status?: string; error?: string; test?: boolean; sender_local?: string; checked_at?: string; records?: Rec[]; reply?: { name: string; status?: string; records?: Rec[] } | null };
  host: null | { name: string; tip: string; nameservers: string[] };
  error?: string; cloudflare?: { added: string[]; already_there: string[] };
};

async function call(method: "GET" | "POST", body?: any, query = "") {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`/api/email-domain${query}`, {
    method, headers: { Authorization: `Bearer ${data.session?.access_token || ""}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
  return out;
}

const FREE = /^(gmail|googlemail|yahoo|outlook|hotmail|live|msn|icloud|me|aol|proton(mail)?|zoho(mail)?|rediffmail|gmx|yandex)\./;

function Copyable({ text, mono = true }: { text: string; mono?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" title="Copy" onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1200); }} className={`ed-copy ${mono ? "font-mono" : ""}`}>
      <span className="truncate">{text}</span>{ok ? <Check className="w-3.5 h-3.5 shrink-0 text-[#0e6b57]" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
    </button>
  );
}

function Badge({ status }: { status?: string }) {
  const s = status || "not_started";
  const tone = s === "verified" ? "ok" : s === "failed" || s === "temporary_failure" || s === "error" ? "bad" : s === "optional" ? "muted" : "wait";
  const label: Record<string, string> = { verified: "Verified", pending: "Checking", not_started: "Not added yet", failed: "Failed", temporary_failure: "Lost, rechecking", partially_verified: "Partly verified", partially_failed: "Partly failed", optional: "Optional", test_domain: "Test domain", error: "Problem" };
  return <span className={`ed-badge ed-badge--${tone}`}>{label[s] || s.replace(/_/g, " ")}</span>;
}

function RecordTable({ records }: { records: Rec[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="ed-table">
        <thead><tr><th>Purpose</th><th>Type</th><th>Host / Name</th><th>Value</th><th>Priority</th><th>Our provider</th><th>At your host</th></tr></thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap">{r.purpose}</td>
              <td><span className="ed-type">{r.type}</span></td>
              <td><Copyable text={r.name} /><span className="ed-fqdn">{r.fqdn}</span></td>
              <td className="max-w-[22rem]"><Copyable text={r.value} /></td>
              <td>{r.priority ?? "—"}</td>
              <td><Badge status={r.status} /></td>
              <td>{r.seen === true ? <span className="ed-seen ed-seen--ok"><Check className="w-3.5 h-3.5" />Found</span> : r.seen === false ? <span className="ed-seen"><CircleDashed className="w-3.5 h-3.5" />Not yet</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Settings → Email: connect the company's domain. Shows every DNS record to add (with copy buttons), Resend's
 * verification status next to our own DNS lookups, host-specific tips, one-click Cloudflare setup, the sender
 * address, and the workspace's routing address with forwarding steps and a live round-trip test.
 */
export default function EmailDomainSetup() {
  const [v, setV] = useState<View | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [domainInput, setDomainInput] = useState("");
  const [local, setLocal] = useState("sales");
  const [cfToken, setCfToken] = useState("");
  const [tab, setTab] = useState<"google" | "microsoft" | "other">("google");
  const [test, setTest] = useState<{ state: "idle" | "sent" | "arrived" | "late"; to?: string }>({ state: "idle" });
  const timer = useRef<any>(null);

  const load = useCallback(async (check = false) => {
    try {
      const out: View = await call("GET", undefined, check ? "?check=1" : "");
      setV(out); setErr("");
      if (out.domain?.sender_local) setLocal(out.domain.sender_local);
      if (!domainInput && out.suggested && !FREE.test(out.suggested)) setDomainInput(out.suggested);
    } catch (e: any) { setErr(e.message); }
  }, [domainInput]);

  useEffect(() => { load(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // keep checking with Resend while records are still propagating
  useEffect(() => {
    clearInterval(timer.current);
    const st = v?.domain?.status;
    if (v?.domain && !v.domain.test && st && st !== "verified" && st !== "error") timer.current = setInterval(() => load(true), 30000);
    return () => clearInterval(timer.current);
  }, [v?.domain?.status, v?.domain, load]);

  const act = async (action: string, extra: any = {}) => {
    setBusy(action); setErr("");
    try {
      const out = await call("POST", { action, ...extra });
      if (action === "test_inbound") {
        setTest({ state: "sent", to: out.to });
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const t = await call("GET", undefined, `?test=${encodeURIComponent(out.subject)}`);
          if (t.arrived) { setTest({ state: "arrived", to: out.to }); return; }
        }
        setTest({ state: "late", to: out.to });
        return;
      }
      setV(out);
      if (action === "cloudflare") setCfToken("");
    } catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };

  if (!v) return <div className="ed-card text-sm text-gray-500 flex items-center gap-2">{err ? <><TriangleAlert className="w-4 h-4" />{err}</> : <><Loader2 className="w-4 h-4 animate-spin" />Loading email setup…</>}</div>;

  const d = v.domain;
  const required = (d?.records || []).filter((r) => r.status !== "optional");
  const done = required.filter((r) => r.status === "verified").length;
  const verified = d?.status === "verified";

  return (
    <div className="space-y-5 mb-8" data-testid="email-domain">
      {/* 1. domain */}
      <section className="ed-card">
        <div className="flex flex-wrap items-center gap-3">
          <Globe className="w-5 h-5 text-[var(--neelam)]" />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900">Company email domain</h3>
            <p className="text-xs text-gray-500">Send quotes and replies from your own address, e.g. <b>sales@{d?.name || "yourcompany.com"}</b>.</p>
          </div>
          {d && <span className="ml-auto flex items-center gap-2"><Badge status={d.status} />{!d.test && required.length > 0 && <span className="text-xs text-gray-500">{done}/{required.length} records verified</span>}</span>}
        </div>

        {!d && (
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <input value={domainInput} onChange={(e) => setDomainInput(e.target.value)} placeholder="yourcompany.com" className="ed-input w-64" aria-label="Company domain" disabled={!v.can_manage} />
            <button type="button" disabled={!v.can_manage || !domainInput || busy === "create"} onClick={() => act("create", { domain: domainInput })} className="agent-btn agent-btn--primary">
              {busy === "create" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}Set up domain
            </button>
            {!v.can_manage && <span className="text-xs text-gray-500">Ask an Admin or Manager to set this up.</span>}
          </div>
        )}
        {d?.error && <p className="mt-3 text-sm text-[var(--danger,#a3192b)] flex gap-2"><TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />{d.error}</p>}
        {d?.test && <p className="mt-3 text-sm text-gray-600">{d.name} is a reserved test domain, so no DNS records are created for it.</p>}

        {/* 2. records */}
        {d && !d.test && !d.error && (
          <>
            <div className="mt-5 flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[16rem]">
                <p className="text-sm font-semibold text-gray-900">Add these records at {v.host?.name || "your DNS host"}</p>
                <p className="text-xs text-gray-600 mt-1">{v.host?.tip}</p>
                {v.host?.nameservers?.length ? <p className="text-[11px] text-gray-400 mt-1 font-mono">Nameservers: {v.host.nameservers.slice(0, 2).join(", ")}</p> : null}
              </div>
              <button type="button" onClick={() => { setBusy("verify"); call("POST", { action: "verify" }).then((o) => setV(o)).then(() => load(false)).catch((e) => setErr(e.message)).finally(() => setBusy("")); }} disabled={!!busy} className="agent-btn">
                {busy === "verify" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Check now
              </button>
            </div>
            <div className="mt-3"><RecordTable records={d.records || []} /></div>
            <p className="text-[11px] text-gray-500 mt-2">
              <b>Our provider</b> is Resend's own check; <b>At your host</b> is our live DNS lookup. New records can take a few minutes (sometimes hours) to show up.
              We re-check automatically every 30 seconds while this page is open.{d.checked_at ? ` Last checked ${new Date(d.checked_at).toLocaleTimeString()}.` : ""}
            </p>

            {v.host?.name === "Cloudflare" && v.can_manage && !verified && (
              <div className="ed-sub">
                <p className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Zap className="w-4 h-4 text-[var(--sindoor)]" />Add them for me at Cloudflare</p>
                <p className="text-xs text-gray-600 mt-1">Create an API token in Cloudflare (My Profile → API Tokens → Create Token → "Edit zone DNS", limited to {d.name}) and paste it here. It is used once to add the records and is never stored.</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <input type="password" value={cfToken} onChange={(e) => setCfToken(e.target.value)} placeholder="Cloudflare API token" className="ed-input flex-1 min-w-[14rem]" aria-label="Cloudflare API token" autoComplete="off" />
                  <button type="button" disabled={!cfToken || busy === "cloudflare"} onClick={() => act("cloudflare", { token: cfToken })} className="agent-btn agent-btn--primary">{busy === "cloudflare" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}Add records</button>
                </div>
                {v.cloudflare && <p className="text-xs text-[#0e6b57] mt-2">Added {v.cloudflare.added.length} record(s){v.cloudflare.already_there.length ? `, ${v.cloudflare.already_there.length} were already there` : ""}.</p>}
              </div>
            )}
          </>
        )}
      </section>

      {/* 3. sender */}
      {d && !d.test && !d.error && (
        <section className="ed-card">
          <div className="flex items-center gap-3">
            <ShieldCheck className={`w-5 h-5 ${verified ? "text-[#0e6b57]" : "text-gray-400"}`} />
            <div>
              <h3 className="text-base font-semibold text-gray-900">Send from</h3>
              <p className="text-xs text-gray-500">{verified ? "Your domain is verified. Choose the address quotes and replies come from." : "Available once the records above are verified. Until then mail is sent from support@bloomgard.co."}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="ed-input flex items-center gap-1 w-72 !py-0"><input value={local} onChange={(e) => setLocal(e.target.value)} className="flex-1 min-w-0 py-2 bg-transparent outline-none" disabled={!verified || !v.can_manage} aria-label="Sender name" /><span className="text-gray-500 text-sm">@{d.name}</span></div>
            <button type="button" disabled={!verified || !v.can_manage || busy === "set_sender"} onClick={() => act("set_sender", { local })} className="agent-btn agent-btn--primary">{busy === "set_sender" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Use this address</button>
            <span className="text-xs text-gray-500">Now sending as <b>{v.sender}</b></span>
          </div>
        </section>
      )}

      {/* 4. receiving */}
      <section className="ed-card">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-[var(--sindoor)]" />
          <div>
            <h3 className="text-base font-semibold text-gray-900">Receiving: your workspace address</h3>
            <p className="text-xs text-gray-500">Every email Bloomgard sends sets Reply-To to this address, so client replies arrive in your Inbox with no DNS work.</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="w-80 max-w-full"><Copyable text={v.routing_address} /></div>
          <button type="button" disabled={test.state === "sent" || !v.can_manage} onClick={() => act("test_inbound")} className="agent-btn">
            {test.state === "sent" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}Send a test
          </button>
          {test.state === "sent" && <span className="text-xs text-gray-600">Sent to {test.to}, waiting for it to come back…</span>}
          {test.state === "arrived" && <span className="text-xs text-[#0e6b57] font-semibold flex items-center gap-1"><Check className="w-3.5 h-3.5" />Arrived in your Inbox. Receiving works.</span>}
          {test.state === "late" && <span className="text-xs text-[var(--danger,#a3192b)]">Not back after a minute. It can be delayed; check the Inbox shortly.</span>}
        </div>
        <p className="text-sm font-semibold text-gray-900 mt-5">Also bring in mail sent to your existing inbox (optional)</p>
        <div className="flex gap-1 mt-2" role="tablist">
          {([["google", "Google Workspace / Gmail"], ["microsoft", "Microsoft 365 / Outlook"], ["other", "Other"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`ed-tab ${tab === k ? "ed-tab--on" : ""}`}>{l}</button>
          ))}
        </div>
        <ol className="ed-steps">
          {tab === "google" && (<>
            <li>In Gmail open <b>Settings → See all settings → Forwarding and POP/IMAP</b> and choose <b>Add a forwarding address</b>.</li>
            <li>Enter <code>{v.routing_address}</code>. Google sends a confirmation email: it appears in your Bloomgard Inbox; open it and click the link.</li>
            <li>Choose <b>Forward a copy of incoming mail</b>, or better, create a filter (e.g. from your clients' domains) that forwards only sales mail.</li>
          </>)}
          {tab === "microsoft" && (<>
            <li>In Outlook on the web open <b>Settings → Mail → Forwarding</b> (or Rules → Add new rule → Forward to).</li>
            <li>Forward to <code>{v.routing_address}</code> and keep a copy of forwarded messages.</li>
            <li>If your admin blocks external forwarding, ask them to allow it for this address in the Microsoft 365 Defender outbound spam policy.</li>
          </>)}
          {tab === "other" && (<>
            <li>Find <b>forwarding</b> or <b>mail rules</b> in your email provider.</li>
            <li>Forward sales mail to <code>{v.routing_address}</code>. Mail arrives in Bloomgard within seconds.</li>
          </>)}
        </ol>

        {d && !d.test && !d.error && (
          <div className="ed-sub">
            <p className="text-sm font-semibold text-gray-900">Branded reply address (advanced)</p>
            {!d.reply ? (
              <>
                <p className="text-xs text-gray-600 mt-1">Receive on <b>reply.{d.name}</b> instead of the Bloomgard address. Needs one more MX record on that subdomain; your main mailbox is not affected.</p>
                <button type="button" disabled={!v.can_manage || busy === "enable_replies"} onClick={() => act("enable_replies")} className="agent-btn mt-2">{busy === "enable_replies" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}Set up reply.{d.name}</button>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-600 mt-1 flex items-center gap-2">reply.{d.name} <Badge status={d.reply.status} /></p>
                <div className="mt-2"><RecordTable records={d.reply.records || []} /></div>
              </>
            )}
          </div>
        )}
      </section>

      {err && <p className="text-sm text-[var(--danger,#a3192b)] flex gap-2"><TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" />{err}</p>}
      {d && v.can_manage && (
        <div className="flex items-center gap-3">
          <a href="https://docs.bloomgard.co/crm/email/email-setup/" target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 underline inline-flex items-center gap-1">Email setup guide <ExternalLink className="w-3 h-3" /></a>
          <button type="button" onClick={() => { if (confirm(`Disconnect ${d.name}? Mail goes back to being sent from support@bloomgard.co.`)) act("remove"); }} className="agent-btn ml-auto"><Trash2 className="w-3.5 h-3.5" />Disconnect domain</button>
        </div>
      )}
    </div>
  );
}
