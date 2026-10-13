"use client";

import { useRef, useState } from "react";
import { grokBotConnectLink } from "@/lib/agent/connect-link";

function selectField(field: HTMLInputElement | null) {
  if (!field) return;
  field.focus();
  field.select();
  try {
    field.setSelectionRange(0, field.value.length);
  } catch {
    // Some in-app browsers reject selection on a readonly field. The text stays visible.
  }
}

function copyFromField(field: HTMLInputElement | null): boolean {
  selectField(field);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

/** Try the app scheme in a new context so this page, and the MCP URL, stay put. */
function tryGrokBotLink(href: string) {
  try {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    // The URL under the button is the fallback.
  }
}

export function ConnectGrokButton({ mcpUrl }: { mcpUrl: string }) {
  const fieldRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  function onCopy() {
    const field = fieldRef.current;
    // Select first, while the tap is still a user gesture. In-app browsers often
    // reject clipboard.writeText, and that rejection can arrive too late to select.
    selectField(field);
    const synced = copyFromField(field);
    if (synced) setCopied(true);
    const writer = navigator.clipboard?.writeText?.(mcpUrl);
    if (!writer) return;
    void writer.then(
      () => setCopied(true),
      () => setCopied(synced),
    );
  }

  return (
    <details
      className="connect-reveal"
      data-testid="connect-grok-reveal"
      onToggle={(event) => {
        if (!event.currentTarget.open) {
          setCopied(false);
          return;
        }
        window.requestAnimationFrame(() => tryGrokBotLink(grokBotConnectLink(mcpUrl)));
      }}
    >
      <summary className="btn primary wide" data-testid="connect-grok-bot">
        Connect your Grok Bot
      </summary>
      <div className="connect-fallback" data-testid="mcp-fallback">
        <p className="paste-line">Paste this into your Grok Bot to connect.</p>
        <input
          ref={fieldRef}
          className="mcp-url-field"
          type="text"
          readOnly
          value={mcpUrl}
          aria-label="MCP connector URL"
          data-testid="mcp-url"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.currentTarget.select()}
        />
        <button className="btn primary wide" type="button" data-testid="copy-mcp-url" onClick={onCopy}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </details>
  );
}
