"use client";

import React, { useMemo, useRef, useState } from "react";
import { MasterDataEntry, MasterDataValue, useMasterDataFields } from "@/hooks/useMasterDataFields";
import { autoMapColumns } from "@/lib/fieldMatch";
import { Wand2, X, Save, Trash2, Plus, Upload, Sparkles } from "lucide-react";

type MasterDataUIProps = {
  tenantId: string;
  schemaFields: string[];
};

const API = "/api/master-data";
const post = (action: string, payload: any) =>
  fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  }).then((r) => r.json());

// A "grid" = one root key plus its descendant keys flattened depth-first into an
// ordered column chain. Each row is a parent -> child value path.
type Grid = { columns: MasterDataEntry[] };
type Cell = { id: string; text: string } | null;

function flattenChain(root: MasterDataEntry): MasterDataEntry[] {
  const cols: MasterDataEntry[] = [];
  let node: MasterDataEntry | undefined = root;
  while (node) {
    cols.push(node);
    node = node.children && node.children.length > 0 ? node.children[0] : undefined;
  }
  return cols;
}

function valuesFor(entry: MasterDataEntry, parentValueId: string | null): MasterDataValue[] {
  return (entry.values || []).filter((v) => (v.parent_value_id ?? null) === parentValueId);
}

// Reconstruct grid rows from the value graph.
function buildRows(columns: MasterDataEntry[]): Cell[][] {
  const expand = (colIdx: number, parentValueId: string | null): Cell[][] => {
    const entry = columns[colIdx];
    const vals = valuesFor(entry, parentValueId);
    if (vals.length === 0) return [];
    const isLast = colIdx === columns.length - 1;
    const rows: Cell[][] = [];
    for (const v of vals) {
      const cell: Cell = { id: v.id, text: v.value_text };
      if (isLast) {
        rows.push([cell]);
        continue;
      }
      const childRows = expand(colIdx + 1, v.id);
      if (childRows.length === 0) {
        rows.push([cell, ...Array(columns.length - colIdx - 1).fill(null)]);
      } else {
        for (const cr of childRows) rows.push([cell, ...cr]);
      }
    }
    return rows;
  };
  return expand(0, null);
}

