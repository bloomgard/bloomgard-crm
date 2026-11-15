"use client";
import React, { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, GripVertical, HelpCircle, History, Plus, Rows3, Trash2, X } from "lucide-react";

/* A module (section) of the quote form. `is_log` turns it into a timeline of entries kept on each quote. */
export type Field = { label: string; name: string; type: string; options?: string };
export type Module = { title: string; fields: Field[]; allow_multiple?: boolean; is_log?: boolean };

const TYPES: Array<[string, string]> = [
  ["text", "Text"], ["paragraph", "Paragraph (Long Text)"], ["number", "Number"], ["date", "Date"],
  ["dropdown", "Dropdown"], ["master_status", "Master Status"], ["attachment", "Attachment"],
  ["calculated", "Formula"], ["logged_in", "Logged In User"],
];
const NEEDS_OPTIONS = new Set(["dropdown", "master_status", "calculated"]);
const slug = (s: string) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const TEMPLATES = (statuses: string[]): Array<{ id: string; label: string; hint: string; module: Module }> => [
  { id: "blank", label: "Blank module", hint: "Any group of fields", module: { title: "New module", fields: [], allow_multiple: false } },
  {
    id: "status", label: "Status log", hint: "Each entry moves the quote's status", module: {
      title: "Status Log", is_log: true, fields: [
        { label: "Status", name: "status", type: "master_status", options: statuses.join(", ") },
        { label: "Remark", name: "remark", type: "paragraph" },
      ],
    },
  },
  {
    id: "action", label: "Action log", hint: "Calls, visits, samples, meetings", module: {
      title: "Action Log", is_log: true, fields: [
        { label: "Action", name: "action", type: "dropdown", options: "Call, Email, Visit, Meeting, Sample sent, Revised quote" },
        { label: "Outcome", name: "outcome", type: "dropdown", options: "Positive, Neutral, Negative, No response" },
        { label: "Next step", name: "next_step", type: "text" },
        { label: "Follow-up on", name: "follow_up_on", type: "date" },
      ],
    },
  },
  {
    id: "remark", label: "Remark log", hint: "Free notes on the quote", module: {
      title: "Remark Log", is_log: true, fields: [
        { label: "Category", name: "category", type: "dropdown", options: "General, Pricing, Technical, Delivery" },
        { label: "Remark", name: "remark", type: "paragraph" },
      ],
    },
  },
];

function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={hint} onClick={() => onChange(!on)} className={`fc-switch ${on ? "fc-switch--on" : ""}`}>
      <span className="fc-switch__track"><span className="fc-switch__dot" /></span>{label}
    </button>
  );
}

