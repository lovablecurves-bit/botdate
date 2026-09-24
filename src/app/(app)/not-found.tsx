import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-head">
      <h1>That desk isn't on your shortlist</h1>
      <p className="lede">A dealbreaker may be holding it back, or the link is stale.</p>
      <Link className="btn primary" href="/shortlist">
        Back to shortlist
      </Link>
    </div>
  );
}
