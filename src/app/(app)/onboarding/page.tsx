import { resetDemoAction, setPausedAction } from "@/app/actions";
import { Banner } from "@/components/banner";
import { OnboardingForm } from "@/components/onboarding-form";
import { SubmitButton } from "@/components/submit-button";
import { WipeControl } from "@/components/wipe-control";
import { requireUser } from "@/lib/auth";

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
  const query = await searchParams;
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
        <form action={setPausedAction}>
          <input type="hidden" name="paused" value={member.botPaused ? "false" : "true"} />
          <SubmitButton className="btn ghost wide" pendingLabel="Saving…" testId="toggle-pause">
            {member.botPaused ? "Unpause matchmaker" : "Pause matchmaker"}
          </SubmitButton>
        </form>
        <WipeControl />
      </section>
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
    </div>
  );
}
