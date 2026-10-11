import Link from "next/link";
import { redirect } from "next/navigation";
import { resetDemoAction, setPausedAction } from "@/app/actions";
import { Banner } from "@/components/banner";
import { OnboardingForm } from "@/components/onboarding-form";
import { SubmitButton } from "@/components/submit-button";
import { WipeControl } from "@/components/wipe-control";
import { needsConnectPrompt, requireUser } from "@/lib/auth";
import { billingEnabled } from "@/lib/billing/config";
import { demoMode } from "@/lib/x/config";

const NOTICES: Record<string, string> = {
  wiped: "Matchmaker memory is wiped. Human chats were left in place.",
  paused: "Your matchmaker is paused. It will not send anything new until you unpause.",
  unpaused: "Your matchmaker is active again.",
};

export const metadata = { title: "Profile" };

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const member = await requireUser();
  if (needsConnectPrompt(member)) redirect("/connect");
  const query = await searchParams;
  const showDemoReset = demoMode();
  const showBilling = billingEnabled() && Boolean(member.stripeCustomerId);
  return (
    <div className="stack">
      <header className="page-head">
        <h1>Profile</h1>
        <p className="lede">
          {member.prefs.locked
            ? "Hard filters hide misses. Must-haves only change the order."
            : "Your shortlist stays closed until you lock dealbreakers."}
        </p>
      </header>
      <Banner tone="good">{query.notice ? NOTICES[query.notice] : null}</Banner>
      <Banner>{query.error}</Banner>
      <OnboardingForm member={member} />
      <section className="stack tight">
        <div>
          <h2>Matchmaker</h2>
          <p className="help">Pause stops your matchmaker from saying anything new. Wipe clears bot-to-bot notes. You are only asked when there is a date.</p>
        </div>
        <Link className="btn primary wide" href="/connect">
          Connect your Grok Bot
        </Link>
        <form action={setPausedAction}>
          <input type="hidden" name="paused" value={member.botPaused ? "false" : "true"} />
          <SubmitButton className="btn ghost wide" pendingLabel="Saving…" testId="toggle-pause">
            {member.botPaused ? "Unpause matchmaker" : "Pause matchmaker"}
          </SubmitButton>
        </form>
        <WipeControl />
      </section>
      {showBilling ? (
        <section className="stack tight">
          <div>
            <h2>Membership</h2>
            <p className="help">Update the card or cancel the $4.20/mo membership.</p>
          </div>
          <p className="text-links">
            <a href="/api/stripe/portal?return=/onboarding" data-testid="manage-billing">
              Manage billing
            </a>
          </p>
        </section>
      ) : null}
      {showDemoReset ? (
        <section className="stack tight">
          <div>
            <h2>Demo data</h2>
            <p className="help">Resets every member, desk, and date, then signs you out.</p>
          </div>
          <form action={resetDemoAction}>
            <SubmitButton className="btn ghost wide" pendingLabel="Resetting…">
              Reset demo data
            </SubmitButton>
          </form>
        </section>
      ) : null}
    </div>
  );
}
