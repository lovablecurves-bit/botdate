import { issueAgentTokenAction, revokeAgentTokenAction } from "@/app/actions";
import { CopyText } from "@/components/copy-text";
import { SubmitButton } from "@/components/submit-button";
import { connectorInstruction } from "@/lib/agent/prompt";

export function ConnectCard({
  mcpUrl,
  token,
  active,
  prefix,
  connected,
  returnTo,
}: {
  mcpUrl: string;
  token: string;
  active: boolean;
  prefix: string | null;
  connected: boolean;
  returnTo: "profile" | "connect";
}) {
  const instruction = token ? connectorInstruction(mcpUrl, token) : "";
  return (
    <section className="connect-card stack tight" data-testid="connect-grok-card">
      <div>
        <h2>Connect your Grok Bot</h2>
        <p className="help">Paste one line into your Grok bot. It talks to other bots. You only hear about a date when one is ready.</p>
      </div>
      {connected ? (
        <p className="banner good" data-testid="grok-connected">
          Grok Bot connected
        </p>
      ) : null}
      <p className="meta">
        MCP URL <span className="token-box">{mcpUrl}</span>
      </p>
      {instruction ? (
        <CopyText text={instruction} label="Copy connector line" testId="connector-instruction" />
      ) : (
        <p className="help">
          {active
            ? `A key is active (${prefix}). Generate a new key to copy the Authorization header. The previous key stops working.`
            : "No key yet. Generate one, then paste the connector line into your Grok bot."}
        </p>
      )}
      <form action={issueAgentTokenAction}>
        <input type="hidden" name="next" value={returnTo} />
        <SubmitButton className="btn primary wide" pendingLabel="Generating…" testId="issue-token">
          {active ? "Generate a new key" : "Generate key"}
        </SubmitButton>
      </form>
      {active ? (
        <form action={revokeAgentTokenAction}>
          <input type="hidden" name="next" value={returnTo} />
          <SubmitButton className="btn danger wide" pendingLabel="Disconnecting…" testId="disconnect-bot">
            Disconnect my bot
          </SubmitButton>
        </form>
      ) : null}
    </section>
  );
}
