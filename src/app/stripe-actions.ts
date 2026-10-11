"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { appOrigin } from "@/lib/http/origin";
import { checkoutSessionParams } from "@/lib/stripe/checkout";
import { getStripe } from "@/lib/stripe/client";
import { stripeConfig, trialDays } from "@/lib/stripe/config";

export async function startCheckoutAction() {
  const member = await requireUser();
  const config = stripeConfig();
  if (!config) redirect("/join?error=Membership+is+not+available+yet.");

  const origin = appOrigin(await headers());
  let url = "";
  try {
    const session = await getStripe(config.secretKey).checkout.sessions.create(
      checkoutSessionParams({
        memberId: member.id,
        priceId: config.priceId,
        customerId: member.stripeCustomerId,
        origin,
        trialPeriodDays: trialDays(),
      }),
    );
    if (!session.url) throw new Error("Stripe did not return a checkout link.");
    url = session.url;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe could not start checkout.";
    redirect(`/join?error=${encodeURIComponent(message.slice(0, 180))}`);
  }
  redirect(url);
}
