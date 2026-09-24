import Link from "next/link";
import { notFound } from "next/navigation";
import { proposeDateAction, respondDateAction } from "@/app/actions";
import { Banner } from "@/components/banner";
import { MatchNav } from "@/components/match-nav";
import { PersonStrip } from "@/components/person";
import { SubmitButton } from "@/components/submit-button";
import { requireOnboarded } from "@/lib/auth";
import { getDb } from "@/lib/db/open";
import { getDate } from "@/lib/domain";

export const metadata = { title: "Date desk" };

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
      {!date.bothOptIn ? (
        <section className="empty">
          <p>Both of you opt in before a time can be proposed.</p>
          <Link className="btn primary wide" href={`/intro/${matchId}`}>
            Go to intro
          </Link>
        </section>
      ) : null}
      {date.proposals.map((proposal) => (
        <article key={proposal.id} className={proposal.status === "confirmed" ? "confirm-card" : "stack tight"} data-testid={`proposal-${proposal.status}`}>
          <p className="meta">{proposal.status === "proposed" && !proposal.mine ? "Waiting on you" : proposal.status === "proposed" ? "You proposed this" : proposal.status === "confirmed" ? "Confirmed" : proposal.status}</p>
          <h2 className="when">{proposal.whenLabel}</h2>
          <p className="place">{proposal.place}</p>
          {proposal.note ? <p>{proposal.note}</p> : null}
          <p className="help">Proposed by {proposal.proposedBy}. Times are Pacific.</p>
          {proposal.status === "proposed" && !proposal.mine ? (
            <div className="decision">
              <form action={respondDateAction}>
                <input type="hidden" name="matchId" value={matchId} />
                <input type="hidden" name="proposalId" value={proposal.id} />
                <input type="hidden" name="decision" value="confirm" />
                <SubmitButton className="btn primary" pendingLabel="Confirming…" testId="confirm-date">
                  Confirm
                </SubmitButton>
              </form>
              <form action={respondDateAction}>
                <input type="hidden" name="matchId" value={matchId} />
                <input type="hidden" name="proposalId" value={proposal.id} />
                <input type="hidden" name="decision" value="decline" />
                <SubmitButton className="btn ghost" pendingLabel="Declining…" testId="decline-date">
                  Decline
                </SubmitButton>
              </form>
            </div>
          ) : null}
          {proposal.status === "proposed" && proposal.mine ? (
            <form action={respondDateAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <input type="hidden" name="proposalId" value={proposal.id} />
              <input type="hidden" name="decision" value="withdraw" />
              <SubmitButton className="btn ghost wide" pendingLabel="Withdrawing…">
                Withdraw
              </SubmitButton>
            </form>
          ) : null}
          {proposal.status === "confirmed" ? <p className="banner good">You're set. Both of you confirmed this plan.</p> : null}
        </article>
      ))}
      {date.canPropose ? (
        <form action={proposeDateAction} className="stack">
          <h2>Propose a time</h2>
          <p className="help">Prefilled from your matchmaker. {other} confirms or declines. Times are Pacific.</p>
          <input type="hidden" name="matchId" value={matchId} />
          <label className="field">
            <span>When (Pacific)</span>
            <input name="local" type="datetime-local" required defaultValue={date.suggestion.local} />
          </label>
          <label className="field">
            <span>Place</span>
            <input name="place" required maxLength={120} defaultValue={date.suggestion.place} />
          </label>
          <label className="field">
            <span>Note</span>
            <textarea name="note" maxLength={280} defaultValue={date.suggestion.note} />
          </label>
          <SubmitButton className="btn primary wide" pendingLabel="Proposing…" testId="propose-date">
            Propose
          </SubmitButton>
        </form>
      ) : date.blockReason && date.bothOptIn ? (
        <p className="help">{date.blockReason}</p>
      ) : null}
    </div>
  );
}
