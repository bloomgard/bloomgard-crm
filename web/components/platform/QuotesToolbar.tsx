"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SlidersHorizontal, Columns3, X, GripVertical, ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import s from "./QuotesToolbar.module.css";

export type QuoteFilters = {
  statuses?: string[];
  created_by?: string;
  client_contains?: string;
  min_amount?: number;
  max_amount?: number;
  quiet_days?: number;
  date_from?: string;
  date_to?: string;
  search?: string;
};
export type ColumnDef = { id: string; label: string; group: string };

/** A small popover anchored under its button; closes on outside click or Escape. */
function Pop({ label, icon, count, children, wide }: { label: string; icon: ReactNode; count?: number; children: (close: () => void) => ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key, true); };
  }, [open]);
  return (
    <div className={s.popWrap} ref={ref}>
      <button type="button" className={`${s.btn} ${open || count ? s.btnOn : ""}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {icon}{label}{count ? <b>{count}</b> : null}
      </button>
      {open && <div className={`${s.pop} ${wide ? s.popWide : ""}`} role="dialog" aria-label={label}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

/** How many of the popover's filters are set (statuses and search have their own controls). */
export const advancedCount = (f: QuoteFilters) =>
  [f.created_by, f.client_contains, f.date_from || f.date_to, f.min_amount != null || f.max_amount != null, f.quiet_days != null].filter(Boolean).length;

export function FiltersPopover({ filters, onChange, owners, me }: {
  filters: QuoteFilters; onChange: (f: QuoteFilters) => void; owners: string[]; me: string;
}) {
  const set = (k: keyof QuoteFilters, v: any) => {
    const next: any = { ...filters };
    if (v === "" || v == null || (typeof v === "number" && !Number.isFinite(v))) delete next[k]; else next[k] = v;
    onChange(next);
  };
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(/[^0-9.]/g, "")));
  return (
    <Pop label="Filters" icon={<SlidersHorizontal aria-hidden />} count={advancedCount(filters)}>
      {() => (
        <div className={s.form}>
          <label><span>Owner</span>
            <select value={filters.created_by || ""} onChange={(e) => set("created_by", e.target.value)}>
              <option value="">Anyone</option>
              <option value="me">Me</option>
              {owners.filter((o) => o.toLowerCase() !== me.toLowerCase()).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label><span>Client name contains</span>
            <input value={filters.client_contains || ""} onChange={(e) => set("client_contains", e.target.value)} placeholder="e.g. Vardhman" />
          </label>
          <div className={s.pair}>
            <label><span>Quote date from</span><input type="date" value={filters.date_from || ""} onChange={(e) => set("date_from", e.target.value)} /></label>
            <label><span>to</span><input type="date" value={filters.date_to || ""} onChange={(e) => set("date_to", e.target.value)} /></label>
          </div>
          <div className={s.pair}>
            <label><span>Amount at least</span><input inputMode="decimal" value={filters.min_amount ?? ""} onChange={(e) => set("min_amount", num(e.target.value))} placeholder="0" /></label>
            <label><span>at most</span><input inputMode="decimal" value={filters.max_amount ?? ""} onChange={(e) => set("max_amount", num(e.target.value))} placeholder="Any" /></label>
          </div>
          <label><span>No contact for at least</span>
            <select value={filters.quiet_days ?? ""} onChange={(e) => set("quiet_days", e.target.value === "" ? undefined : Number(e.target.value))}>
              <option value="">Any time</option>
              {[3, 7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </label>
          <div className={s.formFoot}>
            <button type="button" className={s.linkBtn} disabled={!advancedCount(filters)} onClick={() => onChange({ statuses: filters.statuses, search: filters.search })}>Clear these filters</button>
          </div>
        </div>
      )}
    </Pop>
  );
}

/**
 * Choose which columns the Quotes table shows and in what order: tick to show, drag (or use the
 * arrows) to reorder. Every field of the quote form is available, grouped by module.
 */
export function ColumnsPopover({ all, value, onChange, onReset }: {
  all: ColumnDef[]; value: string[]; onChange: (ids: string[]) => void; onReset: () => void;
}) {
  const [dragId, setDragId] = useState("");
  const [overId, setOverId] = useState("");
  const [q, setQ] = useState("");
  const byId = new Map(all.map((c) => [c.id, c]));
  const shown = value.filter((id) => byId.has(id));
  const move = (i: number, by: number) => { const n = [...shown]; const [x] = n.splice(i, 1); n.splice(i + by, 0, x); onChange(n); };
  const hidden = all.filter((c) => !shown.includes(c.id) && (!q || `${c.label} ${c.group}`.toLowerCase().includes(q.toLowerCase())));
  const groups = [...new Set(hidden.map((c) => c.group))];
  return (
    <Pop label="Columns" icon={<Columns3 aria-hidden />} wide>
      {() => (
        <div className={s.cols}>
          <div className={s.colsHead}>
            <span>Shown, in order</span>
            <button type="button" className={s.linkBtn} onClick={onReset}><RotateCcw aria-hidden />Default</button>
          </div>
          <ul className={s.shown}>
            {shown.map((id, i) => (
              <li key={id} draggable onDragStart={() => setDragId(id)} onDragEnd={() => { setDragId(""); setOverId(""); }}
                onDragOver={(e) => { e.preventDefault(); if (overId !== id) setOverId(id); }}
                onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== id) { const n = shown.filter((x) => x !== dragId); n.splice(n.indexOf(id) + (shown.indexOf(dragId) < i ? 1 : 0), 0, dragId); onChange(n); } setDragId(""); setOverId(""); }}
                className={`${dragId === id ? s.dragging : ""} ${overId === id && dragId && dragId !== id ? (shown.indexOf(dragId) < i ? s.dropAfter : s.dropBefore) : ""}`}>
                <GripVertical className={s.grip} aria-hidden />
                <label><input type="checkbox" checked disabled={shown.length <= 1} onChange={() => onChange(shown.filter((x) => x !== id))} />{byId.get(id)!.label}</label>
                <em>{byId.get(id)!.group}</em>
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${byId.get(id)!.label} left`}><ArrowUp /></button>
                <button type="button" disabled={i === shown.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${byId.get(id)!.label} right`}><ArrowDown /></button>
              </li>
            ))}
          </ul>
          <div className={s.colsHead}><span>More columns</span></div>
          <input className={s.colSearch} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a field" aria-label="Find a field" />
          <div className={s.hiddenList}>
            {groups.map((g) => (
              <div key={g}>
                <p className={s.group}>{g}</p>
                {hidden.filter((c) => c.group === g).map((c) => (
                  <label key={c.id} className={s.opt}><input type="checkbox" checked={false} onChange={() => onChange([...shown, c.id])} />{c.label}</label>
                ))}
              </div>
            ))}
            {!hidden.length && <p className={s.none}>{q ? "No field matches." : "Every column is shown."}</p>}
          </div>
        </div>
      )}
    </Pop>
  );
}

/** The filters in force, as chips you can remove one by one. */
export function FilterChips({ filters, onChange, ownerLabel, money }: {
  filters: QuoteFilters; onChange: (f: QuoteFilters) => void; ownerLabel: (v: string) => string; money: (n: number) => string;
}) {
  const chips: Array<[string, () => void]> = [];
  const drop = (...ks: (keyof QuoteFilters)[]) => () => { const n: any = { ...filters }; ks.forEach((k) => delete n[k]); onChange(n); };
  if (filters.search) chips.push([`Contains “${filters.search}”`, drop("search")]);
  (filters.statuses || []).forEach((st) => chips.push([`Status: ${st}`, () => onChange({ ...filters, statuses: (filters.statuses || []).filter((x) => x !== st) })]));
  if (filters.created_by) chips.push([`Owner: ${ownerLabel(filters.created_by)}`, drop("created_by")]);
  if (filters.client_contains) chips.push([`Client: ${filters.client_contains}`, drop("client_contains")]);
  if (filters.date_from || filters.date_to) chips.push([`Date: ${filters.date_from || "…"} → ${filters.date_to || "…"}`, drop("date_from", "date_to")]);
  if (filters.min_amount != null || filters.max_amount != null) chips.push([`Amount: ${filters.min_amount != null ? money(filters.min_amount) : "0"} – ${filters.max_amount != null ? money(filters.max_amount) : "any"}`, drop("min_amount", "max_amount")]);
  if (filters.quiet_days != null) chips.push([`Quiet ${filters.quiet_days}+ days`, drop("quiet_days")]);
  if (!chips.length) return null;
  return (
    <div className={s.chips} aria-label="Filters in use">
      {chips.map(([label, remove]) => (
        <span key={label} className={s.chip}>{label}<button type="button" onClick={remove} aria-label={`Remove ${label}`}><X /></button></span>
      ))}
      {chips.length > 1 && <button type="button" className={s.linkBtn} onClick={() => onChange({})}>Clear all</button>}
    </div>
  );
}
