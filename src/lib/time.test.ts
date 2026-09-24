import assert from "node:assert/strict";
import { test } from "node:test";
import { formatPacific, pacificLocalToIso, upcomingSaturdayLocal } from "./time";

test("upcoming Saturday is the next Saturday morning in Pacific time", () => {
  const local = upcomingSaturdayLocal(new Date("2026-09-23T18:00:00.000Z"));
  assert.equal(local, "2026-09-26T11:00");
  const iso = pacificLocalToIso(local);
  const formatted = formatPacific(iso);
  assert.match(formatted, /Saturday/);
  assert.match(formatted, /September 26/);
  assert.match(formatted, /11:00/);
});

test("a Pacific winter time converts with the standard offset", () => {
  const iso = pacificLocalToIso("2026-12-05T11:00");
  assert.equal(formatPacific(iso).includes("11:00"), true);
  assert.match(formatPacific(iso), /December 5/);
});
