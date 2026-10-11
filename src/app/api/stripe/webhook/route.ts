import { NextResponse } from "next/server";
import { readStripeConfig } from "@/lib/billing/config";
import { applyStripeEvent, readVerifiedEvent } from "@/lib/billing/stripe";
import { withDb } from "@/lib/db/open";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = readStripeConfig();
  if (!config) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });

  // Stripe signs the exact request bytes. request.text() is that raw body.
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  let event;
  try {
    event = readVerifiedEvent(rawBody, signature, config);
  } catch {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  try {
    await withDb((db) => applyStripeEvent(db, event));
  } catch {
    return NextResponse.json({ error: "Webhook could not be stored." }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
