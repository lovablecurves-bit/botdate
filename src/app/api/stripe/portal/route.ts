import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { appOrigin } from "@/lib/http/origin";
import { billingPortalParams } from "@/lib/stripe/checkout";
import { getStripe } from "@/lib/stripe/client";
import { stripeConfig } from "@/lib/stripe/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const member = await requireUser();
  const origin = appOrigin(await headers());
  const back = new URL("/onboarding", origin);
  const config = stripeConfig();
  if (!config || !member.stripeCustomerId) {
    back.searchParams.set("error", "Billing is not available for this account yet.");
    return NextResponse.redirect(back);
  }

  try {
    const session = await getStripe(config.secretKey).billingPortal.sessions.create(
      billingPortalParams(member.stripeCustomerId, back.toString()),
    );
    return NextResponse.redirect(session.url);
  } catch {
    back.searchParams.set("error", "Stripe could not open the billing portal.");
    return NextResponse.redirect(back);
  }
}
