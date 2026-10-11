import { NextResponse } from "next/server";
import { withDb } from "@/lib/db/open";
import { waitlistCount } from "@/lib/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const count = await withDb((db) => waitlistCount(db));
  return NextResponse.json({ count }, { headers: { "Cache-Control": "no-store" } });
}
