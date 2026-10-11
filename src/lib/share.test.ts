import assert from "node:assert/strict";
import { test } from "node:test";
import { dateOfferIntent, waitlistIntent, xWebIntent } from "./share";

test("share links are X web intents for a date offer and a waitlist invite", () => {
  const date = new URL(dateOfferIntent("https://botdate.example"));
  const waitlist = new URL(waitlistIntent("https://botdate.example"));
  assert.equal(date.origin + date.pathname, "https://x.com/intent/post");
  assert.match(date.searchParams.get("text") ?? "", /date/);
  assert.equal(date.searchParams.get("url"), "https://botdate.example/login");
  assert.match(waitlist.searchParams.get("text") ?? "", /waitlist/);
  assert.equal(waitlist.searchParams.get("url"), "https://botdate.example/login");
  assert.equal(xWebIntent("Hello", "https://botdate.example/login").startsWith("https://x.com/intent/post?"), true);
});
