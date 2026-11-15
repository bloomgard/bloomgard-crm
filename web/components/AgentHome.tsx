"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp, BarChart3, Bell, Check, ChevronRight, Copy, CornerUpLeft, Database, Download, FileSpreadsheet, Loader2, Mail, Mic, PenLine, Square,
  Plus, RotateCcw, Settings as SettingsIcon, Sparkles, X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/utils/supabaseClient";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

type Step = { id: string; name: string; label: string; write?: boolean; status: "running" | "done" | "error"; ms?: number; note?: string };
type Action = {
  id: string; kind: string; title: string; summary: string; risk: string;
  details: Array<[string, string]>; preview?: string; payload: any;
  state?: "pending" | "running" | "done" | "failed" | "dismissed"; result?: string; secret?: string;
};
type Msg = {
  id: string; role: "user" | "ai"; text: string; steps?: Step[]; blocks?: any[]; actions?: Action[];
  error?: string; live?: boolean; typing?: boolean;
};
type Overview = {
  user: { name: string; email: string; role: string }; company: string;
  stats: { total: number; totalValue: number; byStatus: Record<string, number>; valueByStatus?: Record<string, number>; mine: number; myValue: number; weeks: number[] };
  inbox: { unread: number; waiting: number }; followups: { hot: number; warm: number; cold: number };
  latest: Array<{ qn: string; status: string; client: string; value: number; date: string; items: number }>;
  logs?: Array<{ module: string; fields: Array<{ name: string; label: string; options: string[] }>; entries: Array<{ qn: string; at: string | null; by: string; v: Record<string, string> }> }>;
  chips: Array<{ label: string; prompt: string; icon: string; nav?: string }>;
};

export type AgentHomeProps = {
  userEmail: string;
  onOpenQuote: (qn: string) => void;
  onNewQuote: () => void;
  onNavigate: (view: string) => void;
  onChanged: (kinds: string[]) => void;
  docsLink?: React.ReactNode;
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const uid = () => Math.random().toString(36).slice(2, 10);
const PALETTE = ["#2747d8", "#ea5420", "#e5a03a", "#0e6b57", "#7f9bff", "#b83a0e", "#18214a", "#8c8478"];
const STATUS_DOT: Record<string, string> = {
  Approved: "#0e6b57", Pending: "#e5a03a", Inquiry: "#2747d8", Draft: "#8c8478", Rejected: "#b83a0e", Lost: "#a3192b", Lead: "#ea5420",
};
const CHIP_ICONS: Record<string, any> = { mail: Mail, reply: CornerUpLeft, bell: Bell, plus: Plus, chart: BarChart3, sparkle: Sparkles, db: Database, settings: SettingsIcon };

type Suggestion = { text: string; icon: string; fill?: boolean; prompt?: string };
/** More things worth asking. Items with fill:true are templates: they drop into the box for you to complete. */
const MORE_QUESTIONS: Suggestion[] = [
  { icon: "bell", text: "Which quotes haven't been touched in over 10 days?" },
  { icon: "db", text: "Who are my top 5 clients by quote value?" },
  { icon: "chart", text: "Show a line chart of quotes per month" },
  { icon: "chart", text: "Pie chart of quote value by client" },
  { icon: "mail", text: "Summarize the latest email from each client" },
  { icon: "reply", text: "Draft a follow-up for my largest pending quote" },
  { icon: "sparkle", text: "Compare this month with last month" },
  { icon: "db", text: "Which catalogue items have no rate set?" },
  { icon: "settings", text: "Explain how my email forwarding works" },
  { icon: "settings", text: "What is my AI tone set to, and what would you change?" },
  { icon: "plus", text: "Create a quote for ", fill: true },
  { icon: "reply", text: "Reply to ", fill: true },
  { icon: "db", text: "Change the rate of  to ", fill: true },
  { icon: "settings", text: "Set the AI tone to ", fill: true },
  { icon: "sparkle", text: "Mark  as Approved", fill: true },
  { icon: "sparkle", text: "Find quotes for ", fill: true },
];

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const ago = (iso?: string) => {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`;
};

async function authHeaders(fresh = false) {
  const { data } = fresh ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token || ""}`, "Content-Type": "application/json" };
}

/**
 * Calls the agent API as the signed-in user. A 401 usually means the access token went stale: refresh the
 * session once and retry. If the session itself is gone (signed out or revoked elsewhere), go to sign-in
 * instead of leaving a half-working page.
 */
async function agentFetch(url: string, init: RequestInit = {}) {
  let res = await fetch(url, { ...init, headers: { ...(await authHeaders()), ...(init.headers || {}) } });
  if (res.status !== 401) return res;
  res = await fetch(url, { ...init, headers: { ...(await authHeaders(true)), ...(init.headers || {}) } });
  if (res.status === 401) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    window.location.replace("/login");
  }
  return res;
}

