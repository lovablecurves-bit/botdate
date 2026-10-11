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

test("must-haves and dealbreakers are hard filters, and max distance can admit a nearby city", () => {
  const avery = demoMember("avery");
  const sam = demoMember("sam");
  assert.equal(mutualPass(avery, sam), true);

  const deal = { ...avery, onboarding: { ...avery.onboarding, dealbreakers: ["supper club"] } };
  assert.equal(primaryHold(deal, sam), "dealbreaker");

  const must = { ...avery, onboarding: { ...avery.onboarding, mustHaves: ["gallery opening"] } };
  assert.equal(primaryHold(must, sam), "must-have");

  const berkeley = {
    ...sam,
    profile: { ...sam.profile, city: "Berkeley" },
    onboarding: { ...sam.onboarding, location: "Berkeley" },
  };
  assert.equal(primaryHold(avery, berkeley), null);
  const tight = { ...avery, onboarding: { ...avery.onboarding, maxDistanceMiles: 5 } };
  assert.equal(primaryHold(tight, berkeley), "city");
  assert.equal(primaryHold(tight, sam), "distance");
});

test("a high soft score cannot override a hard miss", () => {
  const alex = demoMember("alex");
  const jordan = demoMember("jordan");
  assert.equal(mutualPass(avery, alex), false);
  assert.ok(softRank(avery, alex).score >= softRank(avery, jordan).score);
  assert.ok(softRank(avery, jordan).score > softRank(avery, demoMember("riley")).score);
  assert.ok(softRank(avery, demoMember("riley")).score > softRank(avery, demoMember("sam")).score);
});
