import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConnectGrokButton } from "@/components/connect-grok-button";
import { Wordmark } from "@/components/wordmark";
import { isBotConnected } from "@/lib/agent/connection";
import { checkoutDestination, requireUser } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { displayAvatarUrl } from "@/lib/directory";
import { appOrigin } from "@/lib/http/origin";

export const metadata = { title: "You're in" };

/** Signed-in home. Stored X photo and handle only. No profile form. */
export default async function ProfilePage() {
  const member = await requireUser();
  const checkout = checkoutDestination(member);
  if (checkout) redirect(checkout);
  const handle = member.xAccount?.handle ?? "";
  const avatar = displayAvatarUrl(member.xAccount?.avatarUrl);
  const connected = await withDb((db) => isBotConnected(db, member.id));
  const mcpUrl = `${appOrigin(await headers())}/api/mcp`;

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
      <ConnectGrokButton mcpUrl={mcpUrl} />
      <p className="bot-status" data-testid="bot-status">
        {connected ? "Bot connected" : "Not connected yet"}
      </p>
    </main>
  );
}
