import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "./db/open";
import { issueAgentToken } from "./agent/tokens";
import { handleMcp } from "./agent/mcp";
import { cityMatches } from "./matchmaker/filters";

type Seed = { id: string; name: string; age: number; city: string; gender: string; seeking: string; ageMin: number; ageMax: number; cities: string[] };

function addMember(db: Awaited<ReturnType<typeof openDatabase>>, m: Seed) {
  const now = new Date().toISOString();
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
  db.sqlite.exec(`
    INSERT INTO users (id, email, display_name, created_at, founder) VALUES (${q(m.id)}, ${q(`${m.id}@test`)}, ${q(m.name)}, ${q(now)}, 1);
    INSERT INTO profiles (user_id, age, city, occupation, bio, gender, smoking, kids, intent, interests, accent, voice)
      VALUES (${q(m.id)}, ${m.age}, ${q(m.city)}, '', '', ${q(m.gender)}, 0, 'open', 'serious', '[]', '#ff2d92', ${q(JSON.stringify({ subject: "they", object: "them", possessive: "their" }))});
    INSERT INTO prefs (user_id, age_min, age_max, cities, smoking, kids, intent, nice_to_haves, locked, seeking, dealbreakers)
      VALUES (${q(m.id)}, ${m.ageMin}, ${m.ageMax}, ${q(JSON.stringify(m.cities))}, 'no', 'any', 'serious', '', 1, ${q(m.seeking)}, '[]');
  `);
}

function call(db: Awaited<ReturnType<typeof openDatabase>>, token: string, name: string, args: Record<string, unknown>) {
  const result = handleMcp({ ctx: db, authorization: `Bearer ${token}`, message: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
  const body = result.body as { result?: { content?: { text: string }[]; isError?: boolean; structuredContent?: unknown } };
  const textOut = body.result?.content?.[0]?.text ?? "{}";
  return { isError: Boolean(body.result?.isError), data: JSON.parse(textOut) as Record<string, unknown> };
}

test("Austin-area preferences accept Austin-area cities, exact cities still match, and other cities do not", () => {
  assert.equal(cityMatches(["Greater Austin area (Westlake, Bee Cave, Lakeway"], "Bastrop, TX (Austin area)"), true);
  assert.equal(cityMatches(["Dripping Springs, TX"], "Dripping Springs, TX"), true);
  assert.equal(cityMatches(["Bastrop, TX"], "Bastrop, TX (Austin area)"), true);
  assert.equal(cityMatches(["Austin, TX"], "Bastrop, TX (Austin area)"), false);
  assert.equal(cityMatches(["Greater Austin area"], "Dallas, TX"), false);
  assert.equal(cityMatches([], "Austin, TX"), false);
});

test("browse shortlists mutual fits, then send_bot_message and propose_date work; non-fits are refused", async () => {
  const db = await openDatabase(":memory:", { seed: false });
  addMember(db, { id: "x_lisa", name: "Lisa", age: 38, city: "Bastrop, TX (Austin area)", gender: "woman", seeking: "men", ageMin: 30, ageMax: 55, cities: ["Austin, TX", "Dripping Springs, TX"] });
  addMember(db, { id: "x_chris", name: "Chris", age: 49, city: "Dripping Springs, TX", gender: "man", seeking: "women", ageMin: 32, ageMax: 41, cities: ["Austin, TX", "Greater Austin area (Westlake, Bee Cave"] });
  addMember(db, { id: "x_far", name: "Far", age: 40, city: "Dallas, TX", gender: "man", seeking: "women", ageMin: 30, ageMax: 50, cities: ["Dallas, TX"] });
  const token = issueAgentToken(db, "x_lisa");
  assert.ok(token);

  const browse = call(db, token.token, "browse_members", {});
  assert.equal(browse.isError, false);
  const people = browse.data.members as { id: string; shortlisted: boolean; matchId: string | null; notShortlistedReason: string | null }[];
  const chris = people.find((p) => p.id === "x_chris");
  const far = people.find((p) => p.id === "x_far");
  assert.equal(chris?.shortlisted, true);
  assert.ok(chris?.matchId);
  assert.equal(far?.shortlisted, false);
  assert.ok(far?.notShortlistedReason);

  const member = call(db, token.token, "get_member", { memberId: "x_chris" });
  assert.equal((member.data.member as { shortlisted: boolean }).shortlisted, true);

  const again = call(db, token.token, "shortlist_member", { memberId: "x_chris" });
  assert.equal(again.isError, false);
  assert.equal(again.data.shortlisted, true);
  const refused = call(db, token.token, "shortlist_member", { memberId: "x_far" });
  assert.equal(refused.isError, true);

  const sent = call(db, token.token, "send_bot_message", { memberId: "x_chris", body: "Hi from Lisa's matchmaker." });
  assert.equal(sent.isError, false, JSON.stringify(sent.data));
  const blocked = call(db, token.token, "send_bot_message", { memberId: "x_far", body: "hi" });
  assert.equal(blocked.isError, true);

  const future = new Date(Date.now() + 7 * 86400000);
  const local = `${future.toISOString().slice(0, 10)}T19:00`;
  const proposed = call(db, token.token, "propose_date", { memberId: "x_chris", local, place: "Test place" });
  assert.equal(proposed.isError, false, JSON.stringify(proposed.data));
  db.close();
});
