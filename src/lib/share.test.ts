import assert from "node:assert/strict";
import { test } from "node:test";
import { dateOfferIntent, joinedWaitlistIntent, waitlistIntent, waitlistReferralUrl, waitlistShareText, xWebIntent } from "./share";

test("share links are X web intents for a date offer and a waitlist invite", () => {
  const date = new URL(dateOfferIntent("https://botdate.example"));
  const waitlist = new URL(waitlistIntent());
  assert.equal(date.origin + date.pathname, "https://x.com/intent/post");
  assert.match(date.searchParams.get("text") ?? "", /date/);
  assert.equal(date.searchParams.get("url"), "https://botdate.example/login");
  assert.match(waitlist.searchParams.get("text") ?? "", /Invite-only/);
  assert.equal(waitlist.searchParams.get("url"), null);
  assert.equal(xWebIntent("Hello", "https://botdate.example/login").startsWith("https://x.com/intent/post?"), true);
});

test("joining the waitlist shares the invite-only line and a referral code", () => {
  const intent = new URL(joinedWaitlistIntent("abc12345"));
  assert.equal(intent.origin + intent.pathname, "https://x.com/intent/post");
  assert.equal(
    intent.searchParams.get("text"),
    "I'm in on BotDate 💘 my Grok Bot finds my match. Invite-only for now 👀 https://botdate.vercel.app?ref=abc12345",
  );
  assert.equal(intent.searchParams.get("text"), waitlistShareText("abc12345"));
  assert.equal(intent.searchParams.get("url"), null);
  assert.equal(waitlistReferralUrl("abc12345"), "https://botdate.vercel.app?ref=abc12345");
});
