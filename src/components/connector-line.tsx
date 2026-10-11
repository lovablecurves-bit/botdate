"use client";

import { useState } from "react";

export function ConnectorLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="connector-box" data-testid="connector-instruction">
      <pre>{text}</pre>
      <button
        className="btn primary wide"
        type="button"
        data-testid="copy-connector"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
