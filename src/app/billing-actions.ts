"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { postLoginPath, requireUser } from "@/lib/auth";
import { needsPaywall } from "@/lib/billing/access";
import { readStripeConfig } from "@/lib/billing/config";
import { appOrigin } from "@/lib/http/origin";
import { checkoutSessionParams, stripeClient } from "@/lib/billing/stripe";

export async function startCheckoutAction() {
  const member = await requireUser();
  const config = readStripeConfig();
  if (!config || !needsPaywall(member)) redirect(postLoginPath(member));
  const origin = appOrigin(await headers());
  let destination = "";
  try {
    const session = await stripeClient(config).checkout.sessions.create(
      checkoutSessionParams({
        memberId: member.id,
        priceId: config.priceId,
        customerId: member.stripeCustomerId,
        origin,
      }),
    );
    destination = session.url ?? "";
  } catch {
    redirect("/join?error=Checkout+could+not+start.+Try+again.");
  }
  if (!destination) redirect("/join?error=Checkout+could+not+start.+Try+again.");
  redirect(destination);
}
