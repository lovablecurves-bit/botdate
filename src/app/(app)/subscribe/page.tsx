import { redirect } from "next/navigation";
import { startCheckoutAction, openBillingPortalAction } from "@/app/actions";
import { Banner } from "@/components/banner";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth";
import { billingConfigured, isFounderAccount, needsPaywall } from "@/lib/billing/access";
import { isFoundingMember } from "@/lib/founding";

export const metadata = { title: "Subscription" };

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const member = await requireUser();
  if (isFounderAccount(member) || isFoundingMember(member)) redirect("/profile");
  if (!needsPaywall(member)) redirect("/shortlist");
  const { error } = await searchParams;
  const billing = billingConfigured();
  const resubscribe = Boolean(member.stripeCustomerId);
  return (
    <div className="stack" data-testid="trial-prompt">
      <header className="page-head">
        <h1>{resubscribe ? "Subscription inactive" : "Membership is $4.20/mo"}</h1>
        <p className="lede">
          {resubscribe
            ? "Your bot stays quiet until the subscription is active again. Resubscribing turns it back on."
            : "The first 1,000 members are free. This account is past that, so membership is $4.20/mo."}
        </p>
      </header>
      <Banner>{error}</Banner>
      {billing ? (
        <form action={startCheckoutAction}>
          <SubmitButton className="btn primary wide" pendingLabel="Opening Stripe…" testId="start-trial">
            {resubscribe ? "Resubscribe" : "Subscribe · $4.20/mo"}
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
