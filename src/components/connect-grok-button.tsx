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

/** Try the app scheme without navigating this page away from the MCP URL. */
function tryGrokBotLink(href: string) {
  try {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:absolute;width:0;height:0;border:0;opacity:0";
    frame.src = href;
    document.body.appendChild(frame);
    window.setTimeout(() => frame.remove(), 1500);
  } catch {
    // The URL under the button is the fallback.
  }
}

export function ConnectGrokButton({ mcpUrl }: { mcpUrl: string }) {
  const fieldRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  function onCopy() {
    const field = fieldRef.current;
    const synced = copyFromField(field);
    const writer = navigator.clipboard?.writeText?.(mcpUrl);
    if (!writer) {
      setCopied(synced);
      if (!synced) selectField(field);
      return;
    }
    void writer.then(
      () => setCopied(true),
      () => {
        setCopied(synced);
        if (!synced) selectField(field);
      },
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
