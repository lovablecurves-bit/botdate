"use client";

import { useState } from "react";

export function CopyText({ text, label, testId }: { text: string; label: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack tight">
      <pre className="token-box prompt-box" data-testid={testId}>
        {text}
      </pre>
      <button
        className="btn ghost wide"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Copied" : label}
      </button>
    </div>
  );
}
