import { NextResponse } from "next/server";
import { listSignups } from "@/lib/admin/signups";
import { withDb } from "@/lib/db/open";
import { adminTokenAuthorized } from "@/lib/x/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!adminTokenAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const report = await withDb((db) => listSignups(db));
  return NextResponse.json(report, { headers: NO_STORE });
}
