"use client";

import { use, useEffect, useState } from "react";
import s from "./quote.module.css";
import { money } from "@/lib/currency";

type Quote = {
  company: string; logo: string | null; qn: string; date: string; status: string; client: string;
  sections: Array<{ title: string; fields: Array<{ label: string; value: any }> }>;
  items: Array<{ code?: string; name: string; qty: number; unit?: string; rate: number; amount: number }>;
  total: number;
  currency?: string;
  response: { action: "accept" | "changes"; name: string; note?: string; at: string } | null;
};


/**
 * The page a client opens from a quote link. Plain, printable, and answerable: Accept, or ask for
 * changes. Their answer goes straight to the Status Log and the person who sent the quote.
 */
export default function SharedQuote({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [q, setQ] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"" | "accept" | "changes">("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Quote["response"]>(null);

  useEffect(() => {
    const preview = new URLSearchParams(window.location.search).has("preview") ? "?preview=1" : "";
    fetch(`/api/public/share/${token}${preview}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "This link is not valid.");
      setQ(j); setDone(j.response);
    }).catch((e) => setError(e.message));
  }, [token]);

  const send = async () => {
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/public/share/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: mode, name, note }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not send your answer.");
      setDone({ action: mode as any, name, note, at: new Date().toISOString() });
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (error && !q) return <main className={s.page}><div className={s.sheet}><p className={s.lost}>{error}</p></div></main>;
  if (!q) return <main className={s.page}><div className={s.sheet}><p className={s.muted}>Opening the quote…</p></div></main>;

  return (
    <main className={s.page}>
      <article className={s.sheet} aria-label={`Quotation ${q.qn}`}>
        <header className={s.top}>
          <div>
            {q.logo ? <img src={q.logo} alt={q.company} className={s.logo} /> : <p className={s.company}>{q.company}</p>}
          </div>
          <div className={s.right}>
            <h1 className={s.h1}>Quotation</h1>
            <p className={s.mono}>{q.qn} · {q.date}</p>
          </div>
        </header>

        <section className={s.to}>
          <span className={s.kicker}>Prepared for</span>
          <p className={s.client}>{q.client || "—"}</p>
        </section>

        {q.items.length > 0 && (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead><tr><th>Item</th><th className={s.num}>Qty</th><th>Unit</th><th className={s.num}>Rate</th><th className={s.num}>Amount</th></tr></thead>
              <tbody>
                {q.items.map((i, k) => (
                  <tr key={k}>
                    <td><b>{i.name}</b>{i.code ? <small>{i.code}</small> : null}</td>
                    <td className={s.num}>{i.qty}</td><td>{i.unit || ""}</td>
                    <td className={s.num}>{money(i.rate, q.currency)}</td><td className={s.num}>{money(i.amount, q.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={s.total}><span>Total</span><b>{money(q.total, q.currency)}</b></p>

        {q.sections.map((sec) => (
          <section key={sec.title} className={s.details}>
            <h2>{sec.title}</h2>
            <dl>{sec.fields.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{String(f.value)}</dd></div>)}</dl>
          </section>
        ))}

        <section className={s.answer} aria-live="polite">
          {done ? (
            <p className={s.thanks}>
              {done.action === "accept" ? <>Thank you, {done.name}. <b>{q.company}</b> has your acceptance and will be in touch about the order.</>
                : <>Thank you, {done.name}. <b>{q.company}</b> has your request and will send a revised quote.</>}
            </p>
          ) : !mode ? (
            <div className={s.buttons}>
              <button className={s.primary} onClick={() => setMode("accept")}>Accept this quote</button>
              <button className={s.ghost} onClick={() => setMode("changes")}>Ask for changes</button>
              <button className={s.ghost} onClick={() => window.print()}>Print or save as PDF</button>
            </div>
          ) : (
            <div className={s.form}>
              <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
              <label>{mode === "accept" ? "Anything to add (optional)" : "What would you like changed?"}
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </label>
              {error && <p className={s.lost} role="alert">{error}</p>}
              <div className={s.buttons}>
                <button className={s.primary} disabled={busy || !name.trim() || (mode === "changes" && !note.trim())} onClick={send}>
                  {busy ? "Sending…" : mode === "accept" ? "Confirm acceptance" : "Send request"}
                </button>
                <button className={s.ghost} onClick={() => { setMode(""); setError(""); }}>Back</button>
              </div>
            </div>
          )}
        </section>
      </article>
      <p className={s.foot}>Sent with Bloomgard CMA</p>
    </main>
  );
}
