import Link from "next/link";
import { loginAction, resetDemoAction } from "@/app/actions";
import { Portrait } from "@/components/person";
import { Wordmark } from "@/components/wordmark";
import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { DEMO_NOTES, DEMO_ORDER } from "@/lib/demo/members";
import { withDb } from "@/lib/db/open";
import { listRoster } from "@/lib/domain";
import { referralCode } from "@/lib/http/public";
import { paywallCopy } from "@/lib/stripe/access";
import { stripeConfig, trialDays } from "@/lib/stripe/config";
import { xAuthConfigured } from "@/lib/x/config";
import { loginErrorText } from "@/lib/x/oauth";

export async function SignInScreen({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string; ref?: string }>;
}) {
  const { error, error_description: errorDescription, ref: refParam } = await searchParams;
  const notice = loginErrorText(error, errorDescription);
  const order = new Map(DEMO_ORDER.map((id, index) => [id, index]));
  const xReady = xAuthConfigured();
  const billing = stripeConfig() !== null;
  const ref = referralCode(refParam);
  const startHref = ref ? `/api/auth/x/start?ref=${ref}` : "/api/auth/x/start";
  const roster = xReady
    ? []
    : (await withDb((db) => listRoster(db)))
        .filter((person) => order.has(person.id))
        .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  const [featured, ...rest] = roster;

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
      <section className="stack tight">
        <a className="btn primary wide" href={startHref} data-testid="sign-in-x">
          Sign in with X
        </a>
        <p className="help">
          {xReady
            ? billing
              ? `${paywallCopy(trialDays())} The first person to sign in is the founder and joins free. Next you'll connect your Grok bot.`
              : "Signing in creates your account. Next you'll connect your Grok bot. The first person to sign in becomes member #1."
            : "Sign in with X creates your account. Demo members below are only for this local copy."}
        </p>
      </section>
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
