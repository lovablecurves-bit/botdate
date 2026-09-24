import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { requireOnboarded } from "@/lib/auth";
import { getDb } from "@/lib/db/open";
import { listDateIndex } from "@/lib/domain";

export const metadata = { title: "Dates" };

function summary(row: { bothOptIn: boolean; status: string | null; whenLabel: string | null; place: string | null; mine: boolean }): string {
  if (!row.bothOptIn) return "Introduction is not mutual yet";
  if (row.status === "confirmed") return `${row.whenLabel} · ${row.place}`;
  if (row.status === "proposed" && !row.mine) return `${row.whenLabel} · waiting on you`;
  if (row.status === "proposed") return `${row.whenLabel} · waiting on them`;
  return "No time proposed yet";
}

export default async function DatesPage() {
  const member = await requireOnboarded();
  const rows = listDateIndex(getDb(), member.id);
  return (
    <div className="stack">
      <header className="page-head">
        <h1>Dates</h1>
        <p className="lede">A time opens after you both opt in. One proposal at a time, shown in Pacific time.</p>
      </header>
      {rows.length === 0 ? (
        <section className="empty">
          <p>No one is on your shortlist yet, so there is nowhere to propose.</p>
        </section>
      ) : (
        <div className="people">
          {rows.map((row) => (
            <article key={row.matchId} className="list-block">
              <div className="person-top">
                <Avatar name={row.person.displayName} accent={row.person.accent} />
                <div>
                  <h2>{row.person.displayName}</h2>
                  <p className="meta">{summary(row)}</p>
                </div>
              </div>
              <Link className="btn primary wide" href={row.bothOptIn ? `/dates/${row.matchId}` : `/intro/${row.matchId}`}>
                {row.bothOptIn ? (row.status === "proposed" && !row.mine ? "Confirm date" : "Open date") : "Go to intro"}
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