/** Tiny markdown: **bold**, `code`, bullets, numbered lists, headings, paragraphs. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((p, i) =>
    p.startsWith("**") ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
      : p.startsWith("`") ? <code key={i} className="px-1 py-0.5 rounded bg-gray-100 text-[0.85em] font-mono">{p.slice(1, -1)}</code>
        : <React.Fragment key={i}>{p}</React.Fragment>);
}
function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list; list = null;
    const Tag: any = L.ordered ? "ol" : "ul";
    out.push(<Tag key={out.length} className={`my-2 pl-5 space-y-1 ${L.ordered ? "list-decimal" : "list-disc"} marker:text-[var(--sindoor)]`}>{L.items.map((t, i) => <li key={i}>{inline(t)}</li>)}</Tag>);
  };
  lines.forEach((raw) => {
    const line = raw.trimEnd();
    const b = line.match(/^\s*[-*•]\s+(.*)$/); const n = line.match(/^\s*\d+[.)]\s+(.*)$/); const h = line.match(/^#{1,4}\s+(.*)$/);
    if (b) { if (!list || list.ordered) { flush(); list = { ordered: false, items: [] }; } list.items.push(b[1]); }
    else if (n) { if (!list || !list.ordered) { flush(); list = { ordered: true, items: [] }; } list.items.push(n[1]); }
    else { flush(); if (h) out.push(<p key={out.length} className="mt-3 mb-1 font-semibold">{inline(h[1])}</p>); else if (line.trim()) out.push(<p key={out.length} className="my-1.5">{inline(line)}</p>); }
  });
  flush();
  return <div className="leading-relaxed">{out}</div>;
}

/* ------------------------------------------------------------------ */
/* Visual blocks                                                        */
/* ------------------------------------------------------------------ */

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 100},${28 - (v / max) * 24}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" className="w-24 h-8 overflow-visible" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--neelam)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {data.length > 0 && <circle cx="100" cy={28 - (data[data.length - 1] / max) * 24} r="2.2" fill="var(--sindoor)" />}
    </svg>
  );
}

