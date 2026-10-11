import { notFound } from "next/navigation";
import { clearSafetyAction, keepPausedAction } from "@/app/actions";
import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { isFounderAccount } from "@/lib/billing/access";
import { withDb } from "@/lib/db/open";
import { listSafetyReview } from "@/lib/moderation";

export const metadata = { title: "Safety review" };

const NOTICES: Record<string, string> = {
  cleared: "Cleared and unpaused.",
  paused: "Left paused.",
};

export default async function SafetyReviewPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const member = await requireUser();
  if (!isFounderAccount(member)) notFound();
  const query = await searchParams;
  const rows = await withDb((db) => listSafetyReview(db));
  const open = rows.filter((row) => row.status === "flagged" || row.status === "pending_review" || row.status === "reported");
  return (
    <div className="stack" data-testid="safety-review">
      <header className="page-head">
        <h1>Safety review</h1>
        <p className="lede">Flagged accounts and members with reports. Three reports auto-pause the bot until you review it.</p>
      </header>
      <Banner tone="good">{query.notice ? NOTICES[query.notice] : null}</Banner>
      <Banner>{query.error}</Banner>
      {open.length === 0 ? (
        <section className="empty">
          <p>Nothing is waiting for review.</p>
        </section>
      ) : (
        <div className="stack">
          {open.map((row) => (
            <article key={row.userId} className="list-block" data-testid={`review-${row.userId}`}>
              <h2>{row.displayName}</h2>
              <p className="meta">
                {row.handle ? `@${row.handle}` : "No X handle"} · {row.status.replaceAll("_", " ")} · {row.reports} report{row.reports === 1 ? "" : "s"}
                {row.paused ? " · paused" : ""}
              </p>
              {row.reason ? <p>{row.reason}</p> : null}
              <div className="activity-actions">
                <form action={clearSafetyAction}>
                  <input type="hidden" name="userId" value={row.userId} />
                  <SubmitButton className="btn primary" pendingLabel="Saving…" testId={`clear-${row.userId}`}>
                    Clear and unpause
                  </SubmitButton>
                </form>
                <form action={keepPausedAction}>
                  <input type="hidden" name="userId" value={row.userId} />
                  <SubmitButton className="btn ghost" pendingLabel="Saving…">
                    Keep paused
                  </SubmitButton>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