/** Problems that would break forms, stats or the AI, found before saving. */
function validate(bp: Module[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const titles = new Set<string>();
  let formStatusFields = 0;
  bp.forEach((m, i) => {
    const t = (m.title || "").trim();
    if (!t) errors.push(`Module ${i + 1} has no name.`);
    else if (titles.has(t.toLowerCase())) errors.push(`Two modules are called "${t}".`);
    titles.add(t.toLowerCase());
    const keys = new Set<string>();
    (m.fields || []).forEach((f, j) => {
      if (!f.name) errors.push(`${t || `Module ${i + 1}`}: field ${j + 1} has no key.`);
      else if (keys.has(f.name)) errors.push(`${t}: the key "${f.name}" is used twice.`);
      keys.add(f.name);
      if (NEEDS_OPTIONS.has(f.type) && !String(f.options || "").trim()) warnings.push(`${t}: "${f.label || f.name}" needs ${f.type === "calculated" ? "a formula" : "options"}.`);
      if (f.type === "master_status" && !m.is_log) formStatusFields += 1;
    });
    if (m.is_log && (m.fields || []).length === 0) warnings.push(`${t}: a log module needs at least one field.`);
    if (m.is_log && m.allow_multiple) warnings.push(`${t}: "Multiple rows" is ignored for log modules (every entry is already a row).`);
  });
  if (formStatusFields > 1) warnings.push("More than one Master Status field in the quote form: the last one filled in wins.");
  return { errors, warnings };
}

export default function FieldConfigurator({
  blueprint, setBlueprint, onSave, saving, dirty, statuses,
}: {
  blueprint: Module[]; setBlueprint: (b: Module[]) => void; onSave: () => void; saving: boolean; dirty: boolean; statuses: string[];
}) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [showHelp, setShowHelp] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [dragMod, setDragMod] = useState<number | null>(null);
  const [dragField, setDragField] = useState<{ m: number; f: number } | null>(null);
  const { errors, warnings } = useMemo(() => validate(blueprint), [blueprint]);

  const update = (fn: (b: Module[]) => void) => { const nb: Module[] = JSON.parse(JSON.stringify(blueprint)); fn(nb); setBlueprint(nb); };
  const isOpen = (i: number) => open[i] ?? true;

  return (
    <div className="fc">
      {/* sticky save bar: always reachable, whatever the zoom */}
      <div className="fc-bar">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">Modules are the sections of your quote form. Turn on <b>Log?</b> to make a module a timeline of entries on each quote.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={() => setShowHelp((v) => !v)} className="agent-btn"><HelpCircle className="w-3.5 h-3.5" />How it works</button>
          <span className={`text-xs ${dirty ? "text-[var(--sindoor)]" : "text-gray-500"}`}>{saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}</span>
          <button type="button" onClick={onSave} disabled={saving || !dirty || errors.length > 0} className="agent-btn agent-btn--primary">Save changes</button>
        </div>
      </div>

      {showHelp && (
        <div className="fc-help">
          <div>
            <h4>Master Status</h4>
            <p>A dropdown whose options are your pipeline stages (e.g. <i>Inquiry, Quotation Given, PO Received, Lost</i>). Whatever it is set to <b>becomes the quote's status</b>: the one Quotes, Follow ups, the Home stats and the AI all read. Changing it records a line in the status history. Keep one in the quote form; a <b>Status log</b> module can also hold one, so every logged entry moves the status.</p>
          </div>
          <div>
            <h4>Log modules</h4>
            <p>A module with <b>Log?</b> on is not filled in the quote form. Instead, each quote keeps a timeline of entries (who, when, and your fields), added from the quote viewer or by asking the AI. Every log can be filtered, and Home has a Logs stat that counts entries by module and by each dropdown in it.</p>
          </div>
          <div>
            <h4>Other types</h4>
            <p><b>Dropdown</b> options are comma separated. <b>Formula</b> computes from other fields, e.g. <code>SUM[Products.item_br]</code>. <b>Logged In User</b> fills itself with whoever saves. <b>Multiple rows</b> turns a module into a table (like Products).</p>
          </div>
        </div>
      )}

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="fc-issues" role="status">
          {errors.map((e) => <p key={e} className="text-[var(--danger,#a3192b)]"><AlertTriangle className="w-3.5 h-3.5" />{e}</p>)}
          {warnings.map((w) => <p key={w} className="text-gray-600"><AlertTriangle className="w-3.5 h-3.5 text-[var(--marigold)]" />{w}</p>)}
        </div>
      )}

      <div className="space-y-4">
        {blueprint.map((m, mi) => (
          <section
            key={mi} className={`fc-mod ${m.is_log ? "fc-mod--log" : ""} ${dragMod === mi ? "opacity-50" : ""}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragMod === null || dragMod === mi) return; update((b) => { const [x] = b.splice(dragMod, 1); b.splice(mi, 0, x); }); setDragMod(null); }}
          >
            <header className="fc-mod__head">
              <span draggable onDragStart={() => setDragMod(mi)} className="fc-grip" title="Drag to reorder modules"><GripVertical className="w-4 h-4" /></span>
              <button type="button" onClick={() => setOpen({ ...open, [mi]: !isOpen(mi) })} className="fc-icon" aria-label={isOpen(mi) ? "Collapse" : "Expand"}>
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen(mi) ? "" : "-rotate-90"}`} />
              </button>
              {m.is_log ? <History className="w-4 h-4 text-[var(--sindoor)] shrink-0" /> : <Rows3 className="w-4 h-4 text-gray-400 shrink-0" />}
              <input value={m.title} onChange={(e) => update((b) => { b[mi].title = e.target.value; })} className="fc-title" aria-label="Module name" />
              <span className="agent-label shrink-0">{m.fields?.length || 0} field{m.fields?.length === 1 ? "" : "s"}</span>
              <div className="flex items-center gap-2 ml-auto shrink-0">
                {!m.is_log && <Switch on={!!m.allow_multiple} onChange={(v) => update((b) => { b[mi].allow_multiple = v; })} label="Multiple rows" hint="Turn the module into a table, like Products" />}
                <Switch on={!!m.is_log} onChange={(v) => update((b) => { b[mi].is_log = v; if (v) b[mi].allow_multiple = false; })} label="Log?" hint="Keep a timeline of entries on each quote instead of one set of values" />
                <button type="button" onClick={() => { if (confirm(`Delete the module "${m.title}"? Data already saved on quotes is kept, but it will no longer show.`)) update((b) => { b.splice(mi, 1); }); }} className="fc-icon fc-icon--danger" aria-label="Delete module"><Trash2 className="w-4 h-4" /></button>
              </div>
            </header>
            {m.is_log && isOpen(mi) && (
              <p className="fc-note">Timeline module: each quote keeps a list of entries, stamped with <b>who</b> and <b>when</b> automatically. Entries are added from the quote viewer, not in the quote form.</p>
            )}
            {isOpen(mi) && (
              <div className="fc-table-wrap">
                <div className="fc-table" role="table" aria-label={`${m.title} fields`}>
                  <div className="fc-row fc-row--head" role="row">
                    <span /><span>Label</span><span>Key</span><span>Type</span><span>Options / formula</span><span />
                  </div>
                  {(m.fields || []).map((f, fi) => (
                    <div
                      key={fi} role="row" className={`fc-row ${dragField?.m === mi && dragField.f === fi ? "opacity-50" : ""}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.stopPropagation();
                        if (!dragField || dragField.m !== mi || dragField.f === fi) return;
                        update((b) => { const [x] = b[mi].fields.splice(dragField.f, 1); b[mi].fields.splice(fi, 0, x); });
                        setDragField(null);
                      }}
                    >
                      <span draggable onDragStart={(e) => { e.stopPropagation(); setDragField({ m: mi, f: fi }); }} className="fc-grip" title="Drag to reorder fields"><GripVertical className="w-4 h-4" /></span>
                      <input
                        placeholder="Label" value={f.label} aria-label="Label"
                        onChange={(e) => update((b) => {
                          const prev = b[mi].fields[fi];
                          const follow = !prev.name || prev.name === slug(prev.label);
                          prev.label = e.target.value;
                          if (follow) prev.name = slug(e.target.value);
                        })}
                      />
                      <input placeholder="key" value={f.name} aria-label="Key" className="font-mono text-[var(--neelam)]" onChange={(e) => update((b) => { b[mi].fields[fi].name = slug(e.target.value) || e.target.value; })} />
                      <select value={f.type} aria-label="Type" onChange={(e) => update((b) => { b[mi].fields[fi].type = e.target.value; })}>
                        {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <input
                        aria-label="Options" disabled={!NEEDS_OPTIONS.has(f.type)} value={f.options || ""}
                        placeholder={f.type === "calculated" ? "e.g. SUM[Products.item_br]" : f.type === "master_status" ? "Inquiry, Quotation Given, PO Received, Lost" : NEEDS_OPTIONS.has(f.type) ? "Option A, Option B, …" : "—"}
                        onChange={(e) => update((b) => { b[mi].fields[fi].options = e.target.value; })}
                      />
                      <button type="button" onClick={() => update((b) => { b[mi].fields.splice(fi, 1); })} className="fc-icon fc-icon--danger" aria-label="Remove field"><X className="w-4 h-4" /></button>
                      {f.type === "master_status" && (
                        <p className="fc-row__hint">Drives the quote's status{m.is_log ? ": every entry in this log moves it." : "."} Options are your pipeline stages, in order.</p>
                      )}
                    </div>
                  ))}
                  {(m.fields || []).length === 0 && <p className="text-sm text-gray-500 px-3 py-3">No fields yet.</p>}
                </div>
              </div>
            )}
            {isOpen(mi) && (
              <button type="button" onClick={() => update((b) => { b[mi].fields.push({ label: "", name: "", type: "text" }); })} className="fc-add"><Plus className="w-3.5 h-3.5" />Add field</button>
            )}
          </section>
        ))}
      </div>

      <div className="relative mt-4">
        <button type="button" onClick={() => setShowAdd((v) => !v)} className="fc-new"><Plus className="w-4 h-4" />Add module</button>
        {showAdd && (
          <div className="fc-templates">
            {TEMPLATES(statuses).map((t) => (
              <button key={t.id} type="button" onClick={() => {
                update((b) => {
                  let title = t.module.title, n = 2;
                  while (b.some((x) => x.title.toLowerCase() === title.toLowerCase())) title = `${t.module.title} ${n++}`;
                  b.push({ ...JSON.parse(JSON.stringify(t.module)), title });
                });
                setShowAdd(false);
              }}>
                <b>{t.label}</b><span>{t.hint}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
