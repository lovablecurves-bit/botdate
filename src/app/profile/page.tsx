import { redirect } from "next/navigation";
import { issueAgentTokenAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { Wordmark } from "@/components/wordmark";
import { agentTokenStatus } from "@/lib/agent/tokens";
import { checkoutDestination, requireUser } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { displayAvatarUrl } from "@/lib/directory";

export const metadata = { title: "You're in" };

/** Signed-in home. Stored X photo and handle only. No profile form. */
export default async function ProfilePage() {
  const member = await requireUser();
  const checkout = checkoutDestination(member);
  if (checkout) redirect(checkout);
  const handle = member.xAccount?.handle ?? "";
  const avatar = displayAvatarUrl(member.xAccount?.avatarUrl);
  const status = await withDb((db) => agentTokenStatus(db, member.id));

  return (
    <main className="youre-in" data-testid="post-login-card">
      <p className="wordmark">
        <Wordmark />
      </p>
      <h1>You're in 💘</h1>
      <p className="lede">🔒 Only you see this. Your bot does the rest.</p>
      {avatar ? <img className="x-face" src={avatar} alt="" data-testid="x-profile-photo" /> : null}
      {handle ? (
        <p className="handle-line" data-testid="x-handle">
          @{handle}
        </p>
      ) : null}
      <form action={issueAgentTokenAction}>
        <input type="hidden" name="next" value="profile" />
        <SubmitButton className="btn primary wide" pendingLabel="Connecting…" testId="connect-grok-bot">
          Connect your Grok Bot
        </SubmitButton>
      </form>
      <p className="bot-status" data-testid="bot-status">
        {status.active ? "Bot connected" : "Not connected"}
      </p>
    </main>
  );
}
