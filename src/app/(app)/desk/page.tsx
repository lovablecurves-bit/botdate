import Link from "next/link";
import { requireOnboarded } from "@/lib/auth";

export const metadata = { title: "Activity" };

export default async function DeskIndexPage() {
  await requireOnboarded();
  return (
    <div className="stack" data-testid="bots-private">
      <header className="page-head">
        <h1>The bots talk in private</h1>
        <p className="lede">You don't see their messages. When a date is ready, it shows up in your notifications with who, why, and a time and place.</p>
      </header>
      <Link className="btn primary wide" href="/inbox">
        Open notifications
      </Link>
      <Link className="btn ghost wide" href="/members">
        Browse members
      </Link>
    </div>
  );
}
