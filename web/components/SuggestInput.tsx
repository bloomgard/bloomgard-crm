"use client";

import { useId, useMemo, useRef, useState } from "react";

export type Suggestion = { id: string; value_text: string };

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** A value chosen from the list (click or Enter), or typed in full and left. */
  onPick?: (value: string) => void;
  suggestions: Suggestion[];
  className?: string;
  placeholder?: string;
  type?: string;
  inputMode?: "decimal" | "text" | "numeric";
  readOnly?: boolean;
};

const MAX_SHOWN = 50;

/**
 * A text field that remembers. Offers the catalogue's values and everything typed into this field
 * before, best match first, and works from the keyboard: arrows to move, Enter to choose, Escape to
 * close. Ids starting with "auto-" are history rather than catalogue, and are marked as such.
 */
export default function SuggestInput({
  id, value, onChange, onPick, suggestions, className, placeholder, type = "text", inputMode, readOnly,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shown = useMemo(() => {
    const q = String(value || "").trim().toLowerCase();
    if (!q) return suggestions.slice(0, MAX_SHOWN);
    const starts: Suggestion[] = [], contains: Suggestion[] = [];
    for (const s of suggestions) {
      const t = s.value_text.toLowerCase();
      if (t.startsWith(q)) starts.push(s);
      else if (t.includes(q)) contains.push(s);
    }
    return [...starts, ...contains].slice(0, MAX_SHOWN);
  }, [suggestions, value]);

  const canSuggest = !readOnly && suggestions.length > 0;
  const visible = canSuggest && open;

  const pick = (text: string) => {
    onChange(text);
    onPick?.(text);
    setOpen(false);
  };

  return (
    <>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        readOnly={readOnly}
        autoComplete="off"
        placeholder={placeholder}
        className={className}
        role={canSuggest ? "combobox" : undefined}
        aria-expanded={canSuggest ? visible : undefined}
        aria-controls={canSuggest ? listId : undefined}
        aria-autocomplete={canSuggest ? "list" : undefined}
        onFocus={() => { if (canSuggest) { setOpen(true); setActive(0); } }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
          // typed in full: treat it as chosen, so a known client still fills the rest
          const exact = suggestions.find((s) => s.value_text.toLowerCase() === String(value || "").trim().toLowerCase());
          if (exact && onPick) onPick(exact.value_text);
        }}
        onChange={(e) => { onChange(e.target.value); if (canSuggest) { setOpen(true); setActive(0); } }}
        onKeyDown={(e) => {
          if (!canSuggest) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(shown.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && visible && shown[active]) { e.preventDefault(); pick(shown[active].value_text); }
          else if (e.key === "Escape" && visible) { e.stopPropagation(); setOpen(false); }
        }}
      />
      {visible && (
        <div id={listId} role="listbox" className="sg-list">
          {shown.map((s, i) => (
            <div
              key={s.id}
              role="option"
              aria-selected={i === active}
              className={`sg-opt ${i === active ? "sg-opt--on" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); pick(s.value_text); }}
            >
              <span>{s.value_text}</span>
              {s.id.startsWith("auto-") && <em>used before</em>}
            </div>
          ))}
          {shown.length === 0 && <div className="sg-none">No matches. Keep typing to add a new one.</div>}
        </div>
      )}
    </>
  );
}
