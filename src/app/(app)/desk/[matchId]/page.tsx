import { notFound } from "next/navigation";
import { Banner } from "@/components/banner";
import { MatchNav } from "@/components/match-nav";
import { Facts, PersonStrip } from "@/components/person";
import { requireOnboarded } from "@/lib/auth";
import { getDb } from "@/lib/db/open";
import { getDesk } from "@/lib/domain";

export const metadata = { title: "Activity" };

export default async function DeskPage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const member = await requireOnboarded();
  const { matchId } = await params;
  const { error } = await searchParams;
  const desk = getDesk(getDb(), member.id, matchId);
  if (!desk) notFound();
  const first = desk.person.displayName.split(" ")[0];

  return (
    <div className="stack">
      <PersonStrip person={desk.person} />
      <MatchNav matchId={matchId} current="desk" />
      <p className="lede">A log of the bot-to-bot conversation. You do not approve these notes.</p>
      <Banner>{error}</Banner>
      {desk.paused ? <Banner>Your matchmaker is paused, so it will not send anything new.</Banner> : null}
      <section className="thread" aria-label="Bot-to-bot thread">
        {desk.items.length === 0 ? <p className="help">Nothing has been said on this conversation yet.</p> : null}
        {desk.items.map((item) =>
          item.kind === "system" ? (
            <p key={item.id} className="system-note">
              {item.body}
            </p>
          ) : (
            <article key={item.id} className={item.mine ? "bubble mine" : "bubble"}>
              <p className="who">{item.authorName}</p>
              <p>{item.body}</p>
            </article>
          ),
        )}
      </section>
      <details className="more">
        <summary>About {first}</summary>
        <p>{desk.person.bio}</p>
        <Facts person={desk.person} />
      </details>
    </div>
  );
}
