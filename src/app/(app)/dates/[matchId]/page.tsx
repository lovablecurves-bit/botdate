import Link from "next/link";
import { notFound } from "next/navigation";
import { Banner } from "@/components/banner";
import { DateOffer } from "@/components/date-offer";
import { MatchNav } from "@/components/match-nav";
import { PersonStrip } from "@/components/person";
import { requireOnboarded } from "@/lib/auth";
import { getDb } from "@/lib/db/open";
import { getDate } from "@/lib/domain";

export const metadata = { title: "Date" };

export default async function DatePage({
  params,
  searchParams,
}: {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const member = await requireOnboarded();
  const { matchId } = await params;
  const { error } = await searchParams;
  const date = getDate(getDb(), member.id, matchId);
  if (!date) notFound();
  const other = date.person.displayName.split(" ")[0];

  return (
    <div className="stack">
      <header className="page-head">
        <PersonStrip person={date.person} />
      </header>
      <MatchNav matchId={matchId} current="date" />
      <Banner>{error}</Banner>
      {date.proposals.length === 0 ? (
        <section className="empty">
          <p>No date yet. {other}&apos;s matchmaker is still talking with yours.</p>
          <Link href={`/desk/${matchId}`}>Read the activity</Link>
        </section>
      ) : null}
      {date.proposals.map((proposal) =>
        proposal.status === "proposed" && proposal.myDecision === "pending" ? (
          <DateOffer
            key={proposal.id}
            matchId={matchId}
            proposalId={proposal.id}
            personName={date.person.displayName}
            whenLabel={proposal.whenLabel}
            local={proposal.local}
            place={proposal.place}
            note={proposal.note}
          />
        ) : (
          <article key={proposal.id} className={proposal.status === "confirmed" ? "confirm-card" : "stack tight"} data-testid={`proposal-${proposal.status}`}>
            <p className="meta">
              {proposal.status === "confirmed"
                ? "You're set"
                : proposal.status === "declined"
                  ? "Passed"
                  : proposal.myDecision === "approved"
                    ? `Waiting on ${other}`
                    : proposal.status}
            </p>
            <h2 className="when">{proposal.whenLabel}</h2>
            <p className="place">{proposal.place}</p>
            {proposal.note ? <p>{proposal.note}</p> : null}
            <p className="help">Suggested by your matchmakers. Times are Pacific.</p>
            {proposal.status === "confirmed" ? <p className="banner good">Both of you approved this plan.</p> : null}
          </article>
        ),
      )}
      {date.blockReason ? <p className="help">{date.blockReason}</p> : null}
    </div>
  );
}
