"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Settings2, X, CheckSquare, Calendar, Flag, Link2, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { api } from "@/lib/platform/client";
import Overlay from "./Overlay";
import s from "./PlanningBoard.module.css";

type Column = { id: string; name: string };
type Board = { id: string; name: string; columns: Column[]; description?: string; can_manage: boolean };
type Member = { id: string; email: string; full_name: string | null; role: string };
type Card = {
  id: string; title: string; created_at: string; board_id: string; column: string; position: number;
  description?: string; assignee_id?: string | null; assignee_email?: string | null; due_at?: string | null;
  labels?: string[]; priority?: "low" | "normal" | "high"; checklist?: Array<{ text: string; done: boolean }>;
  quote_id?: string | null; qn?: string | null; created_by?: string | null;
};
type Props = { focusCardId?: string; onFocusUsed?: () => void; onOpenQuote?: (quoteId: string) => void };

const today = () => new Date().toISOString().slice(0, 10);
const dueIn = (d?: string | null) => (d ? Math.round((new Date(d + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 86400000) : null);
const shortDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" });
const initials = (m?: Member | null, email?: string | null) => {
  const n = m?.full_name || (email || m?.email || "?").split("@")[0];
  return n.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join("") || "?";
};
/** A stable colour per label, from a small set that reads in both themes. */
const LABEL_TONES = ["neelam", "sindoor", "marigold", "green", "plum", "slate"];
const tone = (label: string) => LABEL_TONES[[...label].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % LABEL_TONES.length];

type Filter = "all" | "mine" | "overdue" | "high";

/**
 * Team → Planning: a board of cards in columns. Drag a card to move it, click it to open it.
 * Cards can be assigned, dated, labelled, checklisted and linked to a quote.
 */
export default function PlanningBoard({ focusCardId, onFocusUsed, onOpenQuote }: Props) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [me, setMe] = useState("");
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState("");
  const [adding, setAdding] = useState("");          // column id with the quick-add box open
  const [draft, setDraft] = useState("");
  const [drag, setDrag] = useState<{ id: string; over?: string; index?: number } | null>(null);
  const [settings, setSettings] = useState(false);

  const load = useCallback(async (boardId?: string, cardId?: string) => {
    try {
      const qs = cardId ? `?card=${cardId}` : boardId ? `?board=${boardId}` : "";
      const r = await api<{ boards: Board[]; board: Board; cards: Card[]; members: Member[]; me: string }>(`/api/planning${qs}`);
      setBoards(r.boards); setBoard(r.board); setCards(r.cards); setMembers(r.members); setMe(r.me); setError("");
    } catch (e: any) { setError(e.message); }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    if (focusCardId) { load(undefined, focusCardId).then(() => { setOpenId(focusCardId); onFocusUsed?.(); }); }
    else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCardId]);

  const memberOf = (id?: string | null) => members.find((m) => m.id === id) || null;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cards.filter((c) => {
      if (filter === "mine" && c.assignee_id !== me) return false;
      if (filter === "overdue" && !((dueIn(c.due_at) ?? 1) < 0 && c.column !== board?.columns[board.columns.length - 1]?.id)) return false;
      if (filter === "high" && c.priority !== "high") return false;
      if (!needle) return true;
      return [c.title, c.description, c.qn, ...(c.labels || []), memberOf(c.assignee_id)?.full_name, c.assignee_email]
        .some((x) => String(x || "").toLowerCase().includes(needle));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, q, filter, me, board, members]);

  const act = async (json: any, reload = true) => {
    setError("");
    try { const r = await api("/api/planning", { json }); if (reload && board) await load(board.id); return r; }
    catch (e: any) { setError(e.message); if (board) load(board.id); return null; }
  };

  const addCard = async (column: string) => {
    const title = draft.trim();
    if (!title || !board) return;
    setDraft("");
    await act({ action: "card.create", board_id: board.id, column, title });
  };

  /* ------------------------------------------------------------ drag and drop between columns */
  const onDragOver = (e: React.DragEvent, column: string) => {
    if (!drag) return;
    e.preventDefault();
    const list = e.currentTarget.querySelectorAll<HTMLElement>("[data-card]");
    let index = list.length;
    for (let i = 0; i < list.length; i++) {
      const r = list[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { index = i; break; }
    }
    if (drag.over !== column || drag.index !== index) setDrag({ ...drag, over: column, index });
  };
  const onDrop = async (column: string) => {
    if (!drag || !board) return;
    const { id, index = 0 } = drag;
    setDrag(null);
    // place it locally first so the board does not jump, then save
    const inCol = visible.filter((c) => c.column === column && c.id !== id);
    const before = inCol[index - 1]; const after = inCol[index];
    const all = cards.filter((c) => c.column === column && c.id !== id);
    const realIndex = after ? all.findIndex((c) => c.id === after.id) : before ? all.findIndex((c) => c.id === before.id) + 1 : all.length;
    setCards((xs) => {
      const moving = xs.find((c) => c.id === id);
      if (!moving) return xs;
      const others = xs.filter((c) => c.id !== id);
      const col = others.filter((c) => c.column === column);
      col.splice(realIndex, 0, { ...moving, column });
      col.forEach((c, i) => (c.position = i));
      return [...others.filter((c) => c.column !== column), ...col];
    });
    await act({ action: "card.move", id, column, index: realIndex }, false);
  };

  if (!loaded) return <p className={s.muted}>Loading the board…</p>;
  if (!board) return <p className={s.error} role="alert">{error || "Could not load Planning."}</p>;

  const last = board.columns[board.columns.length - 1]?.id;
  const counts = { mine: cards.filter((c) => c.assignee_id === me).length, overdue: cards.filter((c) => (dueIn(c.due_at) ?? 1) < 0 && c.column !== last).length, high: cards.filter((c) => c.priority === "high").length };
  const open = cards.find((c) => c.id === openId) || null;

  return (
    <div className={s.page}>
      <div className={s.bar}>
        <label className={s.boardPick}>
          <span className="sr-only">Board</span>
          <select value={board.id} onChange={(e) => { if (e.target.value === "__new") { const n = prompt("Name the new board (for example “Exports Q1” or “Trade fair”):"); if (n?.trim()) act({ action: "board.create", name: n.trim() }, false).then((r: any) => r && load(r.id)); } else load(e.target.value); }}>
            {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            <option value="__new">+ New board…</option>
          </select>
        </label>
        <div className={s.search}>
          <Search aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a card, label, person or quote" aria-label="Search cards" />
        </div>
        <div className={s.chips} role="group" aria-label="Show">
          {([["all", "All", cards.length], ["mine", "Mine", counts.mine], ["overdue", "Overdue", counts.overdue], ["high", "High priority", counts.high]] as const).map(([k, label, n]) => (
            <button key={k} type="button" aria-pressed={filter === k} className={`${s.chip} ${filter === k ? s.chipOn : ""}`} onClick={() => setFilter(k)}>
              {label}{n ? <b>{n}</b> : null}
            </button>
          ))}
        </div>
        {board.can_manage && (
          <button type="button" className={s.ghost} onClick={() => setSettings(true)}><Settings2 aria-hidden />Board</button>
        )}
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}
      {!cards.length && <p className={s.muted}>Nothing planned yet. Add a card to any column, then open it to assign someone, set a due date, add a checklist or link a quote. Drag cards between columns as work moves.</p>}

      <div className={s.columns}>
        {board.columns.map((col) => {
          const list = visible.filter((c) => c.column === col.id);
          const over = drag?.over === col.id;
          return (
            <section key={col.id} className={`${s.column} ${over ? s.columnOver : ""}`} aria-label={col.name}
              onDragOver={(e) => onDragOver(e, col.id)} onDrop={() => onDrop(col.id)} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag((d) => (d ? { ...d, over: undefined } : d)); }}>
              <header className={s.colHead}>
                <h4>{col.name}</h4>
                <span>{cards.filter((c) => c.column === col.id).length}</span>
              </header>
              <div className={s.cards}>
                {list.map((c, i) => {
                  const d = dueIn(c.due_at);
                  const done = (c.checklist || []).filter((x) => x.done).length;
                  const who = memberOf(c.assignee_id);
                  return (
                    <div key={c.id} data-card>
                      {over && drag?.index === i && <div className={s.dropLine} aria-hidden />}
                      <button type="button" draggable className={`${s.card} ${drag?.id === c.id ? s.cardDragging : ""}`}
                        onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); setDrag({ id: c.id }); }}
                        onDragEnd={() => setDrag(null)}
                        onClick={() => setOpenId(c.id)}>
                        {!!c.labels?.length && <span className={s.labels}>{c.labels.map((l) => <i key={l} className={`${s.label} ${s[`t_${tone(l)}`]}`}>{l}</i>)}</span>}
                        <span className={s.cardTitle}>{c.priority === "high" && <Flag className={s.flag} aria-label="High priority" />}{c.title}</span>
                        {(c.due_at || c.checklist?.length || c.qn || who || c.description) && (
                          <span className={s.meta}>
                            {c.due_at && <span className={`${s.due} ${c.column !== last && d != null && d < 0 ? s.overdue : c.column !== last && d != null && d <= 2 ? s.soon : ""}`}><Calendar aria-hidden />{shortDate(c.due_at)}</span>}
                            {!!c.checklist?.length && <span className={done === c.checklist.length ? s.allDone : ""}><CheckSquare aria-hidden />{done}/{c.checklist.length}</span>}
                            {c.qn && <span className={s.qn}><Link2 aria-hidden />{c.qn}</span>}
                            {who && <span className={s.avatar} title={who.full_name || who.email}>{initials(who)}</span>}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
                {over && (drag?.index ?? 0) >= list.length && <div className={s.dropLine} aria-hidden />}
              </div>
              {adding === col.id ? (
                <div className={s.quickAdd}>
                  <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What needs doing?" aria-label={`New card in ${col.name}`}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addCard(col.id); } if (e.key === "Escape") { setAdding(""); setDraft(""); } }} />
                  <div className={s.row}>
                    <button type="button" className={s.primary} onClick={() => addCard(col.id)} disabled={!draft.trim()}>Add card</button>
                    <button type="button" className={s.iconBtn} aria-label="Cancel" onClick={() => { setAdding(""); setDraft(""); }}><X /></button>
                  </div>
                </div>
              ) : (
                <button type="button" className={s.addBtn} onClick={() => { setAdding(col.id); setDraft(""); }}><Plus aria-hidden />Add a card</button>
              )}
            </section>
          );
        })}
      </div>

      {open && (
        <CardDialog key={open.id} card={open} board={board} members={members} me={me}
          onClose={() => setOpenId("")}
          onOpenQuote={onOpenQuote}
          onSave={async (patch) => { const r = await act({ action: "card.update", id: open.id, patch }); return !!r; }}
          onDelete={async () => { if (!confirm(`Delete “${open.title}”? This cannot be undone.`)) return; const r = await act({ action: "card.delete", id: open.id }); if (r) setOpenId(""); }}
        />
      )}

      {settings && (
        <BoardDialog board={board} onClose={() => setSettings(false)}
          onSave={async (name, columns) => { const r = await act({ action: "board.update", id: board.id, name, columns }); if (r) setSettings(false); }}
          onDelete={boards.length > 1 ? async () => {
            if (!confirm(`Delete the board “${board.name}” and every card on it? This cannot be undone.`)) return;
            const r = await act({ action: "board.delete", id: board.id }, false);
            if (r) { setSettings(false); load(); }
          } : undefined}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------- card dialog */

function CardDialog({ card, board, members, me, onClose, onSave, onDelete, onOpenQuote }: {
  card: Card; board: Board; members: Member[]; me: string;
  onClose: () => void; onSave: (patch: any) => Promise<boolean>; onDelete: () => void; onOpenQuote?: (id: string) => void;
}) {
  const [f, setF] = useState({
    title: card.title, column: card.column, description: card.description || "", assignee_id: card.assignee_id || "",
    due_at: card.due_at || "", priority: card.priority || "normal", labels: card.labels || [], checklist: card.checklist || [], qn: card.qn || "",
  });
  const [label, setLabel] = useState("");
  const [item, setItem] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const set = (k: string, v: any) => setF((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(f) !== JSON.stringify({
    title: card.title, column: card.column, description: card.description || "", assignee_id: card.assignee_id || "",
    due_at: card.due_at || "", priority: card.priority || "normal", labels: card.labels || [], checklist: card.checklist || [], qn: card.qn || "",
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    const patch: any = { ...f, assignee_id: f.assignee_id || null, due_at: f.due_at || null };
    delete patch.qn;
    if ((f.qn || "") !== (card.qn || "")) { if (f.qn.trim()) patch.qn = f.qn.trim(); else patch.quote_id = null; }
    const ok = await onSave(patch);
    setSaving(false);
    if (ok) onClose();
  };
  const addLabel = () => { const l = label.trim(); if (l && !f.labels.includes(l)) set("labels", [...f.labels, l].slice(0, 8)); setLabel(""); };
  const addItem = () => { const t = item.trim(); if (t) set("checklist", [...f.checklist, { text: t, done: false }]); setItem(""); };
  const done = f.checklist.filter((x) => x.done).length;

  return (
    <Overlay><div className={s.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={s.dialog} role="dialog" aria-modal="true" aria-label={`Card: ${card.title}`}>
        <div className={s.dialogHead}>
          <input autoFocus className={s.titleInput} value={f.title} onChange={(e) => set("title", e.target.value)} aria-label="Title" />
          <button type="button" className={s.iconBtn} onClick={onClose} aria-label="Close"><X /></button>
        </div>
        <p className={s.sub}>In <b>{board.name}</b>{card.created_by ? <> · added by {card.created_by}</> : null}</p>

        <div className={s.fields}>
          <label><span>Column</span>
            <select value={f.column} onChange={(e) => set("column", e.target.value)}>{board.columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
          <label><span>Assignee</span>
            <select value={f.assignee_id} onChange={(e) => set("assignee_id", e.target.value)}>
              <option value="">No one</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}{m.id === me ? " (you)" : ""}</option>)}
            </select>
          </label>
          <label><span>Due</span><input type="date" value={f.due_at} onChange={(e) => set("due_at", e.target.value)} /></label>
          <label><span>Priority</span>
            <select value={f.priority} onChange={(e) => set("priority", e.target.value)}>
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
            </select>
          </label>
          <label className={s.wide}><span>Linked quote</span>
            <span className={s.inline}>
              <input value={f.qn} onChange={(e) => set("qn", e.target.value)} placeholder="QN-2026-012" />
              {card.quote_id && f.qn === card.qn && <button type="button" className={s.link} onClick={() => onOpenQuote?.(card.quote_id as string)}>Open</button>}
            </span>
          </label>
        </div>

        <div className={s.block}>
          <span className={s.blockLabel}>Labels</span>
          <div className={s.labelEdit}>
            {f.labels.map((l) => (
              <i key={l} className={`${s.label} ${s[`t_${tone(l)}`]}`}>{l}<button type="button" aria-label={`Remove ${l}`} onClick={() => set("labels", f.labels.filter((x) => x !== l))}><X /></button></i>
            ))}
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add a label" aria-label="Add a label"
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addLabel(); } }} onBlur={addLabel} />
          </div>
        </div>

        <label className={s.block}>
          <span className={s.blockLabel}>Description</span>
          <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="Details, links, what done looks like" />
        </label>

        <div className={s.block}>
          <span className={s.blockLabel}>Checklist {f.checklist.length ? <b>{done}/{f.checklist.length}</b> : null}</span>
          {!!f.checklist.length && <div className={s.progress} aria-hidden><i style={{ width: `${(done / f.checklist.length) * 100}%` }} /></div>}
          <ul className={s.checklist}>
            {f.checklist.map((x, i) => (
              <li key={i}>
                <label><input type="checkbox" checked={x.done} onChange={() => set("checklist", f.checklist.map((y, j) => (j === i ? { ...y, done: !y.done } : y)))} /><span className={x.done ? s.struck : ""}>{x.text}</span></label>
                <button type="button" className={s.iconBtn} aria-label={`Remove ${x.text}`} onClick={() => set("checklist", f.checklist.filter((_, j) => j !== i))}><X /></button>
              </li>
            ))}
          </ul>
          <div className={s.inline}>
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Add an item" aria-label="Add a checklist item"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} />
            <button type="button" className={s.ghost} onClick={addItem} disabled={!item.trim()}>Add</button>
          </div>
        </div>

        <div className={s.dialogFoot}>
          <button type="button" className={s.danger} onClick={onDelete}><Trash2 aria-hidden />Delete</button>
          <span className={s.grow} />
          <button type="button" className={s.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={s.primary} onClick={save} disabled={saving || !dirty || !f.title.trim()}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div></Overlay>
  );
}

/* ---------------------------------------------------------------------------- board dialog */

function BoardDialog({ board, onClose, onSave, onDelete }: {
  board: Board; onClose: () => void; onSave: (name: string, columns: Column[]) => void; onDelete?: () => void;
}) {
  const [name, setName] = useState(board.name);
  const [cols, setCols] = useState<Column[]>(board.columns.map((c) => ({ ...c })));
  const move = (i: number, by: number) => setCols((xs) => { const n = [...xs]; const [c] = n.splice(i, 1); n.splice(i + by, 0, c); return n; });
  return (
    <Overlay><div className={s.scrim} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={s.dialog} role="dialog" aria-modal="true" aria-label="Board settings">
        <div className={s.dialogHead}><h3 className={s.dialogTitle}>Board settings</h3><button type="button" className={s.iconBtn} onClick={onClose} aria-label="Close"><X /></button></div>
        <label className={s.block}><span className={s.blockLabel}>Name</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className={s.block}>
          <span className={s.blockLabel}>Columns, left to right</span>
          <ul className={s.colList}>
            {cols.map((c, i) => (
              <li key={c.id + i}>
                <input value={c.name} onChange={(e) => setCols((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label={`Column ${i + 1} name`} />
                <button type="button" className={s.iconBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp /></button>
                <button type="button" className={s.iconBtn} disabled={i === cols.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown /></button>
                <button type="button" className={s.iconBtn} disabled={cols.length <= 1} onClick={() => setCols((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove ${c.name}`}><X /></button>
              </li>
            ))}
          </ul>
          <button type="button" className={s.addBtn} onClick={() => setCols((xs) => [...xs, { id: "", name: "New column" }])}><Plus aria-hidden />Add a column</button>
          <p className={s.muted}>Cards in a removed column move to the first column.</p>
        </div>
        <div className={s.dialogFoot}>
          {onDelete && <button type="button" className={s.danger} onClick={onDelete}><Trash2 aria-hidden />Delete board</button>}
          <span className={s.grow} />
          <button type="button" className={s.ghost} onClick={onClose}>Cancel</button>
          <button type="button" className={s.primary} onClick={() => onSave(name.trim(), cols)} disabled={!name.trim() || !cols.some((c) => c.name.trim())}>Save</button>
        </div>
      </div>
    </div></Overlay>
  );
}
