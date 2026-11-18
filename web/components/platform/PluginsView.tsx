"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/platform/client";
import { supabase } from "@/utils/supabaseClient";
import s from "./PluginsView.module.css";

type Field = { key: string; label: string; type: "url" | "text" | "secret"; placeholder?: string; help?: string; required?: boolean };
type State = {
  id: string; type: string; enabled: boolean; config: Record<string, any>; events?: string[];
  last_delivery?: { at: string; ok: boolean; status?: number; error?: string } | null;
} | null;
type Plugin = {
  type: string; name: string; blurb: string; category: string; needsAccount: boolean; needs?: string;
  fields: Field[]; hasEvents: boolean; state: State;
};
type Payload = { can_manage: boolean; events: Array<{ type: string; label: string }>; plugins: Plugin[] };

const GROUPS = ["Automation", "Data in", "Accounting", "Channels"];
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "");

/**
 * Settings → Plugins. Connect the workspace to other systems: a signed webhook, Slack, an inbound
 * API for website enquiry forms, and an accounting export. WhatsApp and Calls are listed with what
 * they need, since they run on the owner's own accounts. Agents can look; managers change things.
 */
export default function PluginsView({ isManager }: { isManager: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setData(await api<Payload>("/api/plugins")); setError(""); }
    catch (e: any) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const canManage = isManager && !!data?.can_manage;

  if (error && !data) return <p className={s.error} role="alert">{error}</p>;
  if (!data) return <p className={s.muted}>Loading plugins…</p>;

  return (
    <div className={s.wrap} data-testid="plugins-view">
      <p className={s.intro}>
        Plugins connect Bloomgard to the rest of your tools. Workflows can use them too, for example
        &ldquo;post to Slack when a quote is approved&rdquo;.{!canManage && " Only managers and admins can change them."}
      </p>
      {GROUPS.map((g) => {
        const items = data.plugins.filter((p) => p.category === g);
        if (!items.length) return null;
        return (
          <section key={g} className={s.group} aria-labelledby={`pg-${g}`}>
            <h3 id={`pg-${g}`} className={s.groupTitle}>{g}</h3>
            <div className={s.list}>
              {items.map((p) => (
                <PluginCard key={p.type} p={p} events={data.events} canManage={canManage} onChanged={load} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PluginCard({ p, events, canManage, onChanged }: { p: Plugin; events: Payload["events"]; canManage: boolean; onChanged: () => void }) {
  const on = !!p.state?.enabled;
  const [config, setConfig] = useState<Record<string, string>>(() => Object.fromEntries(p.fields.map((f) => [f.key, String(p.state?.config?.[f.key] ?? "")])));
  const [picked, setPicked] = useState<string[]>(p.state?.events || ["quote.created", "quote.status_changed"]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setConfig(Object.fromEntries(p.fields.map((f) => [f.key, String(p.state?.config?.[f.key] ?? "")])));
    setPicked(p.state?.events || ["quote.created", "quote.status_changed"]);
  }, [p]);

  const dirty = useMemo(() =>
    p.fields.some((f) => f.type !== "secret" && String(p.state?.config?.[f.key] ?? "") !== config[f.key])
    || (p.hasEvents && JSON.stringify([...(p.state?.events || ["quote.created", "quote.status_changed"])].sort()) !== JSON.stringify([...picked].sort())),
  [p, config, picked]);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(""); }
  };

  const save = (enabled?: boolean) => run("save", async () => {
    const body: any = { type: p.type, config, events: p.hasEvents ? picked : undefined };
    if (typeof enabled === "boolean") body.enabled = enabled;
    await api("/api/plugins", { json: body });
    setMsg({ ok: true, text: typeof enabled === "boolean" ? (enabled ? `${p.name} is on.` : `${p.name} is off.`) : "Saved." });
    onChanged();
  });

  const test = () => run("test", async () => {
    const out = await api<{ ok: boolean; detail: string }>("/api/plugins", { json: { type: p.type, action: "test" } });
    setMsg({ ok: out.ok, text: out.ok ? `Test sent. ${out.detail}` : `Test failed. ${out.detail}` });
    onChanged();
  });

  const status = p.needsAccount ? "Needs your account" : on ? "On" : "Off";

  return (
    <article className={s.card} data-plugin={p.type}>
      <header className={s.head}>
        <div className={s.titleCol}>
          <h4 className={s.name}>{p.name}</h4>
          <p className={s.blurb}>{p.blurb}</p>
        </div>
        <span className={`${s.pill} ${p.needsAccount ? s.pillWait : on ? s.pillOn : ""}`}>{status}</span>
        {(p.fields.length > 0 || p.hasEvents) && (
          <button
            type="button" role="switch" aria-checked={on} aria-label={`${p.name} on or off`}
            disabled={!canManage || !!busy}
            className={`${s.switch} ${on ? s.switchOn : ""}`}
            onClick={() => save(!on)}
          ><span className={s.track}><span className={s.dot} /></span></button>
        )}
      </header>

      {p.needsAccount && <p className={s.needs}>{p.needs}</p>}

      {p.fields.length > 0 && (
        <div className={s.fields}>
          {p.fields.map((f) => (
            <label key={f.key} className={s.field}>
              <span className={s.label}>{f.label}{f.required ? "" : " (optional)"}</span>
              <input
                className={s.input}
                type={f.type === "url" ? "url" : "text"}
                value={config[f.key] ?? ""}
                placeholder={f.placeholder}
                readOnly={!canManage || f.type === "secret"}
                onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))}
                autoComplete="off" spellCheck={false}
              />
              {f.help && <span className={s.help}>{f.help}</span>}
            </label>
          ))}
        </div>
      )}

      {p.hasEvents && (
        <fieldset className={s.events} disabled={!canManage}>
          <legend className={s.label}>Send when</legend>
          {events.map((e) => (
            <label key={e.type} className={s.check}>
              <input type="checkbox" checked={picked.includes(e.type)}
                onChange={(ev) => setPicked((cur) => ev.target.checked ? [...cur, e.type] : cur.filter((x) => x !== e.type))} />
              {e.label}
            </label>
          ))}
        </fieldset>
      )}

      {(p.type === "webhook" || p.type === "slack") && canManage && (
        <div className={s.actions}>
          <button type="button" className={s.btn} disabled={!dirty || !!busy} onClick={() => save()}>{busy === "save" ? "Saving…" : "Save"}</button>
          <button type="button" className={s.btnGhost} disabled={!!busy || !p.state?.config?.url} onClick={test}>{busy === "test" ? "Sending…" : "Send a test"}</button>
        </div>
      )}

      {p.type === "inbound_api" && <InboundApi p={p} canManage={canManage} onChanged={onChanged} />}
      {p.type === "accounting_export" && <Export canManage={canManage} />}

      {p.state?.last_delivery && (
        <p className={`${s.last} ${p.state.last_delivery.ok ? "" : s.lastBad}`}>
          Last delivery {when(p.state.last_delivery.at)}: {p.state.last_delivery.ok ? `delivered (HTTP ${p.state.last_delivery.status})` : p.state.last_delivery.error}
        </p>
      )}
      {msg && <p className={msg.ok ? s.ok : s.error} role="status">{msg.text}</p>}
    </article>
  );
}

function InboundApi({ p, canManage, onChanged }: { p: Plugin; canManage: boolean; onChanged: () => void }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const on = !!p.state?.enabled && !!p.state?.config?.token_last4;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const curl = `curl -X POST ${origin}/api/public/quotes \\
  -H "Authorization: Bearer ${token || "YOUR_TOKEN"}" \\
  -H "Content-Type: application/json" \\
  -d '{"client_name":"Acme Exports","client_email":"buyer@acme.com","message":"Need 500 m of poplin","items":[{"item_name":"Cotton Poplin","quantity":500}]}'`;

  const rotate = async () => {
    if (on && !window.confirm("Make a new token? The current one stops working straight away.")) return;
    setBusy(true); setErr("");
    try { const out = await api<{ token: string }>("/api/plugins", { json: { type: "inbound_api", action: "rotate" } }); setToken(out.token); onChanged(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const off = async () => {
    if (!window.confirm("Turn the Inbound API off? Anything using the token will be refused.")) return;
    setBusy(true); setErr("");
    try { await api("/api/plugins", { json: { type: "inbound_api", enabled: false } }); setToken(""); onChanged(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className={s.inbound}>
      <p className={s.muted}>
        {on ? <>Token ending <code>••••{p.state?.config?.token_last4}</code>, made {when(p.state?.config?.issued_at)}. New quotes arrive as Inquiry, matched to your catalogue.</>
          : "Off. Make a token to let another system create quotes here."}
      </p>
      {canManage && (
        <div className={s.actions}>
          <button type="button" className={s.btn} disabled={busy} onClick={rotate}>{busy ? "Working…" : on ? "Make a new token" : "Make a token"}</button>
          {on && <button type="button" className={s.btnGhost} disabled={busy} onClick={off}>Turn off</button>}
        </div>
      )}
      {token && (
        <div className={s.tokenBox} role="status">
          <p><b>Copy this token now.</b> It is shown only once.</p>
          <code className={s.token}>{token}</code>
        </div>
      )}
      {(on || token) && (
        <div className={s.curlWrap}>
          <pre className={s.curl}>{curl}</pre>
          <button type="button" className={s.btnGhost} onClick={() => { navigator.clipboard?.writeText(curl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy example"}</button>
        </div>
      )}
      {err && <p className={s.error} role="alert">{err}</p>}
    </div>
  );
}

function Export({ canManage }: { canManage: boolean }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const download = async () => {
    setBusy(true); setErr("");
    try {
      const { data } = await supabase.auth.getSession();
      const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
      const res = await fetch(`/api/plugins/export${qs ? `?${qs}` : ""}`, { headers: { Authorization: `Bearer ${data.session?.access_token || ""}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Export failed (${res.status})`);
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "bloomgard-approved.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!canManage) return <p className={s.muted}>Managers and admins can download the export.</p>;
  return (
    <div className={s.exportRow}>
      <label className={s.field}><span className={s.label}>From (optional)</span><input className={s.input} type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className={s.field}><span className={s.label}>To (optional)</span><input className={s.input} type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      <button type="button" className={s.btn} disabled={busy} onClick={download}>{busy ? "Preparing…" : "Download CSV"}</button>
      {err && <p className={s.error} role="alert">{err}</p>}
    </div>
  );
}
