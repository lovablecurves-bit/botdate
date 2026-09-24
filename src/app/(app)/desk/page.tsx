import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { requireOnboarded } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { listDesk } from "@/lib/domain";
import { truncate } from "@/lib/labels";

export const metadata = { title: "Bot desk" };

export default async function DeskIndexPage() {
  const member = await requireOnboarded();
  const desks = await withDb((db) => listDesk(db, member.id));
  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">Bot desk</p>
        <h1>Bot-to-bot, on your behalf</h1>
        <p className="lede">You can read what has been sent. A draft that speaks for you waits here until you approve, edit, or kill it.</p>
      </header>
      {desks.length === 0 ? (
        <section className="card empty">
          <p>No desks yet. When someone clears both sets of dealbreakers, a desk opens here.</p>
        </section>
      ) : (
        <div className="stack">
          {desks.map((desk) => (
            <Link key={desk.matchId} href={`/desk/${desk.matchId}`} className="card link-card">
              <div className="person-top">
                <Avatar name={desk.person.displayName} accent={desk.person.accent} size="sm" />
                <div>
                  <h2>{desk.person.displayName}</h2>
                  <p className="meta">{truncate(desk.preview, 120)}</p>
                </div>
              </div>
              {desk.draftWaiting ? <p className="pill warn">Draft to approve</p> : null}
              {!desk.draftWaiting && desk.held ? <p className="pill">Waiting on their approval</p> : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
