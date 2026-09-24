import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { requireOnboarded } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { listDateIndex } from "@/lib/domain";

export const metadata = { title: "Dates" };

export default async function DatesPage() {
  const member = await requireOnboarded();
  const rows = await withDb((db) => listDateIndex(db, member.id));
  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">Date desk</p>
        <h1>Propose a time. Both people confirm.</h1>
        <p className="lede">A date opens after both of you opt in. Times are Pacific. One open proposal at a time.</p>
      </header>
      {rows.length === 0 ? (
        <section className="card empty">
          <p>No one is on your shortlist yet, so there is nowhere to propose.</p>
        </section>
      ) : (
        <div className="stack">
          {rows.map((row) => (
            <article key={row.matchId} className="card link-card">
              <div className="person-top">
                <Avatar name={row.person.displayName} accent={row.person.accent} size="sm" />
                <div>
                  <h2>{row.person.displayName}</h2>
                  <p className="meta">
                    {!row.bothOptIn
                      ? "Introduction is not mutual yet"
                      : row.status === "confirmed"
                        ? `${row.whenLabel} · ${row.place}`
                        : row.status === "proposed"
                          ? `${row.whenLabel} · ${row.place}`
                          : "No time proposed"}
                  </p>
                </div>
              </div>
              {row.status === "proposed" && !row.mine ? <p className="pill warn">Waiting on you</p> : null}
              {row.status === "proposed" && row.mine ? <p className="pill">Waiting on them</p> : null}
              {row.status === "confirmed" ? <p className="pill good">Confirmed</p> : null}
              <Link className="btn primary" href={row.bothOptIn ? `/dates/${row.matchId}` : `/intro/${row.matchId}`}>
                {row.bothOptIn ? "Open date desk" : "Go to intro"}
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
