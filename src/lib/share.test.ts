import assert from "node:assert/strict";
import { test } from "node:test";
import { composeShot, dateOfferIntent, joinedWaitlistIntent, shotTemplate, waitlistIntent, waitlistReferralUrl, waitlistShareText, xWebIntent } from "./share";

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

test("a shot is an X web intent with the template, @BotDateApp, and the referral link", () => {
  const shot = composeShot({ handle: "@crush", code: "abc12345" });
  assert.ok(!("error" in shot));
  if ("error" in shot) return;
  assert.equal(shot.handle, "crush");
  assert.equal(shot.text, `${shotTemplate("crush")} via @BotDateApp https://botdate.vercel.app?ref=abc12345`);
  const intent = new URL(shot.intentUrl);
  assert.equal(intent.origin + intent.pathname, "https://x.com/intent/post");
  assert.equal(intent.searchParams.get("text"), shot.text);
  assert.equal(intent.searchParams.get("url"), null);
  assert.match(shot.text, /@BotDateApp/);
  assert.match(shot.text, /https:\/\/botdate\.vercel\.app\?ref=abc12345/);
  const custom = composeShot({ handle: "crush", code: "abc12345", message: "Hey, the bots already agree." });
  assert.ok(!("error" in custom));
  if ("error" in custom) return;
  assert.match(custom.text, /^@crush Hey, the bots already agree\./);
  assert.match(custom.text, /via @BotDateApp https:\/\/botdate\.vercel\.app\?ref=abc12345$/);
  assert.equal("error" in composeShot({ handle: "bad handle!", code: "abc12345" }), true);
  assert.equal("error" in composeShot({ handle: "BotDateApp", code: "abc12345" }), true);
});
