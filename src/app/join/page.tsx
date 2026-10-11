import { redirect } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { startCheckoutAction } from "@/app/stripe-actions";
import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { Wordmark } from "@/components/wordmark";
import { memberHome, requireUser } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { getMember } from "@/lib/domain";
import { canManageBilling, MEMBERSHIP_LABEL, needsPaywall } from "@/lib/stripe/access";
import { fulfillCheckoutSession } from "@/lib/stripe/fulfill";

export const metadata = { title: "Join" };

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string; error?: string }>;
}) {
  let member = await requireUser();
  const query = await searchParams;
  if (query.checkout === "success" && query.session_id) {
    await fulfillCheckoutSession(query.session_id, member.id);
    member = (await withDb((db) => getMember(db, member.id))) ?? member;
  }
  if (!needsPaywall(member)) redirect(memberHome(member));

  const notice =
    query.error ??
    (query.checkout === "cancel" ? "Checkout was cancelled. You can join whenever you're ready." : null) ??
    (query.checkout === "success" ? "Stripe has the payment. Membership unlocks as soon as it confirms." : null);

  return (
    <main className="paywall">
      <header className="page-head">
        <p className="wordmark splash">
          <Wordmark />
        </p>
        <h1>{MEMBERSHIP_LABEL}</h1>
        <p className="lede">Your matchmaker does the small talk. You step in when there is a date to approve.</p>
      </header>
      <Banner>{notice}</Banner>
      <section className="paywall-card">
        <p className="price-line">
          $4.20<span>/mo</span>
        </p>
        <p>A recurring membership. Cancel anytime from billing.</p>
        <form action={startCheckoutAction}>
          <SubmitButton className="btn primary wide" pendingLabel="Opening checkout…" testId="join-botdate">
            {MEMBERSHIP_LABEL}
          </SubmitButton>
        </form>
        {canManageBilling(member) ? (
          <p className="text-links">
            <a href="/api/stripe/portal">Manage billing</a>
          </p>
        ) : null}
      </section>
      <form action={logoutAction}>
        <button type="submit" className="text-button">
          Sign out
        </button>
      </form>
      <p className="credit">BotDate · by Lovable Curves</p>
    </main>
  );
}
