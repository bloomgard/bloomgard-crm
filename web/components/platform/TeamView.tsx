"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/platform/client";
import s from "./TeamView.module.css";

type MemberStats = {
  id: string; email: string; full_name: string | null; role: string;
  quotes: number; pipeline_value: number; approved: number; approved_value: number; open_tasks: number; quiet_quotes: number;
};
type Activity = { kind: "status" | "note" | "task"; at: string; who: string; text: string; note?: string; quote_id?: string; qn?: string; client?: string };
type Props = { isManager: boolean; onOpenQuote?: (quoteId: string) => void };

const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;
const ago = (iso?: string) => {
  if (!iso) return "";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return m < 1 ? "just now" : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : d < 7 ? `${d} days ago` : new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

/** Who is carrying what, and what the team did lately. Managers and admins only. */
export default function TeamView({ isManager, onOpenQuote }: Props) {
  const [members, setMembers] = useState<MemberStats[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isManager) return;
    api<{ members: MemberStats[]; activity: Activity[] }>("/api/team")
      .then((r) => { setMembers(r.members); setActivity(r.activity); })
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, [isManager]);

  if (!isManager) {
    return (
      <div className={s.wrap}>
        <p className={s.empty}>Only managers and admins see the team view. Your own tasks are on the OK list.</p>
      </div>
    );
  }

  const nameOf = (email: string) => {
    const m = members.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
    return m?.full_name || email || "Someone";
  };

  return (
    <div className={s.wrap}>
      {error && <p className={s.error} role="alert">{error}</p>}

      <div className={s.grid}>
        <section aria-label="People">
          <h3 className={s.label}>People</h3>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr><th>Person</th><th>Quotes</th><th>Open pipeline</th><th>Won</th><th>Won value</th><th>Quiet 7d+</th><th>Open tasks</th></tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className={s.person}><b>{m.full_name || m.email}<span className={s.role}>{m.role}</span></b>{m.full_name && <span>{m.email}</span>}</td>
                    <td className={m.quotes ? "" : s.zero}>{m.quotes}</td>
                    <td className={m.pipeline_value ? "" : s.zero}>{inr(m.pipeline_value)}</td>
                    <td className={m.approved ? "" : s.zero}>{m.approved}</td>
                    <td className={m.approved_value ? "" : s.zero}>{inr(m.approved_value)}</td>
                    <td className={m.quiet_quotes ? s.warn : s.zero}>{m.quiet_quotes}</td>
                    <td className={m.open_tasks ? "" : s.zero}>{m.open_tasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loaded && !members.length && <p className={s.empty}>No one in the workspace yet. Add people under Settings → User Access.</p>}
          </div>
        </section>

        <section aria-label="Recent activity">
          <h3 className={s.label}>Recent activity</h3>
          <div className={s.feed}>
            {loaded && !activity.length && <p className={s.empty}>Nothing has happened yet. Status changes, notes and finished tasks appear here.</p>}
            {activity.map((a, i) => (
              <div key={i} className={s.event}>
                <span className={`${s.dot} ${s[`dot_${a.kind}`] || ""}`} aria-hidden />
                <div>
                  <p className={s.line}>
                    <b>{nameOf(a.who)}</b> {a.text}
                    {a.quote_id && <> on <button type="button" className={s.qn} onClick={() => onOpenQuote?.(a.quote_id as string)}>{a.qn || "a quote"}</button>{a.client ? ` · ${a.client}` : ""}</>}
                  </p>
                  {a.note && <p className={s.note}>{a.note}</p>}
                  <p className={s.when}>{ago(a.at)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
