import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { resetDatabase } from "./db/seed";
import { SYNCED_TABLES, openDatabase } from "./db/open";
import { SCHEMA_SQL, waitlistSignups } from "./db/schema";
import { guestLoginUrl, isOpenPath } from "./http/public";
import {
  founderMayExport,
  joinWaitlist,
  PUBLIC_WAITLIST_LINE,
  waitlistCount,
  waitlistCsv,
  waitlistExport,
} from "./waitlist";

test("the waitlist table is created with the schema and copied with Turso", () => {
  assert.match(SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS waitlist/);
  assert.equal(SYNCED_TABLES.includes("waitlist"), true);
  assert.equal(isOpenPath("/api/waitlist/count"), true);
  assert.equal(isOpenPath("/admin/waitlist"), false);
});

test("a guest login redirect keeps a referral code", () => {
  assert.equal(guestLoginUrl("https://botdate.example/?ref=Ab12cd34"), "https://botdate.example/login?ref=ab12cd34");
  assert.equal(guestLoginUrl("https://botdate.example/shortlist?ref=no"), "https://botdate.example/login");
  assert.equal(guestLoginUrl("https://botdate.example/members?ref=bad%20code"), "https://botdate.example/login");
});

test("the public waitlist hides the count and the place in line", () => {
  assert.equal(PUBLIC_WAITLIST_LINE, "Invite-only · Austin opening first");
  assert.equal(/\d/.test(PUBLIC_WAITLIST_LINE), false);
  const root = path.resolve(import.meta.dirname, "../..");
  const login = fs.readFileSync(path.join(root, "src/app/login/page.tsx"), "utf8");
  assert.match(login, /PUBLIC_WAITLIST_LINE/);
  assert.equal(login.includes("You're #"), false);
  assert.equal(login.includes("waitlistCount"), false);
  assert.equal(login.includes("people waiting"), false);
  const route = fs.readFileSync(path.join(root, "src/app/api/waitlist/count/route.ts"), "utf8");
  assert.equal(route.includes("waitlistCount"), false);
  assert.match(route, /PUBLIC_WAITLIST_LINE/);
});

test("joining validates email and handle, blocks duplicates, and tracks referrals", async () => {
  const ctx = await openDatabase(":memory:");
  assert.equal(waitlistCount(ctx), 0);

  const missing = joinWaitlist(ctx, { email: "not-an-email" });
  assert.equal(missing.ok, false);
  const badHandle = joinWaitlist(ctx, { email: "ada@example.com", xHandle: "has space" });
  assert.equal(badHandle.ok, false);
  assert.equal(waitlistCount(ctx), 0);

  const first = joinWaitlist(ctx, { email: " Ada@Example.com ", xHandle: "@Ada_Bot" });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.already, false);
  assert.equal(first.entry.position, 1);
  assert.equal(first.entry.email, "ada@example.com");
  assert.equal(first.entry.xHandle, "Ada_Bot");
  assert.equal(first.entry.referredBy, null);
  assert.equal(waitlistCount(ctx), 1);

  const sameHandle = joinWaitlist(ctx, { email: "other@example.com", xHandle: "ada_bot" });
  assert.equal(sameHandle.ok, false);
  if (!sameHandle.ok) assert.match(sameHandle.error, /handle/i);
  assert.equal(waitlistCount(ctx), 1);

  const duplicate = joinWaitlist(ctx, { email: "ada@example.com", xHandle: "@someone", ref: "notacode" });
  assert.equal(duplicate.ok, true);
  if (!duplicate.ok) return;
  assert.equal(duplicate.already, true);
  assert.equal(duplicate.entry.position, 1);
  assert.equal(duplicate.entry.xHandle, "Ada_Bot");
  assert.equal(duplicate.entry.referredBy, null);
  assert.equal(waitlistCount(ctx), 1);

  const unknown = joinWaitlist(ctx, { email: "grace@example.com", ref: "notacode" });
  assert.equal(unknown.ok, true);
  if (!unknown.ok) return;
  assert.equal(unknown.entry.position, 2);
  assert.equal(unknown.entry.xHandle, null);
  assert.equal(unknown.entry.referredBy, null);

  const invited = joinWaitlist(ctx, { email: "grace2@example.com", xHandle: "", ref: first.entry.referralCode });
  assert.equal(invited.ok, true);
  if (!invited.ok) return;
  assert.equal(invited.entry.position, 3);
  assert.equal(invited.entry.referredBy, first.entry.referralCode);
  assert.equal(waitlistCount(ctx), 3);

  const csv = waitlistCsv(ctx);
  assert.match(csv.split("\n")[0] ?? "", /^position,email,x_handle,referral_code,referred_by,created_at$/);
  assert.match(csv, /1,ada@example.com,Ada_Bot,/);
  assert.match(csv, new RegExp(`3,grace2@example.com,,${invited.entry.referralCode},${first.entry.referralCode},`));

  resetDatabase(ctx);
  assert.equal(waitlistCount(ctx), 3);
  ctx.close();
});

test("the csv export quotes commas and is founder-only", async () => {
  const ctx = await openDatabase(":memory:");
  ctx.db
    .insert(waitlistSignups)
    .values({
      id: "wl_quote",
      email: 'weirdo,"quoted"@example.com',
      xHandle: null,
      position: 1,
      referralCode: "quoted1",
      referredBy: null,
      createdAt: "2026-10-11T00:00:00.000Z",
    })
    .run();
  const csv = waitlistCsv(ctx);
  assert.match(csv, /"weirdo,""quoted""@example.com"/);

  const denied = waitlistExport({ founder: false }, csv);
  assert.equal(denied.status, 403);
  assert.equal("body" in denied && denied.body.includes("weirdo"), false);
  const missing = waitlistExport(null, csv);
  assert.equal(missing.status, 403);
  const allowed = waitlistExport({ founder: true }, csv);
  assert.equal(allowed.status, 200);
  if (allowed.status === 200) {
    assert.equal(allowed.filename, "botdate-waitlist.csv");
    assert.match(allowed.body, /weirdo/);
  }
  assert.equal(founderMayExport({ founder: true }), true);
  assert.equal(founderMayExport({ founder: false }), false);
  assert.equal(founderMayExport(null), false);
  ctx.close();
});
