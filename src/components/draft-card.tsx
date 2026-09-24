"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveDraftAction, editDraftAction, killDraftAction } from "@/app/actions";

export function DraftCard({ messageId, initialBody, paused }: { messageId: string; initialBody: string; paused: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setEditing(false);
      setArmed(false);
      router.refresh();
    });
  }

  const payload = editing ? body : initialBody;

  return (
    <section className="draft" aria-label="Draft waiting for approval">
      <div className="draft-head">
        <p className="eyebrow">Needs your approval</p>
        <p className="help">This speaks for you. It is not sent until you approve it.</p>
      </div>
      {editing ? (
        <label className="field">
          <span>Edit draft</span>
          <textarea value={body} maxLength={800} onChange={(event) => setBody(event.target.value)} />
        </label>
      ) : (
        <blockquote>{initialBody}</blockquote>
      )}
      <p className="help count">{payload.trim().length}/800</p>
      {paused ? <p className="banner bad">Your matchmaker is paused. Unpause on Profile before this can send.</p> : null}
      {error ? (
        <p className="banner bad" role="alert">
          {error}
        </p>
      ) : null}
      <div className="actions">
        {editing ? (
          <button className="btn ghost" type="button" disabled={pending} onClick={() => run(() => editDraftAction(messageId, body))} data-testid="save-draft">
            Save edit
          </button>
        ) : (
          <button className="btn ghost" type="button" disabled={pending} onClick={() => setEditing(true)} data-testid="edit-draft">
            Edit
          </button>
        )}
        <button
          className="btn primary"
          type="button"
          disabled={pending || paused || payload.trim().length === 0}
          onClick={() => run(() => approveDraftAction(messageId, payload))}
          data-testid="approve-draft"
        >
          Approve and send
        </button>
        {armed ? (
          <button className="btn danger" type="button" disabled={pending} onClick={() => run(() => killDraftAction(messageId))} data-testid="confirm-kill">
            Confirm kill
          </button>
        ) : (
          <button className="btn danger" type="button" disabled={pending} onClick={() => setArmed(true)} data-testid="kill-draft">
            Kill draft
          </button>
        )}
      </div>
    </section>
  );
}
