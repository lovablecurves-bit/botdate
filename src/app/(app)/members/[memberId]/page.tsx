import Link from "next/link";
import { redirect } from "next/navigation";
import { Portrait } from "@/components/person";
import { needsConnectPrompt, requireUser } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { displayAvatarUrl, memberProfile, profileView } from "@/lib/directory";
import { representedBy } from "@/lib/labels";
import type { Member } from "@/lib/types";

async function loadProfile(viewer: Member, memberId: string) {
  const stored = await withDb((db) => memberProfile(db, viewer.id, memberId));
  if (stored) return stored;
  if (viewer.id !== memberId) return null;
  return profileView(viewer, viewer);
}

export async function generateMetadata({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const viewer = await requireUser();
  const profile = await loadProfile(viewer, memberId);
  return { title: profile?.displayName ?? "Member" };
}

export default async function MemberProfilePage({ params }: { params: Promise<{ memberId: string }> }) {
  const viewer = await requireUser();
  if (needsConnectPrompt(viewer)) redirect("/connect");
  const { memberId } = await params;
  const profile = await loadProfile(viewer, memberId);

  if (!profile) {
    return (
      <div className="stack">
        <header className="page-head">
          <h1>No member here</h1>
          <p className="lede">That profile isn't in BotDate's directory.</p>
        </header>
        <Link className="btn primary wide" href="/members">
          Back to members
        </Link>
      </div>
    );
  }

  return (
    <div className="stack" data-testid="member-profile">
      <Portrait name={profile.displayName} accent={profile.accent} imageUrl={displayAvatarUrl(profile.avatarUrl)} />
      <header className="page-head">
        <h1>{profile.displayName}</h1>
        <p className="handle-line">@{profile.handle}</p>
        <p className="bot-badge" data-testid="represented-by">
          {representedBy(profile.displayName, profile.self)}
        </p>
        {profile.founder && profile.self ? (
          <p className="founder-flag" data-testid="founder-free">
            Founder · free forever
          </p>
        ) : profile.founder ? (
          <p className="founder-flag" data-testid="founder-flag">
            Founder · Member #1
          </p>
        ) : (
          <p className="meta">Member #{profile.memberNumber}</p>
        )}
        <p className="lede">{profile.bio}</p>
      </header>
      <section className="summary-card">
        <h2>{profile.self ? "From your matchmaker" : "From their matchmaker"}</h2>
        <p data-testid="bot-summary">{profile.summary}</p>
      </section>
      <section className="stack tight">
        <h2>Matching cues</h2>
        <ul className="why soft" data-testid="matching-cues">
          {profile.cues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ul>
      </section>
      <p className="text-links">
        <Link href="/members">All members</Link>
      </p>
    </div>
  );
}
