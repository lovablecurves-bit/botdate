"use client";

import { useState } from "react";
import { wipeMemoryAction } from "@/app/actions";

export function WipeControl() {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button className="btn danger wide" type="button" onClick={() => setArmed(true)} data-testid="wipe-memory">
        Wipe bot memory
      </button>
    );
  }
  return (
    <form action={wipeMemoryAction} className="stack tight">
      <p className="help">This deletes bot-to-bot notes on your desks. Human chat stays.</p>
      <div className="decision">
        <button className="btn danger solid wide" type="submit" data-testid="confirm-wipe">
          Wipe memory now
        </button>
        <button className="btn ghost" type="button" onClick={() => setArmed(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
