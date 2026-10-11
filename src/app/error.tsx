"use client";

import { Wordmark } from "@/components/wordmark";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="content solo">
      <div className="page-head">
        <p className="wordmark splash">
          <Wordmark />
        </p>
        <h1>The desk hit a snag</h1>
        <p className="lede">Refresh the page and try again.</p>
        <button className="btn primary" type="button" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
