import { redirect } from "next/navigation";
import { startCheckoutAction, openBillingPortalAction } from "@/app/actions";
import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { billingConfigured, isFounderAccount, needsPaywall } from "@/lib/billing/access";

export const metadata = { title: "Subscription" };

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const member = await requireUser();
  if (isFounderAccount(member)) redirect("/onboarding");
  if (!needsPaywall(member)) redirect("/shortlist");
  const { error } = await searchParams;
  const billing = billingConfigured();
  const resubscribe = Boolean(member.stripeCustomerId);
  return (
    <div className="stack" data-testid="trial-prompt">
      <header className="page-head">
        <h1>{resubscribe ? "Subscription inactive" : "Start a free trial"}</h1>
        <p className="lede">
          {resubscribe
            ? "Your bot stays quiet until the subscription is active or trialing again. Resubscribing turns it back on."
            : "Try BotDate with your Grok bot. The trial starts in Stripe Checkout. You can cancel from your profile."}
        </p>
      </header>
      <Banner>{error}</Banner>
      {billing ? (
        <form action={startCheckoutAction}>
          <SubmitButton className="btn primary wide" pendingLabel="Opening Stripe…" testId="start-trial">
            {resubscribe ? "Resubscribe" : "Start free trial"}
          </SubmitButton>
        </form>
      ) : (
        <p className="help">Checkout is not available on this deployment yet.</p>
      )}
      {member.stripeCustomerId ? (
        <form action={openBillingPortalAction}>
          <SubmitButton className="btn ghost wide" pendingLabel="Opening…" testId="manage-subscription">
            Manage or cancel subscription
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
