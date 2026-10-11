"use client";

import { useState } from "react";

export function CopyToken({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="stack tight">
      <p className="token-box" data-testid="agent-token">
        {token}
      </p>
      <button
        className="btn ghost wide"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(token);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : "Copy token"}
      </button>
    </div>
  );
}
