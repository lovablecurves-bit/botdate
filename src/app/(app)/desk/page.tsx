import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { requireOnboarded } from "@/lib/auth";
import { getDb } from "@/lib/db/open";
import { listDesk } from "@/lib/domain";
import { truncate } from "@/lib/labels";

export const metadata = { title: "Bot desk" };

export default async function DeskIndexPage() {
  const member = await requireOnboarded();
  const desks = listDesk(getDb(), member.id);
  return (
    <div className="stack">
      <header className="page-head">
        <h1>Desk</h1>
        <p className="lede">What the matchmakers have already sent. A draft that speaks for you waits until you approve, edit, or kill it.</p>
      </header>
      {desks.length === 0 ? (
        <section className="empty">
          <p>No desks yet. When someone clears both sets of dealbreakers, a desk opens here.</p>
        </section>
      ) : (
        <div>
          {desks.map((desk) => (
            <Link key={desk.matchId} href={`/desk/${desk.matchId}`} className="list-link">
              <Avatar name={desk.person.displayName} accent={desk.person.accent} />
              <span>
                <strong>{desk.person.displayName}</strong>
                <span className="meta">{truncate(desk.preview, 90)}</span>
                {desk.draftWaiting ? <span className="draft-flag">Draft to approve</span> : null}
                {!desk.draftWaiting && desk.held ? <span className="meta">Waiting on their approval</span> : null}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
