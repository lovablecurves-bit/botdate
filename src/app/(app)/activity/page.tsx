import { setShareActivityAction } from "@/app/actions";
import { Avatar } from "@/components/avatar";
import { Banner } from "@/components/banner";
import { ReportBlock } from "@/components/report-block";
import { SubmitButton } from "@/components/submit-button";
import { XIdentity } from "@/components/x-identity";
import { requireOnboarded } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { listBotActivity } from "@/lib/moderation";
import { formatPacific } from "@/lib/time";

export const metadata = { title: "My bot's activity" };

const NOTICES: Record<string, string> = {
  saved: "Saved.",
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const member = await requireOnboarded();
  const query = await searchParams;
  const entries = await withDb((db) => listBotActivity(db, member.id));
  return (
    <div className="stack" data-testid="bot-activity">
      <header className="page-head">
        <h1>My bot&apos;s activity</h1>
        <p className="lede">Every conversation your bot had. The other person stays anonymous unless you have both opted in, or a date offer already exists.</p>
      </header>
      <Banner tone="good">{query.notice ? NOTICES[query.notice] : null}</Banner>
      <Banner>{query.error}</Banner>
      <form action={setShareActivityAction} className="stack tight" data-testid="share-activity">
        <label className="check">
          <input type="checkbox" name="enabled" value="on" defaultChecked={member.shareInActivity} />
          <span>Let matches see me in their bot activity</span>
        </label>
        <p className="help">Off by default. Your first name and first photo show in someone else&apos;s log only when you both turn this on. A date offer always shows who you are.</p>
        <SubmitButton className="btn ghost" pendingLabel="Saving…" testId="save-share-activity">
          Save
        </SubmitButton>
      </form>
      {entries.length === 0 ? (
        <section className="empty">
          <p>Your bot has not talked with anyone yet.</p>
        </section>
      ) : (
        <div className="stack">
          {entries.map((entry) => (
            <details key={entry.matchId} className="activity-entry" data-testid="activity-entry" data-reveal={entry.reveal}>
              <summary>
                {entry.reveal === "anonymous" ? null : (
                  <Avatar name={entry.label} accent={entry.accent} size="sm" imageUrl={entry.photoUrl} />
                )}
                <span data-testid="activity-label">{entry.label}</span>
              </summary>
              <div className="stack tight">
                {entry.blocked ? <p className="help">Blocked.</p> : null}
                <XIdentity handle={entry.xHandle} verified={entry.xVerified} />
                <div className="thread" data-testid="activity-transcript">
                  {entry.messages.map((message) => (
                    <article key={message.id} className={message.mine ? "bubble mine" : "bubble"}>
                      <p className="who">
                        {message.authorLabel} · {formatPacific(message.at)}
                      </p>
                      <p>{message.body}</p>
                    </article>
                  ))}
                </div>
                <ReportBlock targetId={entry.targetId} matchId={entry.matchId} />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
