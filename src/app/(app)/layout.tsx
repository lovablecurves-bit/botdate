import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { needsConnectPrompt, requireUser } from "@/lib/auth";
import { isFounderAccount, needsPaywall } from "@/lib/billing/access";
import { withDb } from "@/lib/db/open";
import { countOpenOffers, listRoster } from "@/lib/domain";
import { needsPaywall as membershipRequired } from "@/lib/stripe/access";
import { ensureRealMemberNumbers } from "@/lib/x/account";
import { demoMode } from "@/lib/x/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireUser();
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (isFounderAccount(member) && pathname === "/subscribe") redirect("/onboarding");
  if (needsConnectPrompt(member) && pathname && pathname !== "/connect") redirect("/connect");
  const paywalled = needsPaywall(member) || membershipRequired(member);
  const paywallAllowed = pathname === "/subscribe" || pathname === "/onboarding" || pathname === "/connect";
  if (paywalled && pathname && !paywallAllowed) redirect(membershipRequired(member) ? "/join" : "/subscribe");
  const showDemoSwitcher = demoMode();
  const { roster, pending } = await withDb((db) => {
    ensureRealMemberNumbers(db);
    return {
      roster: showDemoSwitcher ? listRoster(db) : [],
      pending: countOpenOffers(db, member.id),
    };
  });
  return (
    <Shell member={member} roster={roster} pending={pending} demoSwitcher={showDemoSwitcher} founder={isFounderAccount(member)}>
      {children}
    </Shell>
  );
}
