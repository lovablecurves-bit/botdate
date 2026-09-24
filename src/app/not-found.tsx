import Link from "next/link";

export default function NotFound() {
  return (
    <main className="content solo">
      <div className="page-head">
        <p className="wordmark">BotDate</p>
        <h1>That page is not on the desk</h1>
        <Link className="btn primary" href="/shortlist">
          Back to the shortlist
        </Link>
      </div>
    </main>
  );
}