function ChartBlock({ b }: { b: any }) {
  const money = b.metric === "value";
  const fmt = (v: number) => (money ? inr(v) : String(v));
  const total = (b.data || []).reduce((s: number, d: any) => s + d.value, 0);
  return (
    <div className="agent-block">
      <div className="flex items-baseline justify-between mb-3">
        <h4 className="font-semibold text-sm">{b.title}</h4>
        <span className="agent-label">{b.dimension} · {money ? "value" : "count"}</span>
      </div>
      {b.chart === "metric" ? (
        <div className="py-2"><div className="text-4xl font-semibold tracking-tight">{fmt(total)}</div></div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            {b.chart === "pie" ? (
              <PieChart>
                <Pie data={b.data} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="82%" paddingAngle={2} stroke="none">
                  {b.data.map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 10, border: "1px solid var(--kora-line)", fontSize: 12 }} />
              </PieChart>
            ) : b.chart === "line" ? (
              <LineChart data={b.data} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--kora-line)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8c8478" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#8c8478" }} axisLine={false} tickLine={false} tickFormatter={(v) => (money ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 10, border: "1px solid var(--kora-line)", fontSize: 12 }} />
                <Line type="monotone" dataKey="value" stroke="#2747d8" strokeWidth={2.4} dot={{ r: 3, fill: "#ea5420", strokeWidth: 0 }} />
              </LineChart>
            ) : (
              <BarChart data={b.data} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--kora-line)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8c8478" }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: "#8c8478" }} axisLine={false} tickLine={false} tickFormatter={(v) => (money ? `${Math.round(v / 1000)}k` : v)} />
                <Tooltip cursor={{ fill: "rgba(39,71,216,0.06)" }} formatter={(v: any) => fmt(Number(v))} contentStyle={{ borderRadius: 10, border: "1px solid var(--kora-line)", fontSize: 12 }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>{b.data.map((_: any, i: number) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      {b.chart === "pie" && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
          {b.data.map((d: any, i: number) => (
            <span key={i} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
              <i className="w-2 h-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />{d.name} <b className="text-gray-900">{fmt(d.value)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Compact popover picker used in the stats strip. Values can be long free text and there can be dozens,
 * so the button stays short (truncated) and the list is a fixed-size, scrollable, searchable popover.
 * `anyLabel` adds an "any" choice with the empty value, for filters.
 */
function Picker({ entries, value, onChange, label, dot, small, anyLabel, align = "right" }: {
  entries: Array<[string, number?]>; value: string; onChange: (v: string) => void; label: string;
  dot?: (v: string) => string | undefined; small?: boolean; anyLabel?: string; align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const all: Array<[string, number?]> = anyLabel ? [["", undefined], ...entries] : entries;
  const shown = all.filter(([v]) => !q.trim() || v.toLowerCase().includes(q.trim().toLowerCase()));
  const text = (v: string) => (v === "" && anyLabel ? anyLabel : v);
  return (
    <div ref={ref} className="relative min-w-0">
      <button type="button" onClick={() => { setOpen((o) => !o); setQ(""); }} className={`agent-select ${small ? "agent-select--sm" : ""} ${small && value ? "agent-select--set" : ""}`} aria-haspopup="listbox" aria-expanded={open} aria-label={label} title={text(value)}>
        {dot && value && <i style={{ background: dot(value) || "#8c8478" }} aria-hidden />}
        <span className={`truncate ${small ? "max-w-[7.5rem]" : "max-w-[9.5rem]"}`}>{text(value)}</span>
        <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? "-rotate-90" : "rotate-90"}`} aria-hidden />
      </button>
      {open && (
        <div className={`agent-picker ${align === "left" ? "agent-picker--left" : ""}`} role="listbox" aria-label={label}>
          {entries.length > 8 && <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${entries.length}…`} className="agent-picker__search" />}
          <div className="agent-picker__list">
            {shown.map(([v, n]) => (
              <button key={v || "__any"} type="button" role="option" aria-selected={v === value} title={text(v)}
                onClick={() => { onChange(v); setOpen(false); }}
                className={`agent-picker__item ${v === value ? "agent-picker__item--on" : ""}`}>
                {dot && <i style={{ background: v ? dot(v) || "#8c8478" : "transparent", border: v ? 0 : "1px solid var(--color-gray-300)" }} aria-hidden />}
                <span className="truncate flex-1 text-left">{text(v)}</span>
                {n != null && <b>{n}</b>}
              </button>
            ))}
            {shown.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">No match for “{q}”.</p>}
          </div>
        </div>
      )}
    </div>
  );
}


function StatusPill({ s }: { s: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-gray-200 bg-white/60">
      <i className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_DOT[s] || "#8c8478" }} />{s}
    </span>
  );
}

function QuotesBlock({ b, onOpen }: { b: any; onOpen: (qn: string) => void }) {
  return (
    <div className="agent-block !p-0 overflow-hidden">
      <div className="px-4 pt-3 pb-2 agent-label">{b.title} · {b.quotes.length}</div>
      <div className="divide-y divide-gray-100">
        {b.quotes.map((q: any) => (
          <button key={q.qn} onClick={() => onOpen(q.qn)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors group">
            <span className="font-mono text-xs text-gray-500 w-28 shrink-0">{q.qn}</span>
            <span className="flex-1 min-w-0 truncate text-sm font-medium">{q.client || "—"}</span>
            {q.temperature && <span className={`agent-temp agent-temp--${q.temperature}`}>{q.temperature}</span>}
            <StatusPill s={q.status} />
            <span className="text-sm font-semibold w-24 text-right tabular-nums">{q.value ? inr(q.value) : "—"}</span>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}

function EmailsBlock({ b, onOpen }: { b: any; onOpen: () => void }) {
  return (
    <div className="agent-block !p-0 overflow-hidden">
      <div className="px-4 pt-3 pb-2 agent-label">{b.title} · {b.emails.length}</div>
      <div className="divide-y divide-gray-100">
        {b.emails.map((e: any) => (
          <button key={e.id} onClick={onOpen} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2">
              {e.unread && <i className="w-1.5 h-1.5 rounded-full bg-[var(--sindoor)]" />}
              <span className="text-sm font-medium truncate flex-1">{e.from}</span>
              <span className="text-[11px] text-gray-400">{ago(e.at)}</span>
            </div>
            <div className="text-xs text-gray-700 truncate">{e.subject}</div>
            <div className="text-xs text-gray-400 truncate">{e.snippet}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TableBlock({ b }: { b: any }) {
  const cols = Object.keys(b.rows[0] || {});
  return (
    <div className="agent-block !p-0 overflow-x-auto">
      <div className="px-4 pt-3 pb-2 agent-label">{b.title} · {b.rows.length}</div>
      <table className="w-full text-sm">
        <thead><tr>{cols.map((c) => <th key={c} className="text-left px-4 py-1.5 agent-label font-normal">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">
          {b.rows.map((r: any, i: number) => <tr key={i}>{cols.map((c) => <td key={c} className="px-4 py-1.5 tabular-nums">{r[c]}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

/** A file the AI prepared. Built in the browser on click; the rows are not kept in chat history. */
function ExportBlock({ b }: { b: any }) {
  const [saving, setSaving] = useState(false);
  const rows: any[] = b.rows || [];
  const download = async () => {
    setSaving(true);
    try {
      if (b.format === "xlsx") {
        // @ts-ignore - xlsx ships no types here
        const XLSX: any = await import("xlsx");
        const ws = XLSX.utils.json_to_sheet(rows, { header: b.columns });
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Quotes");
        XLSX.writeFile(wb, b.filename);
        return;
      }
      const esc = (v: any) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const text = b.format === "json" ? JSON.stringify(rows, null, 2) : [b.columns.join(","), ...rows.map((r) => b.columns.map((c: string) => esc(r[c])).join(","))].join("\n");
      const blob = new Blob([b.format === "csv" ? "\ufeff" + text : text], { type: b.format === "json" ? "application/json" : "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = b.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } finally { setSaving(false); }
  };
  return (
    <div className="agent-block" data-export={b.filename}>
      <div className="flex flex-wrap items-center gap-3">
        <FileSpreadsheet className="w-5 h-5 text-[#0e6b57]" />
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{b.filename}</div>
          <div className="agent-label">{b.format} · {rows.length} row{rows.length === 1 ? "" : "s"} · {b.columns.length} columns</div>
        </div>
        {rows.length ? (
          <button type="button" onClick={download} disabled={saving} className="agent-btn agent-btn--primary ml-auto">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}Download</button>
        ) : <span className="text-xs text-gray-500 ml-auto">{b.expired ? "Ask again to download" : "Nothing matched"}</span>}
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs">
            <thead><tr>{b.columns.map((c: string) => <th key={c} className="text-left px-2 py-1 agent-label font-normal">{c}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 3).map((r, i) => <tr key={i} className="border-t border-gray-100">{b.columns.map((c: string) => <td key={c} className="px-2 py-1 whitespace-nowrap">{String(r[c] ?? "")}</td>)}</tr>)}</tbody>
          </table>
          {rows.length > 3 && <p className="text-[11px] text-gray-500 mt-1">…and {rows.length - 3} more in the file.</p>}
        </div>
      )}
    </div>
  );
}

function ActionCard({ a, onConfirm, onDismiss }: { a: Action; onConfirm: () => void; onDismiss: () => void }) {
  const st = a.state || "pending";
  return (
    <div className={`agent-action agent-action--${st}`}>
      <div className="flex items-center gap-2 mb-2">
        <PenLine className="w-4 h-4 text-[var(--sindoor)]" />
        <span className="font-semibold text-sm">{a.title}</span>
        <span className="agent-label ml-auto">{st === "pending" ? "needs your OK" : st}</span>
      </div>
      <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1 text-sm">
        {a.details.map(([k, v], i) => (<React.Fragment key={i}><dt className="agent-label pt-0.5">{k}</dt><dd className="break-words">{String(v)}</dd></React.Fragment>))}
      </dl>
      {a.preview && <pre className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200 text-[13px] whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-auto">{a.preview}</pre>}
      {(st === "pending" || st === "running") && (
        <div className="flex gap-2 mt-3">
          <button onClick={onConfirm} disabled={st === "running"} className="agent-btn agent-btn--primary">
            {st === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {a.kind === "send_email" ? "Confirm & send" : "Confirm"}
          </button>
          <button onClick={onDismiss} disabled={st === "running"} className="agent-btn"><X className="w-3.5 h-3.5" />Dismiss</button>
        </div>
      )}
      {a.result && <p className={`mt-3 text-sm font-medium ${st === "failed" ? "text-[var(--danger,#a3192b)]" : "text-[var(--success,#0e6b57)]"}`}>{a.result}</p>}
      {a.secret && <SecretRow value={a.secret} />}
    </div>
  );
}

function SecretRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="agent-secret">
      <span className="agent-label">Password</span>
      <code>{value}</code>
      <button type="button" className="agent-btn" onClick={() => { navigator.clipboard?.writeText(value).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function StepChips({ steps }: { steps: Step[] }) {
  if (!steps.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {steps.map((s) => (
        <span key={s.id} title={s.note || ""} className={`agent-step ${s.status === "running" ? "agent-step--live" : ""} ${s.status === "error" ? "agent-step--err" : ""}`}>
          {s.status === "running" ? <Loader2 className="w-3 h-3 animate-spin" /> : s.status === "error" ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
          {s.label}{s.write ? " ✎" : ""}{s.ms != null && s.status !== "running" ? <em>{s.ms < 1000 ? `${s.ms}ms` : `${(s.ms / 1000).toFixed(1)}s`}</em> : null}
        </span>
      ))}
    </div>
  );
}

/** Reveals the answer word by word. Older messages render instantly. */
function Typed({ text, animate, onTick }: { text: string; animate: boolean; onTick: () => void }) {
  const [n, setN] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) { setN(text.length); return; }
    let i = 0;
    const id = setInterval(() => {
      i += 6; setN(Math.min(i, text.length)); onTick();
      if (i >= text.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [text, animate]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Markdown text={text.slice(0, n)} />;
}

/* ------------------------------------------------------------------ */
/* Main component                                                       */
/* ------------------------------------------------------------------ */

export default function AgentHome({ userEmail, onOpenQuote, onNewQuote, onNavigate, onChanged, docsLink }: AgentHomeProps) {
  const [ov, setOv] = useState<Overview | null>(null);
  const [ovError, setOvError] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [copied, setCopied] = useState("");
  const [statusPick, setStatusPick] = useState("");
  const [logModule, setLogModule] = useState("");
  const STATUS_MODE = "__status";
  const [statMode, setStatMode] = useState(STATUS_MODE);
  const [logFilters, setLogFilters] = useState<Record<string, string>>({});
  const [logBy, setLogBy] = useState("");
  const [logPeriod, setLogPeriod] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const storeKey = `cma_agent_chat_${userEmail}`;
  const hydrated = useRef(false);

  // Show the last known numbers instantly, then refresh them in the background.
  const ovKey = `cma_overview_${userEmail}`;
  const loadOverview = useCallback(async () => {
    try {
      const res = await agentFetch("/api/agent/overview");
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const fresh = await res.json();
      setOv(fresh); setOvError("");
      try { localStorage.setItem(ovKey, JSON.stringify(fresh)); } catch { /* storage full or blocked */ }
    } catch (e: any) { setOvError(e.message || "Could not load"); }
  }, [ovKey]);

  useEffect(() => {
    try { const cached = localStorage.getItem(ovKey); if (cached) setOv(JSON.parse(cached)); } catch { /* ignore */ }
    loadOverview();
  }, [loadOverview, ovKey]);

  // conversation memory (per user, this browser)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storeKey);
      if (raw) setMsgs((JSON.parse(raw) as Msg[]).map((m) => ({ ...m, live: false, typing: false })));
    } catch { /* ignore */ }
    hydrated.current = true;
  }, [storeKey]);
  useEffect(() => {
    if (!hydrated.current) return;
    // generated passwords are shown once on their card and never stored
    const safe = msgs.filter((m) => !m.live).slice(-40).map((m) => ({
      ...m,
      actions: (m.actions || []).map(({ secret, ...rest }) => rest),
      // exported rows can be large and are a snapshot: keep the card, drop the data
      blocks: (m.blocks || []).map((b) => (b.type === "export" ? { ...b, rows: [], expired: true } : b)),
    }));
    try { localStorage.setItem(storeKey, JSON.stringify(safe)); } catch { /* ignore */ }
  }, [msgs, storeKey]);

  const scrollDown = useCallback(() => { endRef.current?.scrollIntoView({ block: "end" }); }, []);
  useEffect(() => { scrollDown(); }, [msgs.length, scrollDown]);

  // ⌘K / Ctrl+K focuses the command bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // stream events must land on the message they belong to, even if other messages were appended meanwhile
  const patchMsg = (id: string, fn: (m: Msg) => Msg) => setMsgs((all) => all.map((m) => (m.id === id ? fn(m) : m)));

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setInput(""); setBusy(true);
    const history = [...msgs, { id: uid(), role: "user" as const, text: content }];
    const aiId = uid();
    const patchLast = (fn: (m: Msg) => Msg) => patchMsg(aiId, fn);
    setMsgs([...history, { id: aiId, role: "ai", text: "", steps: [], blocks: [], actions: [], live: true }]);
    try {
      abortRef.current = new AbortController();
      const res = await agentFetch("/api/agent/chat", {
        method: "POST", signal: abortRef.current.signal,
        body: JSON.stringify({ messages: history.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })).filter((m) => m.content) }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.t === "step") patchLast((m) => {
            const steps = [...(m.steps || [])]; const i = steps.findIndex((s) => s.id === ev.id);
            const next: Step = { id: ev.id, name: ev.name, label: ev.label, write: ev.write, status: ev.status, ms: ev.ms, note: ev.note };
            if (i >= 0) steps[i] = next; else steps.push(next);
            return { ...m, steps };
          });
          else if (ev.t === "block") patchLast((m) => ({ ...m, blocks: [...(m.blocks || []), ev.block] }));
          else if (ev.t === "action") patchLast((m) => ({ ...m, actions: [...(m.actions || []), { ...ev.action, state: "pending" }] }));
          else if (ev.t === "message") patchLast((m) => ({ ...m, text: ev.content, typing: true }));
          else if (ev.t === "error") patchLast((m) => ({ ...m, error: ev.error }));
        }
      }
    } catch (e: any) {
      if (e?.name === "AbortError") patchLast((m) => ({ ...m, text: m.text || "Stopped.", steps: (m.steps || []).map((st) => (st.status === "running" ? { ...st, status: "error", note: "stopped" } : st)) }));
      else patchLast((m) => ({ ...m, error: e.message || "Request failed" }));
    } finally {
      abortRef.current = null;
      patchLast((m) => ({ ...m, live: false }));
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [msgs, busy]);

  const runAction = async (msgId: string, actId: string, confirm: boolean) => {
    const setAct = (patch: Partial<Action>) => setMsgs((all) => all.map((m) => m.id !== msgId ? m : { ...m, actions: (m.actions || []).map((a) => a.id === actId ? { ...a, ...patch } : a) }));
    const action = msgs.find((m) => m.id === msgId)?.actions?.find((a) => a.id === actId);
    if (!action) return;
    if (!confirm) {
      setAct({ state: "dismissed", result: "Dismissed. Nothing was changed." });
      // tell the model, so asking again later prepares a fresh action instead of "it is already prepared"
      setMsgs((all) => [...all, { id: uid(), role: "ai", text: `Dismissed: "${action.title}: ${action.summary}" was not applied.` }]);
      return;
    }
    setAct({ state: "running" });
    try {
      const res = await agentFetch("/api/agent/execute", { method: "POST", body: JSON.stringify({ kind: action.kind, payload: action.payload }) });
      const out = await res.json();
      if (!res.ok || out.error) throw new Error(out.error || "Action failed");
      setAct({ state: "done", result: out.message, secret: out.secret });
      setMsgs((all) => [...all, { id: uid(), role: "ai", text: `Done: ${out.message}` }]);
      onChanged(out.refresh || []);
      loadOverview();
    } catch (e: any) {
      setAct({ state: "failed", result: e.message });
    }
  };

  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { setListening(false); return; }
    const rec = new SR(); rec.lang = "en-IN"; rec.interimResults = false;
    rec.onresult = (e: any) => setInput((v) => `${v} ${e.results[0][0].transcript}`.trim());
    rec.onend = () => setListening(false);
    setListening(true); rec.start();
  };
  const voiceSupported = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const hasChat = msgs.length > 0;
  const statusEntries = useMemo(() => Object.entries(ov?.stats.byStatus || {}).sort((a, b) => b[1] - a[1]), [ov]);
  const share = ov && ov.stats.total ? Math.round((ov.stats.mine / ov.stats.total) * 100) : 0;
  const name = ov?.user.name || userEmail.split("@")[0];
  const topChips = (ov?.chips || []).slice(0, 3);
  const pickedStatus = statusPick && ov?.stats.byStatus[statusPick] != null ? statusPick : "";
  const pickedCount = pickedStatus ? ov?.stats.byStatus[pickedStatus] || 0 : 0;
  const pickedShare = ov && ov.stats.total ? Math.round((pickedCount / ov.stats.total) * 100) : 0;

  // ---- Logs stat: module, then one filter per dropdown in that module, who logged it, and a period ----
  const PERIODS: Array<[string, number]> = [["Last 7 days", 7], ["Last 30 days", 30], ["Last 90 days", 90]];
  const logMods = ov?.logs || [];
  const mod = logMods.find((l) => l.module === logModule) || logMods[0];
  // (statMode decides whether the box shows quote status or one of the log modules)
  const inPeriod = (at: string | null) => {
    const days = PERIODS.find(([l]) => l === logPeriod)?.[1];
    return !days || (!!at && Date.now() - new Date(at).getTime() <= days * 86400000);
  };
  const matches = (e: any, skip?: string) =>
    inPeriod(e.at) && (skip === "__by" || !logBy || e.by === logBy) &&
    Object.entries(logFilters).every(([k, v]) => k === skip || !v || e.v[k] === v);
  const logRows = (mod?.entries || []).filter((e) => matches(e));
  const logQuotes = new Set(logRows.map((e) => e.qn)).size;
  const countFor = (field: string, value: string) => (mod?.entries || []).filter((e) => matches(e, field) && e.v[field] === value).length;
  const people = Array.from(new Set((mod?.entries || []).map((e) => e.by).filter(Boolean)));
  const askAboutLogs = () => {
    if (!mod) return;
    const parts = [...Object.entries(logFilters).filter(([, v]) => v).map(([k, v]) => `${mod.fields.find((f) => f.name === k)?.label || k} = ${v}`), ...(logBy ? [`logged by ${logBy}`] : []), ...(logPeriod ? [logPeriod.toLowerCase()] : [])];
    send(`Show the quotes with ${mod.module} entries${parts.length ? ` where ${parts.join(", ")}` : ""}, and summarise what they say.`);
  };

  // the drop-up under the command bar: the remaining live chips, then the standing question list
  const suggestions: Suggestion[] = useMemo(() => {
    const live: Suggestion[] = (ov?.chips || []).slice(3).map((c) => ({ text: c.label, icon: c.icon, prompt: c.prompt }));
    const all = [...live, ...MORE_QUESTIONS];
    const q = input.trim().toLowerCase();
    return (q ? all.filter((x) => x.text.toLowerCase().includes(q)) : all).slice(0, 12);
  }, [ov, input]);
  const showList = open && !busy && suggestions.length > 0;

  const pick = (sg: Suggestion) => {
    setOpen(false); setActive(-1);
    if (sg.fill) { setInput(sg.text); requestAnimationFrame(() => inputRef.current?.focus()); } else send(sg.prompt || sg.text);
  };

  return (
    <div className="agent-home relative flex flex-col">
      <div className="agent-aurora" aria-hidden />

      {/* ---- header ---- */}
      <div className="relative flex items-center justify-end gap-3 mb-2 min-h-[20px]">{docsLink}</div>

      {/* ---- stats ---- */}
      <section className="agent-stats relative" aria-label="Pipeline statistics">
        <div className="agent-stat">
          <span className="agent-label">Total quotes</span>
          <div className="flex items-end justify-between gap-2">
            <span className="agent-num">{ov ? ov.stats.total : "–"}</span>
            {ov && <Sparkline data={ov.stats.weeks} />}
          </div>
          <span className="text-xs text-gray-500">{ov ? `${inr(ov.stats.totalValue)} in pipeline` : " "}</span>
        </div>
        <div className="agent-stat agent-stat--logs" aria-label="Status and logs">
          <span className="agent-label">Status &amp; logs</span>
          {!ov ? <span className="agent-num">–</span> : (
            <>
              <div className="flex items-end justify-between gap-2">
                <button onClick={statMode === STATUS_MODE ? () => pickedStatus && send(`Show my ${pickedStatus} quotes`) : askAboutLogs} className="agent-num text-left" title="Ask about these">
                  {statMode === STATUS_MODE ? (pickedStatus ? pickedCount : ov.stats.total) : logRows.length}
                </button>
                <Picker label="Status or log" entries={[["Quote status", ov.stats.total], ...logMods.map((l) => [l.module, l.entries.length] as [string, number])]}
                  value={statMode === STATUS_MODE ? "Quote status" : mod?.module || "Quote status"}
                  onChange={(v) => { setStatMode(v === "Quote status" ? STATUS_MODE : v); setLogModule(v === "Quote status" ? "" : v); setLogFilters({}); setLogBy(""); }} />
              </div>
              {statMode === STATUS_MODE ? (
                <>
                  <div className="flex flex-wrap gap-1.5" aria-label="Status filter">
                    <Picker small align="left" label="Status" anyLabel="All statuses" dot={(v) => STATUS_DOT[v]} entries={statusEntries} value={pickedStatus} onChange={setStatusPick} />
                  </div>
                  <span className="text-xs text-gray-500">
                    {statusEntries.length === 0 ? "No quotes yet" : pickedStatus ? `${pickedShare}% of quotes · ${inr(ov.stats.valueByStatus?.[pickedStatus] || 0)}` : `${statusEntries.length} statuses · ${inr(ov.stats.totalValue)}`}
                  </span>
                  {logMods.length === 0 && <button onClick={() => onNavigate("settings:blueprint")} className="text-[11px] font-semibold text-[var(--neelam)] hover:underline text-left">Add Status, Action or Remark logs →</button>}
                </>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5" aria-label="Log filters">
                    {mod!.fields.map((f) => (
                      <Picker key={f.name} small align="left" label={`${f.label} filter`} anyLabel={`${f.label}: any`} dot={f.name === "status" ? (v) => STATUS_DOT[v] : undefined}
                        entries={f.options.map((o) => [o, countFor(f.name, o)])} value={logFilters[f.name] || ""}
                        onChange={(v) => setLogFilters({ ...logFilters, [f.name]: v })} />
                    ))}
                    {people.length > 1 && <Picker small align="left" label="Logged by" anyLabel="Anyone" entries={people.map((p) => [p, (mod?.entries || []).filter((e) => matches(e, "__by") && e.by === p).length])} value={logBy} onChange={setLogBy} />}
                    <Picker small align="left" label="Period" anyLabel="All time" entries={PERIODS.map(([l]) => [l])} value={logPeriod} onChange={setLogPeriod} />
                  </div>
                  <span className="text-xs text-gray-500">{logRows.length ? `${logQuotes} quote${logQuotes === 1 ? "" : "s"} · last ${ago(logRows[0].at || undefined)}` : "No entries match"}</span>
                </>
              )}
            </>
          )}
        </div>
        <div className="agent-stat">
          <span className="agent-label">My contribution</span>
          <span className="agent-num">{ov ? ov.stats.mine : "–"}</span>
          <div className="h-1 rounded-full bg-gray-200 overflow-hidden"><div className="h-full rounded-full bg-[var(--neelam)] transition-all duration-700" style={{ width: `${share}%` }} /></div>
          <span className="text-xs text-gray-500">{ov ? `${inr(ov.stats.myValue)} · ${share}% of all quotes` : " "}</span>
        </div>
        <div className="agent-stat">
          <span className="agent-label">Pulse</span>
          <div className="flex items-baseline gap-4">
            <button onClick={() => onNavigate("inbox")} className="text-left"><span className="agent-num !text-2xl">{ov?.inbox.unread ?? "–"}</span><span className="block text-[11px] text-gray-500">unread</span></button>
            <button onClick={() => send("Which clients are waiting on a reply?")} className="text-left"><span className="agent-num !text-2xl text-[var(--sindoor)]">{ov?.inbox.waiting ?? "–"}</span><span className="block text-[11px] text-gray-500">waiting</span></button>
          </div>
          {ov && (
            <div className="flex h-1 rounded-full overflow-hidden bg-gray-200" title={`Hot ${ov.followups.hot} · Warm ${ov.followups.warm} · Cold ${ov.followups.cold}`}>
              {(["hot", "warm", "cold"] as const).map((k, i) => ov.followups[k] > 0 && <div key={k} style={{ flex: ov.followups[k], background: ["#ea5420", "#e5a03a", "#2747d8"][i] }} />)}
            </div>
          )}
        </div>
      </section>
      {ovError && <p className="text-xs text-[var(--danger,#a3192b)] mt-2">Could not load stats: {ovError}</p>}

      {/* ---- latest quotes, then create ---- */}
      <section className="relative mt-5" aria-label="Latest quotes">
        <div className="flex items-center mb-2">
          <span className="agent-label">Latest quotes</span>
          <button onClick={() => onNavigate("pipeline")} className="ml-auto text-xs font-semibold text-[var(--neelam)] hover:underline">View all →</button>
        </div>
        <div className="agent-latest">
          {(ov?.latest || []).map((q) => (
            <button key={q.qn} onClick={() => onOpenQuote(q.qn)} className="agent-quote group">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-gray-500 truncate min-w-0">{q.qn}</span>
                <StatusPill s={q.status} />
              </div>
              <div className="mt-1.5 text-[15px] font-semibold truncate">{q.client || "Untitled client"}</div>
              <div className="flex items-end justify-between mt-2 gap-2">
                <span className="text-lg font-semibold tabular-nums">{q.value ? inr(q.value) : "—"}</span>
                <span className="text-[11px] text-gray-400 whitespace-nowrap">{q.items} item{q.items === 1 ? "" : "s"} · {ago(q.date)}</span>
              </div>
            </button>
          ))}
          {ov && ov.latest.length === 0 && <p className="text-sm text-gray-400 p-4">No quotes yet. Create your first one below.</p>}
        </div>
        <button onClick={onNewQuote} className="agent-create mt-3"><Plus className="w-4 h-4" />Create quote</button>
      </section>

      {/* ---- the conversation: the page itself ---- */}
      <section className="relative flex flex-col mt-2" aria-label="Bloomgard AI">
        {!hasChat ? (
          <div className="flex flex-col items-center text-center pt-10 pb-6 agent-rise">
            <h2 className="agent-hello">{greeting()}, {name}.</h2>
            <p className="text-sm text-gray-500 mt-2">Ask anything about your quotes, email and catalogue, or tell me what to do.</p>
            {ov && (
              <div className="flex flex-wrap justify-center gap-2 mt-5" aria-label="Briefing">
                {ov.inbox.unread > 0 && <button onClick={() => send("Summarize my unread emails and tell me which ones need a reply first.")} className="agent-brief"><Mail className="w-3.5 h-3.5" /><b>{ov.inbox.unread}</b> unread email{ov.inbox.unread === 1 ? "" : "s"}</button>}
                {ov.inbox.waiting > 0 && <button onClick={() => send("Which clients are waiting on a reply from us? Draft the replies for me to confirm.")} className="agent-brief"><CornerUpLeft className="w-3.5 h-3.5" /><b>{ov.inbox.waiting}</b> waiting on you</button>}
                {ov.followups.hot > 0 && <button onClick={() => send("Show my hot follow-ups and what each client needs.")} className="agent-brief"><Bell className="w-3.5 h-3.5" /><b>{ov.followups.hot}</b> hot</button>}
                {ov.followups.cold > 0 && <button onClick={() => send("List my cold quotes and draft a short follow-up for the most valuable one.")} className="agent-brief"><Bell className="w-3.5 h-3.5" /><b>{ov.followups.cold}</b> going cold</button>}
                <button onClick={() => send("Give me a briefing: what changed in the last 7 days across quotes, emails and follow-ups?")} className="agent-brief"><Sparkles className="w-3.5 h-3.5" />Brief me</button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 pt-5 pb-4 space-y-6" aria-live="polite">
            {msgs.map((m) => m.role === "user" ? (
              <div key={m.id} className="flex justify-end agent-rise"><div className="agent-user">{m.text}</div></div>
            ) : (
              <div key={m.id} className="flex gap-3 agent-rise group/msg">
                <div className="agent-orb agent-orb--sm shrink-0 mt-1" aria-hidden />
                <div className="min-w-0 flex-1 text-[15px]">
                  <StepChips steps={m.steps || []} />
                  {m.live && !m.text && !m.error && (m.steps || []).every((st) => st.status !== "running") && <span className="agent-dots" aria-label="thinking"><i /><i /><i /></span>}
                  {(m.blocks || []).map((b, i) => (
                    <div key={i} className="mb-3">
                      {b.type === "chart" && <ChartBlock b={b} />}
                      {b.type === "quotes" && <QuotesBlock b={b} onOpen={onOpenQuote} />}
                      {b.type === "emails" && <EmailsBlock b={b} onOpen={() => onNavigate("inbox")} />}
                      {b.type === "table" && <TableBlock b={b} />}
                      {b.type === "export" && <ExportBlock b={b} />}
                    </div>
                  ))}
                  {m.text && <Typed text={m.text} animate={!!m.typing} onTick={scrollDown} />}
                  {(m.actions || []).map((a) => (
                    <div key={a.id} className="mt-3"><ActionCard a={a} onConfirm={() => runAction(m.id, a.id, true)} onDismiss={() => runAction(m.id, a.id, false)} /></div>
                  ))}
                  {m.error && <p className="text-sm text-[var(--danger,#a3192b)] mt-2">⚠ {m.error}</p>}
                  {m.text && !m.live && (
                    <button
                      onClick={() => { navigator.clipboard?.writeText(m.text).catch(() => {}); setCopied(m.id); setTimeout(() => setCopied(""), 1400); }}
                      className="agent-copy opacity-0 group-hover/msg:opacity-100 focus:opacity-100" aria-label="Copy answer"
                    >
                      {copied === m.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}{copied === m.id ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}

        {/* ---- dock: three chips, the command bar, and the drop-up of more questions ---- */}
        <div className="agent-dock">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="flex flex-wrap gap-2" aria-label="Suggestions">
              {topChips.map((c) => {
                const Icon = CHIP_ICONS[c.icon] || Sparkles;
                return <button key={c.label} onClick={() => (c.nav ? onNavigate(c.nav) : send(c.prompt))} disabled={busy} className={`agent-chip ${c.nav ? "agent-chip--todo" : ""}`}><Icon className="w-3.5 h-3.5" />{c.label}</button>;
              })}
            </div>
            {hasChat && (
              <button onClick={() => { abortRef.current?.abort(); setMsgs([]); localStorage.removeItem(storeKey); inputRef.current?.focus(); }} className="agent-btn ml-auto shrink-0" title="Start a new conversation">
                <RotateCcw className="w-3.5 h-3.5" />New chat
              </button>
            )}
          </div>
          <form className="relative" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            {showList && (
              <div className="agent-drop" role="listbox" aria-label="More questions to ask">
                <div className="agent-label px-3 pt-2 pb-1">Try asking</div>
                {suggestions.map((sg, i) => {
                  const Icon = CHIP_ICONS[sg.icon] || Sparkles;
                  return (
                    <button
                      type="button" key={sg.text} role="option" aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => pick(sg)} onMouseEnter={() => setActive(i)}
                      className={`agent-drop__item ${i === active ? "agent-drop__item--on" : ""}`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{sg.text}{sg.fill ? "…" : ""}</span>
                      {sg.fill && <em>edit</em>}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="agent-input">
              <textarea
                ref={inputRef} value={input} rows={1} autoFocus
                onClick={() => setOpen(true)} onBlur={() => setOpen(false)}
                onChange={(e) => { setInput(e.target.value); setOpen(true); setActive(-1); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setOpen(false); return; }
                  if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setOpen(true); return; }
                  if (showList && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                    e.preventDefault();
                    setActive((a) => (e.key === "ArrowDown" ? (a + 1) % suggestions.length : (a - 1 + suggestions.length) % suggestions.length));
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (showList && active >= 0) pick(suggestions[active]); else { setOpen(false); send(input); }
                  }
                }}
                placeholder="Ask anything, or tell me what to do…"
                aria-label="Message Bloomgard AI"
              />
              {voiceSupported && (
                <button type="button" onClick={toggleVoice} className={`agent-icon-btn ${listening ? "agent-icon-btn--on" : ""}`} aria-label="Dictate"><Mic className="w-4 h-4" /></button>
              )}
              <kbd className="hidden md:inline-flex agent-kbd">⌘K</kbd>
              {busy ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="agent-send agent-send--stop" aria-label="Stop"><Square className="w-3.5 h-3.5 fill-current" /></button>
              ) : (
                <button type="submit" disabled={!input.trim()} className="agent-send" aria-label="Send"><ArrowUp className="w-4 h-4" /></button>
              )}
            </div>
            <p className="agent-hint" aria-hidden>
              <span>Enter to send</span><span>Shift + Enter for a new line</span><span>⌘K to focus</span><span>Changes always wait for your OK</span>
            </p>
          </form>
        </div>
      </section>
    </div>
  );
}
