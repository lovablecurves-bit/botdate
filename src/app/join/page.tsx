import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { startCheckoutAction } from "@/app/billing-actions";
import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { Wordmark } from "@/components/wordmark";
import { postLoginPath, requireUser } from "@/lib/auth";
import { MEMBERSHIP_BUTTON, MEMBERSHIP_PRICE, needsPaywall } from "@/lib/billing/access";
import { fulfillCheckoutReturn } from "@/lib/billing/stripe";
import { withDb } from "@/lib/db/open";
import { getMember } from "@/lib/domain";

export const metadata = { title: "Join" };
export const dynamic = "force-dynamic";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; checkout?: string; error?: string }>;
}) {
  const member = await requireUser();
  const query = await searchParams;
  if (query.session_id) {
    try {
      await fulfillCheckoutReturn(member.id, query.session_id);
    } catch {
      // The webhook may still store the subscription. Re-read below.
    }
  }
  const fresh = (await withDb((db) => getMember(db, member.id))) ?? member;
  if (!needsPaywall(fresh)) redirect(postLoginPath(fresh));

  const settling = Boolean(query.session_id);
  return (
    <main className="login" data-testid="paywall">
      <header className="page-head">
        <p className="wordmark splash">
          <Wordmark />
        </p>
        <ol className="stage">
          <li className="done">Sign in with X</li>
          <li className="current">Join BotDate</li>
        </ol>
        <h1>Join BotDate</h1>
        <p className="price">{MEMBERSHIP_PRICE}</p>
        <p className="lede">Membership is {MEMBERSHIP_PRICE}. The bots do the small talk. You step in when there is a date to approve.</p>
      </header>
      <Banner>{query.error}</Banner>
      {query.checkout === "cancel" ? <p className="help">Checkout cancelled. You can join whenever you are ready.</p> : null}
      {settling ? <p className="help">Payment is still settling. Refresh in a moment.</p> : null}
      <form action={startCheckoutAction}>
        <SubmitButton className="btn primary wide" pendingLabel="Opening checkout…" testId="join-checkout">
          {MEMBERSHIP_BUTTON}
        </SubmitButton>
      </form>
      {fresh.stripeCustomerId ? (
        <p className="text-links">
          <a href="/api/stripe/portal?return=/join" data-testid="manage-billing">
            Manage billing
          </a>
        </p>
      ) : null}
      <form action={logoutAction}>
        <button type="submit" className="btn ghost wide">
          Sign out
        </button>
      </form>
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