export default function MasterDataUI({ tenantId, schemaFields }: MasterDataUIProps) {
  const [activeTab, setActiveTab] = useState<"manual" | "auto">("manual");
  const { masterTree, isLoading, refreshTree } = useMasterDataFields(tenantId, activeTab);

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // value id
  const [editText, setEditText] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({}); // cellKey -> pending text
  const [aiFor, setAiFor] = useState<MasterDataEntry | null>(null);
  const [aiText, setAiText] = useState("");
  const [addColFor, setAddColFor] = useState<string | null>(null); // parent entry id, "" = new root
  const [newKey, setNewKey] = useState("");
  const [importState, setImportState] = useState<null | {
    headers: string[];
    rows: string[][];
    mapping: { header: string; keyName: string | null }[];
  }>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const grids: Grid[] = useMemo(
    () => masterTree.map((root) => ({ columns: flattenChain(root) })),
    [masterTree]
  );

  const reload = async () => refreshTree();
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try { await fn(); await reload(); } finally { setBusy(false); }
  };

  // ---- cell + row mutations -------------------------------------------------
  const addValue = (entryId: string, text: string, parentValueId: string | null) =>
    run(() => post("addValueOption", { entry_id: entryId, value_text: text.trim(), parent_value_id: parentValueId }));

  const saveEdit = (id: string) => {
    const t = editText.trim();
    setEditing(null);
    if (!t) return;
    run(() => post("editValueOption", { id, value_text: t }));
  };

  const deleteValue = (id: string) => run(() => post("deleteValueOption", { id }));

  const deleteRow = (row: Cell[]) => {
    // remove the deepest concrete value (cascade drops its descendants)
    for (let i = row.length - 1; i >= 0; i--) {
      if (row[i]) return deleteValue(row[i]!.id);
    }
  };

  // ---- key / column mutations --------------------------------------------
  const createKey = () => {
    if (!newKey) return;
    const parent_id = addColFor || null;
    run(() => post("createMasterKey", { tenant_id: tenantId, tab_type: activeTab, key_name: newKey, parent_id }));
    setAddColFor(null);
    setNewKey("");
  };
  const deleteKey = (id: string) => {
    if (!confirm("Delete this column and every value under it?")) return;
    run(() => post("deleteMasterKey", { id }));
  };
  const renameKey = (id: string, key_name: string) => {
    setEditing(null);
    if (!key_name.trim()) return;
    run(() => post("editMasterKeyName", { id, key_name: key_name.trim() }));
  };
  const saveAi = () => {
    if (!aiFor) return;
    run(() => post("updateAIDescription", { id: aiFor.id, ai_description: aiText }));
    setAiFor(null);
  };

  // ---- Excel paste + import ---------------------------------------------
  const bulkImport = (columns: { key_name: string }[], rows: string[][]) =>
    run(() => post("bulkImport", { tenant_id: tenantId, tab_type: activeTab, columns, rows }));

  const handlePaste = (grid: Grid, startCol: number, e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !/[\t\n]/.test(text)) return;
    e.preventDefault();
    const matrix = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => l.split("\t"));
    const width = Math.max(...matrix.map((r) => r.length));
    const cols = grid.columns.slice(startCol, startCol + width).map((c) => ({ key_name: c.key_name }));
    if (cols.length === 0) return;
    bulkImport(cols, matrix);
  };

  const parseFile = async (file: File) => {
    // @ts-ignore - xlsx has no bundled types; loaded lazily so the page works without it
    const XLSX: any = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
    if (aoa.length < 2) { alert("Sheet needs a header row and at least one data row."); return; }
    const headers = aoa[0].map((h) => String(h ?? "").trim());
    const rows = aoa.slice(1).map((r) => headers.map((_, i) => String(r[i] ?? "").trim()));
    setImportState({ headers, rows, mapping: autoMapColumns(headers, schemaFields) });
  };

  const confirmImport = () => {
    if (!importState) return;
    const picked = importState.mapping
      .map((m, i) => ({ ...m, i }))
      .filter((m) => m.keyName);
    if (picked.length === 0) { alert("Map at least one column to a field."); return; }
    const columns = picked.map((m) => ({ key_name: m.keyName! }));
    const rows = importState.rows.map((r) => picked.map((m) => r[m.i] ?? ""));
    setImportState(null);
    bulkImport(columns, rows);
  };

  // ---- render -----------------------------------------------------------
  const readOnly = activeTab === "auto";

  const renderGrid = (grid: Grid, gi: number) => {
    const rows = buildRows(grid.columns);
    const last = grid.columns[grid.columns.length - 1];
    return (
      <div key={gi} className="mb-8 border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white inline-block min-w-full">
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {grid.columns.map((col) => (
                  <th key={col.id} className="text-left px-3 py-2 font-semibold text-gray-700 border-r border-gray-100 min-w-[180px] group/col">
                    <div className="flex items-center gap-2">
                      {editing === `k-${col.id}` ? (
                        <input
                          autoFocus defaultValue={col.key_name}
                          className="border border-[#436bf9] rounded px-1.5 py-0.5 text-xs font-semibold w-36 outline-none"
                          onBlur={(e) => renameKey(col.id, e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") renameKey(col.id, (e.target as HTMLInputElement).value); if (e.key === "Escape") setEditing(null); }}
                        />
                      ) : (
                        <span className="cursor-pointer hover:text-[#436bf9]" onClick={() => !readOnly && setEditing(`k-${col.id}`)}>
                          {col.key_name}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1 opacity-0 group-hover/col:opacity-100 transition-opacity">
                        <button title="AI knowledge" onClick={() => { setAiFor(col); setAiText(col.ai_description || ""); }} className="text-[#f042d7] hover:scale-110 transition-transform">
                          <Sparkles size={13} />
                        </button>
                        {!readOnly && (
                          <button title="Delete column" onClick={() => deleteKey(col.id)} className="text-gray-300 hover:text-red-500">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </span>
                    </div>
                  </th>
                ))}
                {!readOnly && (
                  <th className="px-2 py-2 w-10">
                    <button title="Add child column" onClick={() => { setAddColFor(last.id); setNewKey(schemaFields[0] || ""); }} className="w-6 h-6 rounded-md bg-[#436bf9] text-white flex items-center justify-center hover:scale-110 transition-transform">
                      <Plus size={13} />
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-b border-gray-100 hover:bg-blue-50/30 group/row">
                  {grid.columns.map((col, ci) => {
                    const cell = row[ci];
                    const parentCell = ci === 0 ? undefined : row[ci - 1];
                    const canFill = ci === 0 || !!parentCell;
                    const ck = `${gi}-${ri}-${ci}`;
                    return (
                      <td key={ci} className="border-r border-gray-100 px-0 py-0 relative group/cell align-middle">
                        {cell ? (
                          editing === cell.id ? (
                            <input
                              autoFocus value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                              onBlur={() => saveEdit(cell.id)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveEdit(cell.id); if (e.key === "Escape") setEditing(null); }}
                              className="w-full px-3 py-2 text-sm outline-none border-2 border-[#436bf9] bg-white"
                            />
                          ) : (
                            <div className="px-3 py-2 flex items-center">
                              <span
                                className={`flex-1 truncate ${readOnly ? "" : "cursor-text"}`}
                                onClick={() => { if (readOnly) return; setEditing(cell.id); setEditText(cell.text); }}
                              >
                                {cell.text}
                              </span>
                              {!readOnly && (
                                <button onClick={() => deleteValue(cell.id)} className="opacity-0 group-hover/cell:opacity-100 text-gray-300 hover:text-red-500 ml-1">
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          )
                        ) : readOnly ? (
                          <div className="px-3 py-2 text-gray-300">—</div>
                        ) : (
                          <input
                            placeholder={canFill ? "+ add" : ""}
                            disabled={!canFill}
                            value={draft[ck] || ""}
                            onChange={(e) => setDraft({ ...draft, [ck]: e.target.value })}
                            onPaste={(e) => handlePaste(grid, ci, e)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && draft[ck]?.trim()) {
                                addValue(col.id, draft[ck], parentCell ? parentCell.id : null);
                                setDraft({ ...draft, [ck]: "" });
                              }
                            }}
                            className="w-full px-3 py-2 text-sm outline-none bg-transparent placeholder-gray-300 focus:bg-white focus:border-2 focus:border-[#436bf9] disabled:cursor-not-allowed"
                          />
                        )}
                      </td>
                    );
                  })}
                  {!readOnly && (
                    <td className="px-2 text-center">
                      <button onClick={() => deleteRow(row)} className="opacity-0 group-hover/row:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {/* new-row: type in first column to append */}
              {!readOnly && (
                <tr className="bg-gray-50/60">
                  {grid.columns.map((col, ci) => {
                    const ck = `${gi}-new-${ci}`;
                    return (
                      <td key={ci} className="border-r border-gray-100">
                        {ci === 0 ? (
                          <input
                            placeholder="+ new row"
                            value={draft[ck] || ""}
                            onChange={(e) => setDraft({ ...draft, [ck]: e.target.value })}
                            onPaste={(e) => handlePaste(grid, 0, e)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && draft[ck]?.trim()) {
                                addValue(col.id, draft[ck], null);
                                setDraft({ ...draft, [ck]: "" });
                              }
                            }}
                            className="w-full px-3 py-2 text-sm outline-none bg-transparent placeholder-gray-400 focus:bg-white"
                          />
                        ) : (
                          <div className="px-3 py-2 text-gray-200 text-xs">↳ fill after saving row</div>
                        )}
                      </td>
                    );
                  })}
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[800px]">
      {/* Tabs + toolbar */}
      <div className="flex items-center border-b border-gray-200 bg-gray-50 px-4 pt-3 gap-2">
        {(["manual", "auto"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === t ? "border-[#436bf9] text-[#436bf9] bg-white" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {t === "auto" && <Wand2 size={14} />}
            {t === "manual" ? "Manual Data" : "Auto-Captured"}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-2">
          {busy && <span className="text-xs text-gray-400">Saving…</span>}
          {activeTab === "manual" && (
            <>
              <button
                onClick={() => { setAddColFor(""); setNewKey(schemaFields[0] || ""); }}
                className="text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-100 flex items-center gap-1.5"
              >
                <Plus size={13} /> New Key
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="text-xs font-semibold text-white bg-[#436bf9] rounded-lg px-3 py-1.5 hover:bg-blue-700 flex items-center gap-1.5"
              >
                <Upload size={13} /> Import Excel
              </button>
              <input
                ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); e.target.value = ""; }}
              />
            </>
          )}
        </div>
      </div>

      <div className="p-6 flex-1 overflow-auto bg-[#fafafa]">
        {isLoading ? (
          <div className="text-gray-400 text-center mt-20 font-medium">Loading Master Data…</div>
        ) : grids.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
            <p className="font-medium">No master data keys yet.</p>
            {activeTab === "manual" && (
              <button onClick={() => { setAddColFor(""); setNewKey(schemaFields[0] || ""); }} className="text-sm font-semibold text-[#436bf9] flex items-center gap-1.5">
                <Plus size={16} /> Add your first key
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-4">
              Each table is a key and its child keys. A row is a parent → child path — fill left to right.
              Paste straight from Excel into any cell, or use <strong>Import Excel</strong> for a whole sheet.
            </p>
            {grids.map(renderGrid)}
          </>
        )}
      </div>

      {/* New key modal */}
      {addColFor !== null && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-lg text-gray-900">{addColFor ? "Add Child Column" : "Add New Key"}</h3>
              <button onClick={() => setAddColFor(null)} className="text-gray-400 hover:text-gray-900 p-1"><X size={18} /></button>
            </div>
            <div className="p-5 bg-gray-50">
              {schemaFields.length === 0 ? (
                <div className="p-4 bg-orange-50 text-orange-700 text-sm rounded-xl border border-orange-200">
                  No schema fields found. Configure your Quote blueprint first.
                </div>
              ) : (
                <select
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  className="w-full bg-white border border-gray-200 px-4 py-3 rounded-xl text-sm font-medium outline-none focus:border-[#436bf9] mb-5"
                >
                  <option value="" disabled>Select a field…</option>
                  {schemaFields.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              )}
              <div className="flex justify-end gap-3">
                <button onClick={() => setAddColFor(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl">Cancel</button>
                <button onClick={createKey} disabled={!newKey} className="bg-[#436bf9] text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50">Create</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import mapping modal */}
      {importState && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-gray-900">Map Columns</h3>
                <p className="text-xs text-gray-500 mt-0.5">{importState.rows.length} rows · match each sheet column to a field key. Column order sets the parent → child hierarchy.</p>
              </div>
              <button onClick={() => setImportState(null)} className="text-gray-400 hover:text-gray-900 p-1"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-auto flex-1 space-y-2">
              {importState.mapping.map((m, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2">
                  <span className="text-sm font-mono text-gray-700 w-40 truncate" title={m.header}>{m.header || <em className="text-gray-400">col {i + 1}</em>}</span>
                  <span className="text-gray-300">→</span>
                  <select
                    value={m.keyName || ""}
                    onChange={(e) => {
                      const mapping = [...importState.mapping];
                      mapping[i] = { ...mapping[i], keyName: e.target.value || null };
                      setImportState({ ...importState, mapping });
                    }}
                    className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#436bf9]"
                  >
                    <option value="">— ignore —</option>
                    {schemaFields.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <span className="text-[10px] text-gray-400 w-24 truncate">e.g. {importState.rows[0]?.[i] || "—"}</span>
                </div>
              ))}
            </div>
            <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-white">
              <button onClick={() => setImportState(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={confirmImport} className="bg-[#436bf9] text-white px-5 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 flex items-center gap-2">
                <Upload size={14} /> Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI drawer */}
      {aiFor && (
        <>
          <div className="absolute inset-0 bg-gray-900/20 z-10" onClick={() => setAiFor(null)} />
          <div className="absolute inset-y-0 right-0 w-[400px] bg-white border-l border-gray-200 shadow-2xl z-20 flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><Wand2 size={16} className="text-[#f042d7]" /> AI Knowledge</h3>
              <button onClick={() => setAiFor(null)} className="text-gray-400 hover:text-gray-700 p-1"><X size={18} /></button>
            </div>
            <div className="p-5 flex-1 flex flex-col bg-gray-50">
              <p className="text-sm text-gray-600 mb-3">How should the AI understand <strong>"{aiFor.key_name}"</strong>?</p>
              <textarea
                className="w-full flex-1 border border-gray-200 rounded-xl p-3 text-sm outline-none focus:border-[#f042d7] resize-none bg-white"
                placeholder="e.g. 'Use this key to classify…'"
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
              />
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setAiFor(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl">Cancel</button>
              <button onClick={saveAi} className="px-5 py-2 text-sm font-bold text-white bg-[#f042d7] hover:bg-pink-600 rounded-xl flex items-center gap-2"><Save size={14} /> Save</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
