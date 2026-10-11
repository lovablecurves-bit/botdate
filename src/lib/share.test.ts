import assert from "node:assert/strict";
import { test } from "node:test";
import { dateOfferIntent, signupReferralUrl, xWebIntent } from "./share";

test("a date offer shares an X web intent without the other person's details", () => {
  const date = new URL(dateOfferIntent("https://botdate.example"));
  assert.equal(date.origin + date.pathname, "https://x.com/intent/post");
  assert.match(date.searchParams.get("text") ?? "", /date/);
  assert.equal(date.searchParams.get("url"), "https://botdate.example/login");
  assert.equal(date.searchParams.get("text")?.includes("Invite-only"), false);
  assert.equal(xWebIntent("Hello", "https://botdate.example/login").startsWith("https://x.com/intent/post?"), true);
});

test("a referral link points at signup on the public homepage", () => {
  assert.equal(signupReferralUrl("abc12345"), "https://botdate.vercel.app?ref=abc12345");
  assert.equal(signupReferralUrl("abc12345").includes("/waitlist"), false);
});
