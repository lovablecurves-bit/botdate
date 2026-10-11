import { ShootShot } from "@/components/shoot-shot";
import { requireUser } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { crushHandlePicks, ensureMemberReferral } from "@/lib/shot";

export const metadata = { title: "Shoot your shot" };

export default async function ShotPage() {
  const member = await requireUser();
  const { code, picks } = await withDb((db) => ({
    code: ensureMemberReferral(db, member.id),
    picks: crushHandlePicks(db, member.id),
  }));
  return (
    <div className="stack">
      <header className="page-head">
        <h1>Shoot your shot 💘</h1>
        <p className="lede">Type the X handle you&apos;re crushing on, or pick one. Your bot writes the note. You press Post.</p>
      </header>
      <ShootShot code={code} picks={picks} />
    </div>
  );
}
