import Link from "next/link";
import { Portrait } from "@/components/person";
import { Wordmark } from "@/components/wordmark";
import { memberHome, requireUser } from "@/lib/auth";
import { displayAvatarUrl } from "@/lib/directory";

export const metadata = { title: "Profile" };

/** The signed-in member, read from BotDate's database. No second call to X. */
export default async function ProfilePage() {
  const member = await requireUser();
  const handle = member.xAccount?.handle ?? "";
  const avatar = displayAvatarUrl(member.xAccount?.avatarUrl);

  return (
    <main className="content solo" data-testid="own-profile">
      <header className="page-head">
        <p className="wordmark splash">
          <Wordmark />
        </p>
        <Portrait name={member.displayName} accent={member.profile.accent} imageUrl={avatar} />
        <h1>{member.displayName}</h1>
        {handle ? <p className="handle-line">@{handle}</p> : null}
        <p className="lede">{member.profile.bio}</p>
      </header>
      <Link className="btn primary wide" href={memberHome(member)}>
        Continue
      </Link>
    </main>
  );
}
