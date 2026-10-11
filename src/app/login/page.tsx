import Link from "next/link";
import { joinWaitlistAction, loginAction, resetDemoAction } from "@/app/actions";
import { Portrait } from "@/components/person";
import { Wordmark } from "@/components/wordmark";
import { Banner } from "@/components/banner";
import { CopyLink } from "@/components/copy-link";
import { SubmitButton } from "@/components/submit-button";
import { DEMO_NOTES, DEMO_ORDER } from "@/lib/demo/members";
import { withDb } from "@/lib/db/open";
import { listRoster } from "@/lib/domain";
import { joinedWaitlistIntent, waitlistIntent, waitlistReferralUrl } from "@/lib/share";
import { paywallCopy } from "@/lib/stripe/access";
import { stripeConfig, trialDays } from "@/lib/stripe/config";
import { findWaitlistByCode, normalizeReferralCode, peopleWaitingLabel, waitlistCount } from "@/lib/waitlist";
import { logColdStartNote, xAuthConfigured } from "@/lib/x/config";
import { loginErrorText } from "@/lib/x/oauth";

export const metadata = { title: "Enter" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string; ref?: string; joined?: string; already?: string }>;
}) {
  const { error, error_description: errorDescription, ref: refParam, joined: joinedParam, already } = await searchParams;
  const notice = loginErrorText(error, errorDescription);
  const order = new Map(DEMO_ORDER.map((id, index) => [id, index]));
  const xReady = xAuthConfigured();
  const billing = stripeConfig() !== null;
  logColdStartNote();
  const invite = waitlistIntent();
  const ref = normalizeReferralCode(refParam);
  const joinedCode = normalizeReferralCode(joinedParam);
  const snapshot = await withDb((db) => ({
    count: waitlistCount(db),
    joined: joinedCode ? findWaitlistByCode(db, joinedCode) : null,
    roster: xReady ? [] : listRoster(db),
  }));
  const roster = snapshot.roster
    .filter((person) => order.has(person.id))
    .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  const [featured, ...rest] = roster;
  const joined = snapshot.joined;
  const shareUrl = joined ? waitlistReferralUrl(joined.referralCode) : null;

  return (
    <main className="login">
      <header className="page-head">
        <p className="wordmark splash">
          <Wordmark />
        </p>
        <h1>Your matchmaker does the first pass.</h1>
        <p className="lede">The bots do the small talk. You only step in when there is a date to approve, tweak, or pass.</p>
      </header>
      <Banner>{notice}</Banner>
      <section className="waitlist-card" aria-labelledby="waitlist-title" data-testid="waitlist">
        <div>
          <h2 id="waitlist-title">{joined ? "You're on the list" : "Join the waitlist"}</h2>
          <p className="waitlist-count" data-testid="waitlist-count">
            {peopleWaitingLabel(snapshot.count)}
          </p>
        </div>
        {joined && shareUrl ? (
          <div className="stack tight" data-testid="waitlist-confirm">
            <p className="waitlist-position">You're #{joined.position}</p>
            {already === "1" ? <p className="help">This email is already on the list.</p> : <p className="help">We'll hold your spot.</p>}
            <a className="btn primary wide" href={joinedWaitlistIntent(joined.referralCode)} target="_blank" rel="noopener noreferrer" data-testid="share-waitlist">
              Share BotDate on X
            </a>
            <p className="token-box" data-testid="waitlist-link">
              {shareUrl}
            </p>
            <CopyLink url={shareUrl} />
            <p className="text-links">
              <Link href={ref ? `/login?ref=${ref}` : "/login"}>Use a different email</Link>
            </p>
          </div>
        ) : (
          <form action={joinWaitlistAction} className="stack tight">
            <label className="field">
              <span>Email</span>
              <input type="email" name="email" required autoComplete="email" maxLength={254} placeholder="you@example.com" />
            </label>
            <label className="field">
              <span>
                X handle <span className="optional">(optional)</span>
              </span>
              <input
                type="text"
                name="xHandle"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={16}
                placeholder="@handle"
              />
            </label>
            {ref ? <input type="hidden" name="ref" value={ref} /> : null}
            <SubmitButton className="btn primary wide" pendingLabel="Joining…" testId="join-waitlist">
              Join the waitlist
            </SubmitButton>
          </form>
        )}
      </section>
      {xReady ? (
        <section className="stack tight">
          <a className="btn primary wide" href="/api/auth/x/start">
            Sign in with X
          </a>
          <p className="help">
            {billing
              ? `${paywallCopy(trialDays())} The first person to sign in is the founder and joins free. Next you'll connect your Grok bot.`
              : "Next you'll connect your Grok bot. The first person to sign in becomes member #1."}
          </p>
        </section>
      ) : null}
      {joined ? null : (
        <p className="text-links">
          <a href={invite} target="_blank" rel="noopener noreferrer">
            Share BotDate on X
          </a>
        </p>
      )}
      {featured ? (
        <section className="featured">
          <Portrait name={featured.displayName} accent={featured.accent} />
          <div className="person-copy">
            <h2>{featured.displayName}</h2>
            <p className="demo-note">{DEMO_NOTES[featured.id]}</p>
          </div>
          <form action={loginAction}>
            <input type="hidden" name="userId" value={featured.id} />
            <SubmitButton className="btn primary wide" pendingLabel="Opening…">
              Continue as {featured.displayName}
            </SubmitButton>
          </form>
        </section>
      ) : null}
      {rest.length > 0 ? (
        <section className="stack tight">
          <h2 className="section-label">Other demo members</h2>
          {rest.map((person) => (
            <form key={person.id} action={loginAction} className="member-row">
              <input type="hidden" name="userId" value={person.id} />
              <div>
                <h3>{person.displayName}</h3>
                <p className="demo-note">{person.locked ? DEMO_NOTES[person.id] : "Dealbreakers not locked yet."}</p>
              </div>
              <SubmitButton className="btn ghost wide" pendingLabel="Opening…">
                Enter as {person.displayName.split(" ")[0]}
              </SubmitButton>
            </form>
          ))}
        </section>
      ) : null}
      {xReady ? null : (
        <form action={resetDemoAction} className="reset-row">
          <p className="help">If a previous pass changed the seed, reset brings every demo member, desk, and date back.</p>
          <SubmitButton className="btn ghost wide" pendingLabel="Resetting…">
            Reset demo data
          </SubmitButton>
        </form>
      )}
      <footer className="login-foot">
        <p className="credit">BotDate · by Lovable Curves</p>
        <nav className="text-links legal-links" aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
