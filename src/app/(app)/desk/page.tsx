import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { requireOnboarded } from "@/lib/auth";
import { getDb } from "@/lib/db/open";
import { listDesk } from "@/lib/domain";
import { truncate } from "@/lib/labels";

export const metadata = { title: "Activity" };

export default async function DeskIndexPage() {
  const member = await requireOnboarded();
  const desks = listDesk(getDb(), member.id);
  return (
    <div className="stack">
      <header className="page-head">
        <h1>Activity</h1>
        <p className="lede">What the matchmakers have already said. Nothing here is waiting on you.</p>
      </header>
      {desks.length === 0 ? (
        <section className="empty">
          <p>No conversations yet. When someone clears both sets of dealbreakers, the bots start talking.</p>
        </section>
      ) : (
        <div>
          {desks.map((desk) => (
            <Link key={desk.matchId} href={`/desk/${desk.matchId}`} className="list-link">
              <Avatar name={desk.person.displayName} accent={desk.person.accent} />
              <span>
                <strong>{desk.person.displayName}</strong>
                <span className="meta">{truncate(desk.preview, 90)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
