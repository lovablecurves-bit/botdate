import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { needsConnectPrompt, requireUser } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { displayAvatarUrl, includeViewer, listDirectory } from "@/lib/directory";
import { truncate } from "@/lib/labels";
import { demoMode } from "@/lib/x/config";

export const metadata = { title: "Members" };

export default async function MembersPage() {
  const member = await requireUser();
  if (needsConnectPrompt(member)) redirect("/connect");
  const people = includeViewer(await withDb((db) => listDirectory(db)), member);
  const demo = demoMode();

  return (
    <div className="stack" data-testid="members-directory">
      <header className="page-head">
        <h1>Members</h1>
        <p className="lede">People who signed in with X. Avatars, handles, and bios are the copies saved at sign-in.</p>
      </header>
      {people.length === 0 ? (
        <section className="empty" data-testid="members-empty">
          <p>
            {demo
              ? "Real members show up here after they sign in with X. The demo roster stays on the login screen."
              : "No real members yet. The first person to sign in with X becomes member #1."}
          </p>
        </section>
      ) : (
        <section>
          {people.map((person) => (
            <Link key={person.id} href={`/members/${person.id}`} className="list-link" data-testid={`member-${person.id}`}>
              <Avatar name={person.displayName} accent={person.accent} imageUrl={displayAvatarUrl(person.avatarUrl)} />
              <span className="member-copy">
                <strong>{person.displayName}</strong>
                <span className="meta">@{person.handle}</span>
                {person.founder ? <span className="founder-flag">Founder · #1</span> : <span className="meta">Member #{person.memberNumber}</span>}
                <span className="meta">{person.id === member.id ? "You · " : ""}{truncate(person.bio, 110)}</span>
              </span>
            </Link>
          ))}
        </section>
      )}
      {member.founder ? (
        <p className="text-links">
          <a href="/admin/waitlist">Export waitlist</a>
        </p>
      ) : null}
    </div>
  );
}
