/**
 * The Status Log: every workspace has one, whether or not anyone configured it.
 *
 * It is a log module like any other — a timeline of entries on each quote, filterable, with an inline
 * add row — except its entries live in the `status_logs` table rather than in the quote's metadata,
 * because changing the status is what writes them. This file is the one definition of its shape, shared
 * by the quote viewer and the Field Configurator so they can never drift apart.
 */
import type { Module } from "@/components/FieldConfigurator";

export const STATUS_LOG_TITLE = "Status Log";

export type StatusLogRow = {
  old_status?: string | null; new_status?: string | null; changed_by?: string | null;
  comments?: string | null; created_at?: string | null;
};

/** `from` is derived from the row, so it is a column but never an input. */
export const statusLogModule = (statuses: string[]): Module => ({
  title: STATUS_LOG_TITLE,
  is_log: true,
  builtin: true,
  fields: [
    { label: "From", name: "from", type: "text", derived: true },
    { label: "Status", name: "status", type: "master_status", options: statuses.join(", ") },
    { label: "Note", name: "note", type: "text" },
  ],
});

/** A comment that says nothing a column does not already say, e.g. "Status updated by someone@acme.com". */
const EMPTY_COMMENT = /^status updated(\s+by\s+\S+@\S+)?\s*\.?$/i;

/**
 * Older rows left `changed_by` null and wrote the author into the comment instead. Read the author from
 * either, and show a note only when the comment carries something of its own.
 */
export function statusLogEntry(row: StatusLogRow) {
  let by = String(row.changed_by || "").trim();
  const comment = String(row.comments || "").trim();
  if (!by) {
    const m = comment.match(/\bby\s+([^\s,;]+@[^\s,;]+)/i);
    if (m) by = m[1].replace(/[.,;]+$/, "");
  }
  return {
    _at: row.created_at || "", _by: by,
    from: row.old_status || "", status: row.new_status || "",
    note: EMPTY_COMMENT.test(comment) ? "" : comment,
  };
}

/** Oldest first: the log table reverses them, and an embedded select gives no order of its own. */
export const statusLogEntries = (rows: StatusLogRow[] | null | undefined) =>
  (Array.isArray(rows) ? rows : [])
    .map(statusLogEntry)
    .sort((a, b) => String(a._at).localeCompare(String(b._at)));

/**
 * A Master Status field on an ordinary module *is* the quote's status, so whenever the status moves —
 * from the quote viewer, from a log entry, or from the AI — every such field has to move with it.
 * Otherwise reopening the quote in the form and saving would quietly put the old status back.
 * Returns a new metadata object; the original is not touched.
 */
export function mirrorStatusIntoMetadata(
  metadata: any,
  modules: Array<{ title: string; fields?: Array<{ name: string; type: string }> }> | null | undefined,
  status: string,
) {
  const next = { ...(metadata || {}) };
  for (const mod of modules || []) {
    const section = next[mod.title];
    if (!section || Array.isArray(section) || typeof section !== "object") continue;
    const fields = (mod.fields || []).filter((f) => f.type === "master_status");
    if (!fields.length) continue;
    const copy = { ...section };
    for (const f of fields) copy[f.name] = status;
    next[mod.title] = copy;
  }
  return next;
}
