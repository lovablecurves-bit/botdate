import { Shell } from "@/components/shell";
import { requireUser } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { countOpenOffers, listRoster } from "@/lib/domain";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireUser();
  const { roster, pending } = await withDb((db) => ({
    roster: listRoster(db),
    pending: countOpenOffers(db, member.id),
  }));
  return (
    <Shell member={member} roster={roster} pending={pending}>
      {children}
    </Shell>
  );
}
