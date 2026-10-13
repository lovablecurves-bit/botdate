import assert from "node:assert/strict";
import { test } from "node:test";
import { demoMember } from "../demo/members";
import { isProfileComplete, type Member, type Seeking } from "../types";
import { evaluateHardFilters, mutualPass, primaryHold, seekingMatches, softRank } from "./filters";

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

function withSeeking(member: Member, seeking: Seeking | null, gender: Member["profile"]["gender"] = member.profile.gender): Member {
  return {
    ...member,
    profile: { ...member.profile, gender },
    prefs: { ...member.prefs, seeking },
  };
}

test("seeking is required before a profile can match", () => {
  const open = withSeeking(avery, null);
  assert.equal(isProfileComplete(open), false);
  assert.equal(isProfileComplete(avery), true);
  assert.equal(mutualPass(open, demoMember("jordan")), false);
  assert.equal(primaryHold(open, demoMember("jordan")), "inactive");
});

test("seeking is enforced both ways against Man or Woman", () => {
  const jordan = demoMember("jordan");
  const averySeeksMen = withSeeking(avery, "men");
  const jordanSeeksWomen = withSeeking(jordan, "women");
  assert.equal(seekingMatches("men", "man"), true);
  assert.equal(seekingMatches("men", "woman"), false);
  assert.equal(seekingMatches("women", "woman"), true);
  assert.equal(seekingMatches("either", "man"), true);
  assert.equal(seekingMatches("either", "woman"), true);
  assert.equal(seekingMatches(null, "woman"), false);

  const averyChecks = evaluateHardFilters(averySeeksMen.prefs, jordan.profile);
  assert.equal(averyChecks.find((check) => check.key === "seeking")?.pass, true);
  const jordanChecks = evaluateHardFilters(withSeeking(jordan, "men").prefs, avery.profile);
  assert.equal(jordanChecks.find((check) => check.key === "seeking")?.pass, false);
  assert.match(jordanChecks.find((check) => check.key === "seeking")?.detail ?? "", /Woman/);

  assert.equal(mutualPass(averySeeksMen, jordanSeeksWomen), true);
  assert.equal(mutualPass(averySeeksMen, withSeeking(jordan, "men")), false);
  assert.equal(primaryHold(averySeeksMen, withSeeking(jordan, "men")), "their-seeking");
  assert.equal(primaryHold(withSeeking(avery, "women"), jordanSeeksWomen), "seeking");
  assert.equal(mutualPass(withSeeking(avery, "either"), withSeeking(jordan, "either")), true);
});

test("a high soft score cannot override a hard miss", () => {
  const alex = demoMember("alex");
  const jordan = demoMember("jordan");
  assert.equal(mutualPass(avery, alex), false);
  assert.ok(softRank(avery, alex).score >= softRank(avery, jordan).score);
  assert.ok(softRank(avery, jordan).score > softRank(avery, demoMember("riley")).score);
  assert.ok(softRank(avery, demoMember("riley")).score > softRank(avery, demoMember("sam")).score);
});
