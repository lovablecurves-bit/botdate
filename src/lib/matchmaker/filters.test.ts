import assert from "node:assert/strict";
import { test } from "node:test";
import { demoMember } from "../demo/members";
import { mutualPass, primaryHold, softRank } from "./filters";

const avery = demoMember("avery");

test("Avery's mutual shortlist is Jordan, Riley, and Sam", () => {
  const ids = ["jordan", "riley", "sam", "noah", "alex", "morgan", "casey", "quinn", "priya"]
    .filter((id) => mutualPass(avery, demoMember(id)))
    .sort();
  assert.deepEqual(ids, ["jordan", "riley", "sam"]);
});

test("dealbreaker misses are named by the first failing rule", () => {
  assert.equal(primaryHold(avery, demoMember("morgan")), "smoking");
  assert.equal(primaryHold(avery, demoMember("casey")), "city");
  assert.equal(primaryHold(avery, demoMember("quinn")), "age");
  assert.equal(primaryHold(avery, demoMember("noah")), "kids");
  assert.equal(primaryHold(avery, demoMember("alex")), "their-age");
  assert.equal(primaryHold(avery, demoMember("priya")), "inactive");
});

test("a high soft score cannot override a hard miss", () => {
  const alex = demoMember("alex");
  const jordan = demoMember("jordan");
  assert.equal(mutualPass(avery, alex), false);
  assert.ok(softRank(avery, alex).score >= softRank(avery, jordan).score);
  assert.ok(softRank(avery, jordan).score > softRank(avery, demoMember("riley")).score);
  assert.ok(softRank(avery, demoMember("riley")).score > softRank(avery, demoMember("sam")).score);
});
