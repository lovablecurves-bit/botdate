import assert from "node:assert/strict";
import { test } from "node:test";
import { demoMember } from "../demo/members";
import { matchmaker } from "./service";

test("openings follow the member's pronouns", () => {
  const sam = matchmaker.composeOpening(demoMember("sam"));
  assert.match(sam, /This is Sam Okonkwo's matchmaker/);
  assert.match(sam, /They are 30/);
  assert.match(sam, /do not smoke/);
  assert.match(sam, /They want kids/);

  const avery = matchmaker.composeOpening(demoMember("avery"));
  assert.match(avery, /She is 32/);
  assert.match(avery, /does not smoke/);
  assert.match(avery, /a product designer/);
});

test("date suggestions prefer a table when cooking overlaps", () => {
  const suggestion = matchmaker.suggestDate(demoMember("avery"), demoMember("sam"), new Date("2026-09-23T18:00:00.000Z"));
  assert.equal(suggestion.place, "Tartine Manufactory");
  assert.equal(suggestion.local, "2026-09-26T11:00");
});
