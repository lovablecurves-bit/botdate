"use client";

import { useMemo, useState } from "react";
import { composeShot, shotTemplate } from "@/lib/share";

export function ShootShot({ code, picks }: { code: string; picks: string[] }) {
  const [handle, setHandle] = useState("");
  const [message, setMessage] = useState("");
  const shot = useMemo(() => composeShot({ handle, code, message }), [handle, code, message]);
  const previewHandle = "error" in shot ? "" : shot.handle;
  const placeholder = previewHandle ? shotTemplate(previewHandle) : "Your bot's line, or leave this blank for the template.";

  return (
    <section className="stack" data-testid="shoot-shot">
      <label className="field">
        <span>Their X handle</span>
        <input
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="@crush"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={16}
          data-testid="shot-handle"
          list="crush-handles"
        />
      </label>
      {picks.length > 0 ? (
        <div className="activity-actions" data-testid="shot-picks">
          {picks.map((pick) => (
            <button key={pick} type="button" className={handle.replace(/^@/, "") === pick ? "btn primary" : "btn ghost"} data-testid="shot-pick" onClick={() => setHandle(pick)}>
              @{pick}
            </button>
          ))}
        </div>
      ) : null}
      <datalist id="crush-handles">
        {picks.map((pick) => (
          <option key={pick} value={pick} />
        ))}
      </datalist>
      <label className="field">
        <span>Message</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={placeholder}
          maxLength={240}
          data-testid="shot-message"
        />
      </label>
      <p className="help">Leave the message blank and the template is used. @BotDateApp and your referral link are added either way. Nothing is sent until you press Post.</p>
      {"error" in shot ? (
        <p className="help" data-testid="shot-error">
          {handle.trim() ? shot.error : "Type a handle or pick one."}
        </p>
      ) : (
        <div className="stack tight">
          <p className="token-box" data-testid="shot-preview">
            {shot.text}
          </p>
          <a className="btn primary wide" href={shot.intentUrl} target="_blank" rel="noopener noreferrer" data-testid="shot-post">
            Post on X
          </a>
        </div>
      )}
    </section>
  );
}
