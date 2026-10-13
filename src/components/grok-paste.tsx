"use client";

import { useRef, useState } from "react";
import { grokConnectMessage } from "@/lib/agent/onboarding";

function selectField(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.focus();
  field.select();
  try {
    field.setSelectionRange(0, field.value.length);
  } catch {
    // Some in-app browsers reject selection on a readonly field. The text stays visible.
  }
}

function copyFromField(field: HTMLTextAreaElement | null): boolean {
  selectField(field);
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

/** The one sentence a member pastes into Grok. Copy shows Copied! after a successful copy. */
export function GrokPaste({ mcpUrl }: { mcpUrl: string }) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const message = grokConnectMessage(mcpUrl);

  function onCopy() {
    const field = fieldRef.current;
    // Select first, while the tap is still a user gesture. In-app browsers often
    // reject clipboard.writeText, and that rejection can arrive too late to select.
    selectField(field);
    const synced = copyFromField(field);
    if (synced) setCopied(true);
    const writer = navigator.clipboard?.writeText?.(message);
    if (!writer) return;
    void writer.then(
      () => setCopied(true),
      () => setCopied(synced),
    );
  }

  return (
    <div className="grok-paste" data-testid="grok-paste">
      <p className="paste-line">Paste this into your Grok Bot.</p>
      <textarea
        ref={fieldRef}
        className="matchmaker-message"
        readOnly
        value={message}
        aria-label="Message for your Grok Bot"
        data-testid="matchmaker-message"
        rows={4}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onFocus={(event) => event.currentTarget.select()}
        onClick={(event) => event.currentTarget.select()}
      />
      <button className="btn primary wide" type="button" data-testid="copy-matchmaker-message" onClick={onCopy}>
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
