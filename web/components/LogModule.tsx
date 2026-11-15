"use client";
import React, { useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { Module } from "./FieldConfigurator";

export type LogEntry = Record<string, any> & { _at?: string; _by?: string };

const FILTERABLE = new Set(["dropdown", "master_status"]);
const optionsOf = (f: any) => String(f.options || "").split(",").map((o: string) => o.trim()).filter(Boolean);

/**
 * One log module inside the quote viewer: the same table look as the status history, newest first,
 * with a filter per dropdown field and an inline row to add an entry.
 */
export default function LogModule({ section, entries, statuses, onAdd, readOnly }: {
  section: Module; entries: LogEntry[]; statuses: string[]; readOnly?: boolean;
  onAdd: (values: Record<string, any>) => Promise<void>;
}) {
  const fields = (section.fields || []).filter((f) => f.type !== "attachment" && f.type !== "calculated");
  const filterable = fields.filter((f) => FILTERABLE.has(f.type));
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rows = useMemo(() => [...(entries || [])].reverse().filter((e) =>
    Object.entries(filters).every(([k, v]) => !v || String(e?.[k] ?? "") === v)), [entries, filters]);

  const choices = (f: any) => {
    const configured = f.type === "master_status" ? (optionsOf(f).length ? optionsOf(f) : statuses) : optionsOf(f);
    const seen = (entries || []).map((e) => e?.[f.name]).filter(Boolean).map(String);
    return Array.from(new Set([...configured, ...seen]));
  };

  const submit = async () => {
    const values: Record<string, any> = {};
    fields.forEach((f) => { if (f.type !== "logged_in" && draft[f.name] != null && String(draft[f.name]).trim() !== "") values[f.name] = draft[f.name]; });
    if (Object.keys(values).length === 0) { setError("Fill in at least one field."); return; }
    setSaving(true); setError("");
    try { await onAdd(values); setDraft({}); setAdding(false); }
    catch (e: any) { setError(e.message || "Could not add the entry."); }
    finally { setSaving(false); }
  };

  return (
    <div className="mb-8" data-log-module={section.title}>
      <div className="flex flex-wrap items-center gap-2 mb-3 px-2">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{section.title}</h4>
        <span className="text-[10px] text-gray-400">{(entries || []).length} entr{(entries || []).length === 1 ? "y" : "ies"}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {filterable.map((f) => (
            <select key={f.name} aria-label={`Filter by ${f.label}`} value={filters[f.name] || ""} onChange={(e) => setFilters({ ...filters, [f.name]: e.target.value })} className="log-filter">
              <option value="">{f.label}: any</option>
              {choices(f).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ))}
          {!readOnly && !adding && (
            <button type="button" onClick={() => setAdding(true)} className="agent-btn"><Plus className="w-3.5 h-3.5" />Add entry</button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {adding && (
          <div className="log-add">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {fields.filter((f) => f.type !== "logged_in").map((f) => (
                <label key={f.name} className={`flex flex-col gap-1 ${f.type === "paragraph" ? "sm:col-span-2 lg:col-span-3" : ""}`}>
                  <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{f.label}</span>
                  {FILTERABLE.has(f.type) ? (
                    <select value={draft[f.name] || ""} onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })} className="log-input">
                      <option value="">Select…</option>
                      {choices(f).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === "paragraph" ? (
                    <textarea rows={2} value={draft[f.name] || ""} onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })} className="log-input" />
                  ) : (
                    <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} value={draft[f.name] || ""} onChange={(e) => setDraft({ ...draft, [f.name]: e.target.value })} className="log-input" />
                  )}
                </label>
              ))}
            </div>
            {fields.some((f) => f.type === "master_status") && <p className="text-[11px] text-gray-500 mt-2">Choosing a status here also changes the quote's status.</p>}
            {error && <p className="text-xs text-[var(--danger,#a3192b)] mt-2">{error}</p>}
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={submit} disabled={saving} className="agent-btn agent-btn--primary">{saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}Add to {section.title}</button>
              <button type="button" onClick={() => { setAdding(false); setDraft({}); setError(""); }} className="agent-btn"><X className="w-3.5 h-3.5" />Cancel</button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-2.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">Date & Time</th>
                <th className="px-4 py-2.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">By</th>
                {fields.map((f) => <th key={f.name} className="px-4 py-2.5 text-[9px] font-bold text-gray-500 uppercase tracking-widest whitespace-nowrap">{f.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length === 0 ? (
                <tr><td colSpan={fields.length + 2} className="px-4 py-4 text-[11px] text-gray-400 text-center">
                  {(entries || []).length === 0 ? "No entries yet." : "No entries match these filters."}
                </td></tr>
              ) : rows.map((e, i) => (
                <tr key={i} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 text-[11px] text-gray-600 whitespace-nowrap tabular-nums">{e._at ? new Date(e._at).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                  <td className="px-4 py-3 text-[11px] text-gray-700 whitespace-nowrap">{e._by || "—"}</td>
                  {fields.map((f) => (
                    <td key={f.name} className="px-4 py-3 text-[12px] text-gray-900 max-w-[28rem]">
                      {FILTERABLE.has(f.type) && e[f.name] ? <span className="log-pill">{String(e[f.name])}</span> : <span className="whitespace-pre-wrap break-words">{e[f.name] != null && e[f.name] !== "" ? String(e[f.name]) : "—"}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
