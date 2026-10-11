import { issueAgentTokenAction, revokeAgentTokenAction } from "@/app/actions";
import { ConnectorLine } from "@/components/connector-line";
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
      {connected ? (
        <p className="banner good" data-testid="grok-connected">
          Grok Bot connected
        </p>
      ) : null}
      <h2>Copy connector line</h2>
      {instruction ? (
        <ConnectorLine text={instruction} />
      ) : (
        <p className="help">
          {active
            ? `A key is active (${prefix}). Generate a new key to copy the connector line. The previous key stops working.`
            : "No key yet. Generate one, then the connector line shows up here."}
        </p>
      )}
      <details className="quiet-fold" data-testid="connector-technical">
        <summary>Show technical details</summary>
        <p className="meta">
          MCP URL <span className="token-box">{mcpUrl}</span>
        </p>
      </details>
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
