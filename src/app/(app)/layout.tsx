import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db/open";
import { countMyDrafts, listRoster } from "@/lib/domain";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireUser();
  const db = getDb();
  return (
    <Shell member={member} roster={listRoster(db)} pending={countMyDrafts(db, member.id)}>
      {children}
    </Shell>
  );
}
