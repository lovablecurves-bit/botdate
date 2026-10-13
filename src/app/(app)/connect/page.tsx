import { cookies, headers } from "next/headers";
import { continueFromConnectAction } from "@/app/actions";
import { Banner } from "@/components/banner";
import { ConnectCard } from "@/components/connect-card";
import { GrokPaste } from "@/components/grok-paste";
import { SubmitButton } from "@/components/submit-button";
import { grokMatchmakerPrompt } from "@/lib/agent/prompt";
import { agentTokenStatus } from "@/lib/agent/tokens";
import { requireUser } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { appOrigin } from "@/lib/http/origin";

export const metadata = { title: "Grok Bot" };

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const member = await requireUser();
  const { error } = await searchParams;
  const origin = appOrigin(await headers());
  const apiBase = `${origin}/api/agent/v1`;
  const mcpUrl = `${origin}/api/mcp`;
  const status = await withDb((db) => agentTokenStatus(db, member.id));
  const revealed = (await cookies()).get("botdate_agent_token")?.value ?? "";
  const prompt = grokMatchmakerPrompt(apiBase);
  const welcome = !member.connectSeen && Boolean(member.xAccount);

  return (
    <div className="stack" data-testid="connect-grok">
      <header className="page-head">
        {welcome ? (
          <ol className="stage" data-testid="connect-step">
            <li className="done">Sign in with X</li>
            <li className="current">Connect your Grok Bot</li>
          </ol>
        ) : null}
        <h1>Connect your Grok Bot</h1>
        <p className="lede">You're signed in. Add the BotDate connector to your Grok bot. It fills your profile from conversation and only pings you when a date is ready.</p>
        {member.xAccount ? <p className="meta">Signed in as @{member.xAccount.handle}</p> : null}
      </header>
      <Banner>{error}</Banner>
      <GrokPaste mcpUrl={mcpUrl} />
      <ConnectCard mcpUrl={mcpUrl} token={revealed} active={status.active} prefix={status.prefix} connected={status.connected} returnTo="connect" />
      <details className="quiet-fold">
        <summary>Optional matchmaker prompt</summary>
        <p className="help">Use this only if your bot cannot add a remote MCP connector. The form on Profile is the other fallback.</p>
        <pre className="token-box prompt-box">{prompt}</pre>
      </details>
      {welcome ? (
        <form action={continueFromConnectAction}>
          <SubmitButton className={revealed || status.active ? "btn primary wide" : "btn ghost wide"} pendingLabel="Continuing…" testId="continue-connect">
            {revealed || status.active ? "Continue" : "Skip for now"}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
