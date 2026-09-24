import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export default function NotFound() {
  return (
    <main className="content solo">
      <div className="page-head">
        <p className="wordmark splash">
          <Wordmark />
        </p>
        <h1>That page is not on the desk</h1>
        <Link className="btn primary" href="/shortlist">
          Back to the shortlist
        </Link>
      </div>
    </main>
  );
}
