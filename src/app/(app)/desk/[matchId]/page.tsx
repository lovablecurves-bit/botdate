import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboarded } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { getDesk } from "@/lib/domain";

export const metadata = { title: "Activity" };

export default async function DeskPage({ params }: { params: Promise<{ matchId: string }> }) {
  const member = await requireOnboarded();
  const { matchId } = await params;
  const desk = await withDb((db) => getDesk(db, member.id, matchId));
  if (!desk) notFound();
  return (
    <div className="stack" data-testid="bots-private">
      <header className="page-head">
        <h1>The bots talk in private</h1>
        <p className="lede">
          {desk.person.displayName.split(" ")[0]}&apos;s bot and yours keep this conversation to themselves. You&apos;ll get a notification if they propose a date.
        </p>
      </header>
      <Link className="btn primary wide" href="/inbox">
        Open notifications
      </Link>
    </div>
  );
}
