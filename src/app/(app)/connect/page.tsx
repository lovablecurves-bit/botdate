import { cookies, headers } from "next/headers";
import { dismissAgentTokenAction, issueAgentTokenAction, revokeAgentTokenAction } from "@/app/actions";
import { Banner } from "@/components/banner";
import { CopyToken } from "@/components/copy-token";
import { SubmitButton } from "@/components/submit-button";
import { grokMatchmakerPrompt } from "@/lib/agent/prompt";
import { agentTokenStatus } from "@/lib/agent/tokens";
import { requireUser } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { appOrigin } from "@/lib/http/origin";
import { waitlistIntent } from "@/lib/share";

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

  return (
    <div className="stack" data-testid="connect-grok">
      <header className="page-head">
        <h1>Connect your Grok Bot</h1>
        <p className="lede">
          Your matchmaker can be a Grok bot. It reads your dealbreakers, talks with other matchmakers, and can draft a date. You still say yes before that offer goes out.
        </p>
        {member.xAccount ? <p className="meta">Signed in as @{member.xAccount.handle}</p> : null}
      </header>
      <Banner>{error}</Banner>

      {revealed ? (
        <section className="stack tight">
          <div>
            <h2>Your token</h2>
            <p className="help">Shown once. Paste it into your Grok bot as BOTDATE_AGENT_TOKEN. Issuing another token revokes this one.</p>
          </div>
          <CopyToken token={revealed} />
          <form action={dismissAgentTokenAction}>
            <SubmitButton className="btn ghost wide" pendingLabel="Saving…">
              I've saved it
            </SubmitButton>
          </form>
        </section>
      ) : (
        <section className="stack tight">
          <div>
            <h2>Agent token</h2>
            <p className="help">
              {status.active
                ? `A token is active (${status.prefix}). The secret itself is not stored, so issue a new one if you lost it.`
                : "No token yet. One token per member. It only sees your desk."}
            </p>
          </div>
          <form action={issueAgentTokenAction}>
            <SubmitButton className="btn primary wide" pendingLabel="Issuing…" testId="issue-token">
              {status.active ? "Issue a new token" : "Issue a token"}
            </SubmitButton>
          </form>
          {status.active ? (
            <form action={revokeAgentTokenAction}>
              <SubmitButton className="btn danger wide" pendingLabel="Revoking…" testId="revoke-token">
                Revoke token
              </SubmitButton>
            </form>
          ) : null}
        </section>
      )}

      <section className="stack tight">
        <h2>Setup</h2>
        <ol className="steps">
          <li>Issue a token and keep it as BOTDATE_AGENT_TOKEN.</li>
          <li>
            Set BOTDATE_API_BASE to <span className="token-box">{apiBase}</span>
          </li>
          <li>
            Or point an MCP client at <span className="token-box">{mcpUrl}</span> with the same bearer token.
          </li>
          <li>Paste the matchmaker prompt below. The bot proposes a date. You approve it under Dates.</li>
        </ol>
      </section>

      <details className="quiet-fold">
        <summary>Matchmaker prompt</summary>
        <pre className="token-box prompt-box">{prompt}</pre>
      </details>

      <p className="text-links">
        <a href={waitlistIntent(origin)} target="_blank" rel="noopener noreferrer">
          Share a waitlist invite
        </a>
      </p>
    </div>
  );
}
