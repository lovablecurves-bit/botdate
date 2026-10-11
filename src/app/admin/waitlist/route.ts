import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withDb } from "@/lib/db/open";
import { getMember } from "@/lib/domain";
import { waitlistCsv, waitlistExport } from "@/lib/waitlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = (await cookies()).get("botdate_uid")?.value;
  if (!id) return NextResponse.redirect(new URL("/login", request.url));

  const result = await withDb((db) => {
    const member = getMember(db, id);
    if (!member?.founder) return { member, csv: null as string | null };
    return { member, csv: waitlistCsv(db) };
  });

  if (!result.member) return NextResponse.redirect(new URL("/api/auth/clear", request.url));

  const exported = waitlistExport(result.member, result.csv ?? "");
  if (exported.status === 403) {
    return new NextResponse(exported.body, {
      status: 403,
      headers: { "Content-Type": exported.contentType, "Cache-Control": "no-store" },
    });
  }

  return new NextResponse(exported.body, {
    status: 200,
    headers: {
      "Content-Type": exported.contentType,
      "Content-Disposition": `attachment; filename="${exported.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
