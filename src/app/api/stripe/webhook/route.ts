import { NextResponse } from "next/server";
import { withDb } from "@/lib/db/open";
import { stripeConfig } from "@/lib/stripe/config";
import { enrichCheckoutWrite } from "@/lib/stripe/fulfill";
import { applyMembership, membershipWriteFromEvent } from "@/lib/stripe/membership";
import { verifyWebhook } from "@/lib/stripe/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = stripeConfig();
  if (!config) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const payload = await request.text();
  let event;
  try {
    event = verifyWebhook(payload, signature, config.webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  const parsed = membershipWriteFromEvent(event);
  if (!parsed) return NextResponse.json({ received: true });

  const write =
    event.type === "checkout.session.completed" ? await enrichCheckoutWrite(parsed, config.secretKey) : parsed;

  try {
    await withDb((db) => applyMembership(db, write));
  } catch {
    return NextResponse.json({ error: "Could not store the subscription." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
