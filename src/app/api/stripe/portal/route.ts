import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { readStripeConfig } from "@/lib/billing/config";
import { billingPortalParams, safeReturnPath, stripeClient } from "@/lib/billing/stripe";
import { appOrigin } from "@/lib/http/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const member = await requireUser();
  const returnPath = safeReturnPath(new URL(request.url).searchParams.get("return"));
  const origin = appOrigin(await headers());
  const back = new URL(returnPath, origin);
  const config = readStripeConfig();
  if (!config || !member.stripeCustomerId) {
    if (config && !member.stripeCustomerId) back.searchParams.set("error", "Billing is not available for this account yet.");
    return NextResponse.redirect(back);
  }
  try {
    const session = await stripeClient(config).billingPortal.sessions.create(
      billingPortalParams(member.stripeCustomerId, `${origin}${returnPath}`),
    );
    if (!session.url) throw new Error("Portal session had no URL.");
    return NextResponse.redirect(session.url);
  } catch {
    back.searchParams.set("error", "Billing could not be opened. Try again.");
    return NextResponse.redirect(back);
  }
}
