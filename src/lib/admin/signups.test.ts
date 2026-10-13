import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { openDatabase, useAppDatabaseForTests } from "../db/open";
import { users } from "../db/schema";
import { applyBotProfile } from "../domain";
import { issueAgentToken } from "../agent/tokens";
import { upsertXMember } from "../x/account";

const TOKEN = "signup-admin-token";

async function withToken<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.ADMIN_TOKEN;
  try {
    if (value === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = value;
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
  }
}

test("the root layout mounts Vercel Web Analytics", () => {
  const layout = fs.readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
  assert.match(layout, /@vercel\/analytics\/next/);
  assert.match(layout, /<Analytics \/>/);
});

test("GET /api/admin/signups requires ADMIN_TOKEN and lists users newest first", async () => {
  const ctx = await openDatabase(":memory:", { seed: false });
  useAppDatabaseForTests(ctx);
  try {
    const older = upsertXMember(ctx, { xUserId: "10", handle: "ada", name: "Ada", bio: "First.", avatarUrl: "" });
    const newer = upsertXMember(ctx, { xUserId: "11", handle: "grace", name: "Grace", bio: "Later.", avatarUrl: "" });
    ctx.db.update(users).set({ createdAt: "2026-10-01T00:00:00.000Z" }).where(eq(users.id, older.userId)).run();
    ctx.db.update(users).set({ createdAt: "2026-10-12T00:00:00.000Z" }).where(eq(users.id, newer.userId)).run();
    assert.equal(
      applyBotProfile(ctx, newer.userId, {
        age: 36,
        city: "Austin",
        gender: "woman",
        occupation: "Engineer",
        ageMin: 28,
        ageMax: 45,
        cities: ["Austin"],
        seeking: "either",
      }).ok,
      true,
    );
    assert.ok(issueAgentToken(ctx, older.userId));

    const { GET } = await import("../../app/api/admin/signups/route");
    const url = "https://botdate.vercel.app/api/admin/signups";

    const denied = await withToken(TOKEN, () => GET(new Request(url)));
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: "unauthorized" });

    const wrong = await withToken(TOKEN, () => GET(new Request(url, { headers: { authorization: "Bearer nope" } })));
    assert.equal(wrong.status, 401);

    const unset = await withToken(undefined, () => GET(new Request(url, { headers: { authorization: `Bearer ${TOKEN}` } })));
    assert.equal(unset.status, 401);

    const ok = await withToken(TOKEN, () => GET(new Request(url, { headers: { authorization: `Bearer ${TOKEN}` } })));
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    const body = (await ok.json()) as {
      total: number;
      users: { member_number: number | null; x_handle: string | null; created_at: string; profile_complete: boolean; bot_connected: boolean }[];
    };
    assert.equal(body.total, 2);
    assert.deepEqual(
      body.users.map((user) => user.x_handle),
      ["grace", "ada"],
    );
    assert.deepEqual(body.users[0], {
      member_number: 2,
      x_handle: "grace",
      created_at: "2026-10-12T00:00:00.000Z",
      profile_complete: true,
      bot_connected: false,
    });
    assert.deepEqual(body.users[1], {
      member_number: 1,
      x_handle: "ada",
      created_at: "2026-10-01T00:00:00.000Z",
      profile_complete: false,
      bot_connected: true,
    });
    assert.equal(JSON.stringify(body).includes(TOKEN), false);
  } finally {
    useAppDatabaseForTests(null);
    ctx.close();
  }
});
