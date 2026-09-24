import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { requireOnboarded } from "@/lib/auth";
import { getDb } from "@/lib/db/open";
import { listDateIndex } from "@/lib/domain";

export const metadata = { title: "Dates" };

export default async function DatesPage() {
  const member = await requireOnboarded();
  const rows = listDateIndex(getDb(), member.id).filter((row) => row.status === "proposed" || row.status === "confirmed");
  return (
    <div className="stack">
      <header className="page-head">
        <h1>Dates</h1>
        <p className="lede">A date shows up here only after the matchmakers are ready. Times are Pacific.</p>
      </header>
      {rows.length === 0 ? (
        <section className="empty">
          <p>Nothing needs you yet. Your bots are still talking.</p>
        </section>
      ) : (
        <div className="people">
          {rows.map((row) => (
            <article key={row.matchId} className="list-block">
              <div className="person-top">
                <Avatar name={row.person.displayName} accent={row.person.accent} />
                <div>
                  <h2>{row.person.displayName}</h2>
                  <p className="meta">
                    {row.status === "confirmed"
                      ? `${row.whenLabel} · ${row.place}`
                      : row.offerWaiting
                        ? `${row.whenLabel} · ready for you`
                        : `${row.whenLabel} · waiting on them`}
                  </p>
                </div>
              </div>
              <Link className={row.offerWaiting ? "btn primary wide" : "btn ghost wide"} href={`/dates/${row.matchId}`}>
                {row.offerWaiting ? "Review offer" : "View date"}
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
