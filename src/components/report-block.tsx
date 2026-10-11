"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { blockMemberAction, reportMemberAction } from "@/app/actions";

export function ReportBlock({ targetId, matchId }: { targetId: string; matchId: string }) {
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setNote(null);
    start(async () => {
      const result = await work();
      if (!result.ok) {
        setNote(result.error ?? "Something went wrong.");
        return;
      }
      setNote("Saved.");
      router.refresh();
    });
  }

  return (
    <div className="activity-actions" data-testid="report-block">
      <button className="btn ghost" type="button" disabled={pending} data-testid="report-member" onClick={() => run(() => reportMemberAction(targetId, matchId))}>
        Report
      </button>
      <button className="btn danger" type="button" disabled={pending} data-testid="block-member" onClick={() => run(() => blockMemberAction(targetId, matchId))}>
        Block
      </button>
      {note ? <p className="help">{note}</p> : null}
    </div>
  );
}
