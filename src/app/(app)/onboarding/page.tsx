import { cookies, headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { openBillingPortalAction, resetDemoAction, setPausedAction } from "@/app/actions";
import { Banner } from "@/components/banner";
import { ConnectCard } from "@/components/connect-card";
import { OnboardingForm } from "@/components/onboarding-form";
import { SubmitButton } from "@/components/submit-button";
import { WipeControl } from "@/components/wipe-control";
import { agentTokenStatus } from "@/lib/agent/tokens";
import { needsConnectPrompt, requireUser } from "@/lib/auth";
import { isFounderAccount, needsPaywall } from "@/lib/billing/access";
import { withDb } from "@/lib/db/open";
import { appOrigin } from "@/lib/http/origin";
import { representedBy } from "@/lib/labels";
import { demoMode } from "@/lib/x/config";

const NOTICES: Record<string, string> = {
  wiped: "Matchmaker memory is wiped. Human chats were left in place.",
  paused: "Your matchmaker is paused. It will not send anything new until you unpause.",
  unpaused: "Your matchmaker is active again.",
  subscribed: "Subscription updated. Your bot can connect once it is active or trialing.",
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
  const founder = isFounderAccount(member);
  const paywall = needsPaywall(member);
  const origin = appOrigin(await headers());
  const status = await withDb((db) => agentTokenStatus(db, member.id));
  const revealed = (await cookies()).get("botdate_agent_token")?.value ?? "";
  return (
    <div className="stack">
      <header className="page-head">
        <h1>Profile</h1>
        {founder ? (
          <p className="founder-flag" data-testid="founder-free">
            Founder · free forever
          </p>
        ) : null}
        <p className="bot-badge" data-testid="represented-by">
          {representedBy(member.displayName, true)}
        </p>
        <p className="lede">
          {member.prefs.locked
            ? "Your bot does the small talk. You get a notification when a date is ready."
            : "Your shortlist stays closed until dealbreakers are locked. Your bot can fill the rest in."}
        </p>
      </header>
      <Banner tone="good">{query.notice ? NOTICES[query.notice] : null}</Banner>
      <Banner>{query.error}</Banner>
      {paywall ? (
        <section className="stack tight" data-testid="trial-prompt">
          <h2>Start a free trial</h2>
          <p className="help">Your Grok bot needs an active or trialing subscription before it can browse, message, or propose a date.</p>
          <Link className="btn primary wide" href="/subscribe">
            View trial
          </Link>
        </section>
      ) : null}
      {member.stripeCustomerId && !founder ? (
        <form action={openBillingPortalAction}>
          <SubmitButton className="btn ghost wide" pendingLabel="Opening…" testId="manage-subscription">
            Manage or cancel subscription
          </SubmitButton>
        </form>
      ) : null}
      <ConnectCard mcpUrl={`${origin}/api/mcp`} token={revealed} active={status.active} prefix={status.prefix} connected={status.connected} returnTo="profile" />
      <details className="quiet-fold" open={!member.prefs.locked}>
        <summary>Edit your profile yourself</summary>
        <OnboardingForm member={member} />
      </details>
      <section className="stack tight">
        <div>
          <h2>Matchmaker</h2>
          <p className="help">Pause stops your matchmaker from saying anything new. Wipe clears bot-to-bot notes. You are only asked when there is a date.</p>
        </div>
        <form action={setPausedAction}>
          <input type="hidden" name="paused" value={member.botPaused ? "false" : "true"} />
          <SubmitButton className="btn ghost wide" pendingLabel="Saving…" testId="toggle-pause">
            {member.botPaused ? "Unpause matchmaker" : "Pause matchmaker"}
          </SubmitButton>
        </form>
        <WipeControl />
      </section>
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
