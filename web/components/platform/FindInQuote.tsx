"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import s from "./FindInQuote.module.css";

/**
 * "Find in this quote": type and every match in the open quote lights up, with the current one
 * scrolled into view. Enter / Shift+Enter step through them; Ctrl/Cmd+F jumps here while the
 * quote is open. Matches are painted with the CSS Custom Highlight API, so the page's own markup
 * (which React owns) is never touched.
 */
export default function FindInQuote({ scope, resetKey }: { scope: RefObject<HTMLElement | null>; resetKey: string }) {
  const [q, setQ] = useState("");
  const [count, setCount] = useState(0);
  const [at, setAt] = useState(0);
  const ranges = useRef<Range[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const supported = typeof window !== "undefined" && "highlights" in CSS;

  const paint = useCallback((list: Range[], current: number) => {
    if (!supported) return;
    const H = (window as any).Highlight;
    const reg = (CSS as any).highlights;
    reg.delete("quote-find"); reg.delete("quote-find-current");
    if (!list.length) return;
    reg.set("quote-find", new H(...list));
    reg.set("quote-find-current", new H(list[current]));
  }, [supported]);

  const show = useCallback((list: Range[], i: number) => {
    paint(list, i);
    const el = list[i]?.startContainer.parentElement;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [paint]);

  const search = useCallback((needle: string, keepAt = false) => {
    const root = scope.current;
    const found: Range[] = [];
    const n = needle.trim().toLowerCase();
    if (root && n.length >= 1) {
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const p = node.parentElement;
          if (!p || p.closest("[data-find-skip]") || ["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "OPTION"].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
          return node.nodeValue && node.nodeValue.toLowerCase().includes(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
      });
      for (let node = walk.nextNode(); node && found.length < 500; node = walk.nextNode()) {
        const text = node.nodeValue!.toLowerCase();
        for (let i = text.indexOf(n); i !== -1 && found.length < 500; i = text.indexOf(n, i + n.length)) {
          const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + n.length); found.push(r);
        }
      }
    }
    ranges.current = found;
    setCount(found.length);
    const next = keepAt ? Math.min(at, Math.max(0, found.length - 1)) : 0;
    setAt(next);
    if (found.length) (keepAt ? paint(found, next) : show(found, next)); else paint([], 0);
  }, [scope, at, paint, show]);

  // a different quote: start over
  useEffect(() => { setQ(""); setCount(0); setAt(0); ranges.current = []; paint([], 0); }, [resetKey, paint]);
  useEffect(() => () => paint([], 0), [paint]);

  // notes and logs load after the panel opens: look again when the panel's content changes
  useEffect(() => {
    const root = scope.current;
    if (!root || !q.trim()) return;
    let t: any;
    const mo = new MutationObserver((muts) => {
      if (muts.every((m) => (m.target as HTMLElement)?.closest?.("[data-find-skip]"))) return;
      clearTimeout(t); t = setTimeout(() => search(q, true), 250);
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { mo.disconnect(); clearTimeout(t); };
  }, [q, scope, search]);

  // Ctrl/Cmd+F while a quote is open searches the quote
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") { e.preventDefault(); input.current?.focus(); input.current?.select(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const step = (by: number) => {
    const list = ranges.current;
    if (!list.length) return;
    const i = (at + by + list.length) % list.length;
    setAt(i); show(list, i);
  };

  return (
    <div className={s.bar} data-find-skip role="search" aria-label="Find in this quote">
      {/* the build's CSS parser does not know ::highlight() yet, so these rules ship inline */}
      <style>{"::highlight(quote-find){background-color:rgba(245,170,0,.32)}::highlight(quote-find-current){background-color:#f59e0b;color:#111}"}</style>
      <Search className={s.icon} aria-hidden />
      <input
        ref={input}
        value={q}
        onChange={(e) => { setQ(e.target.value); search(e.target.value); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
          if (e.key === "Escape" && q) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setQ(""); search(""); }
        }}
        placeholder="Find in this quote: an item, a note, a phone number…"
        aria-label="Find in this quote"
      />
      {q.trim() && <span className={s.count} aria-live="polite">{count ? `${at + 1} of ${count}` : "No matches"}</span>}
      {q.trim() && count > 1 && (
        <>
          <button type="button" onClick={() => step(-1)} aria-label="Previous match"><ChevronUp /></button>
          <button type="button" onClick={() => step(1)} aria-label="Next match"><ChevronDown /></button>
        </>
      )}
      {q && <button type="button" onClick={() => { setQ(""); search(""); input.current?.focus(); }} aria-label="Clear"><X /></button>}
    </div>
  );
}
