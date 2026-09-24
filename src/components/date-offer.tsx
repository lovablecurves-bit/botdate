"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveOfferAction, passOfferAction, tweakOfferAction } from "@/app/actions";

export function DateOffer({
  matchId,
  proposalId,
  personName,
  whenLabel,
  local,
  place,
  note,
}: {
  matchId: string;
  proposalId: string;
  personName: string;
  whenLabel: string;
  local: string;
  place: string;
  note: string;
}) {
  const router = useRouter();
  const [tweaking, setTweaking] = useState(false);
  const [when, setWhen] = useState(local);
  const [where, setWhere] = useState(place);
  const [comment, setComment] = useState(note);
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
      setTweaking(false);
      router.refresh();
    });
  }

  return (
    <section className="draft" aria-label={`Date offer for ${personName}`}>
      <div className="stack tight">
        <p className="draft-flag">Date offer</p>
        <h2>{personName}</h2>
      </div>
      {tweaking ? (
        <div className="stack tight">
          <label className="field">
            <span>When (Pacific)</span>
            <input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} />
          </label>
          <label className="field">
            <span>Where</span>
            <input value={where} maxLength={120} onChange={(event) => setWhere(event.target.value)} />
          </label>
          <label className="field">
            <span>Note</span>
            <textarea value={comment} maxLength={280} onChange={(event) => setComment(event.target.value)} />
          </label>
        </div>
      ) : (
        <div className="stack tight">
          <p className="when">{whenLabel}</p>
          <p className="place">{place}</p>
          {note ? <p>{note}</p> : null}
        </div>
      )}
      <p className="help">Your matchmakers agreed it is time. This is the only thing that needs you.</p>
      {error ? (
        <p className="banner bad" role="alert">
          {error}
        </p>
      ) : null}
      <div className="draft-actions">
        {tweaking ? (
          <button className="btn primary" type="button" disabled={pending} data-testid="save-tweak" onClick={() => run(() => tweakOfferAction(matchId, proposalId, when, where, comment))}>
            Approve this plan
          </button>
        ) : (
          <button className="btn primary" type="button" disabled={pending} data-testid="approve-offer" onClick={() => run(() => approveOfferAction(matchId, proposalId))}>
            Approve
          </button>
        )}
        {tweaking ? (
          <button className="btn ghost" type="button" disabled={pending} onClick={() => setTweaking(false)}>
            Cancel
          </button>
        ) : (
          <button className="btn ghost" type="button" disabled={pending} data-testid="tweak-offer" onClick={() => setTweaking(true)}>
            Tweak
          </button>
        )}
        <button className="btn danger" type="button" disabled={pending} data-testid="pass-offer" onClick={() => run(() => passOfferAction(matchId, proposalId))}>
          Pass
        </button>
      </div>
    </section>
  );
}
