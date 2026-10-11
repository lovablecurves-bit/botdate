import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { needsConnectPrompt, requireUser } from "@/lib/auth";
import { withDb } from "@/lib/db/open";
import { countOpenOffers, listRoster } from "@/lib/domain";
import { demoMode } from "@/lib/x/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireUser();
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (needsConnectPrompt(member) && pathname && pathname !== "/connect") redirect("/connect");
  const showDemoSwitcher = demoMode();
  const { roster, pending } = await withDb((db) => ({
    roster: showDemoSwitcher ? listRoster(db) : [],
    pending: countOpenOffers(db, member.id),
  }));
  return (
    <Shell member={member} roster={roster} pending={pending} demoSwitcher={showDemoSwitcher}>
      {children}
    </Shell>
  );
}
