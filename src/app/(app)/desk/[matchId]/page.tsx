import { notFound } from "next/navigation";
import { createDraftAction } from "@/app/actions";
import { Banner } from "@/components/banner";
import { DraftCard } from "@/components/draft-card";
import { MatchNav } from "@/components/match-nav";
import { Facts, PersonStrip } from "@/components/person";
import { SubmitButton } from "@/components/submit-button";
import { requireOnboarded } from "@/lib/auth";
import { getDb } from "@/lib/db/open";
import { getDesk } from "@/lib/domain";

export const metadata = { title: "Bot desk" };

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
      <Banner>{error}</Banner>
      {desk.paused ? <Banner>Your matchmaker is paused. Kill a draft if you want it gone. Unpause before anything sends.</Banner> : null}
      <section className="thread" aria-label="Bot-to-bot thread">
        {desk.items.length === 0 ? <p className="help">Nothing has been sent on this desk yet.</p> : null}
        {desk.items.map((item) =>
          item.kind === "system" ? (
            <p key={item.id} className="system-note">
              {item.body}
            </p>
          ) : (
            <article key={item.id} className={item.mine ? "bubble mine" : "bubble"}>
              <p className="who">{item.authorName}</p>
              <p>{item.body}</p>
              {item.edited ? <p className="edited">Edited before send</p> : null}
            </article>
          ),
        )}
      </section>
      {desk.heldCount > 0 ? <p className="holding">{desk.heldLabel}</p> : null}
      {desk.draft ? <DraftCard messageId={desk.draft.id} initialBody={desk.draft.body} paused={desk.paused} /> : null}
      {desk.canAsk ? (
        <form action={createDraftAction}>
          <input type="hidden" name="matchId" value={matchId} />
          <SubmitButton className="btn primary wide" pendingLabel="Drafting…" testId="ask-draft">
            {desk.askLabel}
          </SubmitButton>
        </form>
      ) : null}
      {desk.killed.length > 0 ? (
        <details className="killed">
          <summary>Dropped drafts ({desk.killed.length})</summary>
          {desk.killed.map((item) => (
            <p key={item.id}>{item.body}</p>
          ))}
        </details>
      ) : null}
      <details className="more">
        <summary>About {first}</summary>
        <p>{desk.person.bio}</p>
        <Facts person={desk.person} />
      </details>
    </div>
  );
}
