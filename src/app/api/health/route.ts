import { NextResponse } from "next/server";
import { databaseHealth } from "@/lib/db/open";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Database mode for this process. The body is `ok` plus `turso`, `memory`, or `error` — never the URL or token. */
export async function GET() {
  const report = await databaseHealth();
  return NextResponse.json(report.body, {
    status: report.status,
    headers: { "Cache-Control": "no-store" },
  });
}
