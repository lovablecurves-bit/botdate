import { NextResponse } from "next/server";
import { PUBLIC_WAITLIST_LINE } from "@/lib/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public on purpose. The signup count stays in the founder CSV. */
export async function GET() {
  return NextResponse.json({ message: PUBLIC_WAITLIST_LINE }, { headers: { "Cache-Control": "no-store" } });
}
