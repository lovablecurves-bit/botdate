import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import initSqlJs from "sql.js";
import { openDatabase } from "./open";
import { prefs } from "./schema";
import { missingColumnStatements } from "./migrate";

test("migrations add X profile columns and the held-offer flag only when they are missing", () => {
  const fresh = missingColumnStatements({
    users: ["id", "email", "display_name", "bot_paused", "created_at", "x_user_id", "x_handle", "x_avatar_url", "founder", "member_number", "connect_seen", "stripe_customer_id", "stripe_subscription_id", "stripe_subscription_status", "referral_code", "referred_by"],
    date_proposals: ["id", "released"],
    agent_tokens: ["id", "user_id", "token_hash", "token_prefix", "created_at", "revoked_at", "last_used_at", "expires_at"],
    prefs: ["user_id", "seeking"],
  });
  assert.deepEqual(fresh, []);
  const legacy = missingColumnStatements({
    users: ["id", "email", "display_name", "bot_paused", "created_at"],
    date_proposals: ["id"],
  });
  assert.equal(legacy.length, 15);
  assert.match(legacy[0] ?? "", /x_user_id/);
  assert.match(legacy[3] ?? "", /released/);
  assert.match(legacy.join("\n"), /founder/);
  assert.match(legacy.join("\n"), /member_number/);
  assert.match(legacy.join("\n"), /connect_seen/);
  assert.match(legacy.join("\n"), /stripe_customer_id/);
  assert.match(legacy.join("\n"), /stripe_subscription_id/);
  assert.match(legacy.join("\n"), /stripe_subscription_status/);
  assert.match(legacy.join("\n"), /last_used_at/);
  assert.match(legacy.join("\n"), /expires_at/);
  assert.match(legacy.join("\n"), /referral_code/);
  assert.match(legacy.join("\n"), /referred_by/);
  assert.equal(legacy.find((statement) => statement.includes("seeking")), "ALTER TABLE prefs ADD COLUMN seeking TEXT");
});

test("adding seeking leaves existing preference rows null", async () => {
  const wasm = fs.readFileSync(path.join(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
  const SQL = await initSqlJs({ wasmBinary: new Uint8Array(wasm).buffer });
  const raw = new SQL.Database();
  raw.run(`CREATE TABLE prefs (
    user_id TEXT PRIMARY KEY,
    age_min INTEGER,
    age_max INTEGER,
    cities TEXT,
    smoking TEXT NOT NULL,
    kids TEXT NOT NULL,
    intent TEXT NOT NULL,
    nice_to_haves TEXT NOT NULL,
    locked INTEGER NOT NULL DEFAULT 0
  )`);
  raw.run(
    `INSERT INTO prefs (user_id, age_min, age_max, cities, smoking, kids, intent, nice_to_haves, locked)
     VALUES ('kept', 28, 40, '["Austin"]', 'no', 'any', 'serious', 'Walks', 1)`,
  );
  const file = path.join(os.tmpdir(), `botdate-seeking-${process.pid}-${Date.now()}.sqlite`);
  fs.writeFileSync(file, Buffer.from(raw.export()));
  raw.close();
  const ctx = await openDatabase(file, { seed: false });
  try {
    const row = ctx.db.select().from(prefs).all().find((item) => item.userId === "kept");
    assert.ok(row);
    assert.equal(row.seeking, null);
    assert.equal(row.ageMin, 28);
    assert.equal(row.ageMax, 40);
    assert.equal(row.cities, '["Austin"]');
    assert.equal(row.smoking, "no");
    assert.equal(row.niceToHaves, "Walks");
  } finally {
    ctx.close();
    fs.unlinkSync(file);
  }
});
