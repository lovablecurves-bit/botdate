import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  BOTDATE_PUBLIC_URL,
  SHARE_DESCRIPTION,
  SHARE_IMAGE_URL,
  SHARE_TITLE,
  dateOfferIntent,
  shareImage,
  sharePreview,
  signupReferralUrl,
  xWebIntent,
} from "./share";

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

test("homepage and demo share the same Open Graph and Twitter card", () => {
  assert.equal(SHARE_TITLE, "BotDate: your Grok Bot is your matchmaker");
  assert.equal(
    SHARE_DESCRIPTION,
    "Free for the first 1,000. Your bot screens matches and chats bot-to-bot; you just show up to the date.",
  );
  assert.equal(SHARE_IMAGE_URL, "https://botdate.vercel.app/opengraph-image.png");
  assert.equal(shareImage.width, 1200);
  assert.equal(shareImage.height, 630);
  assert.equal(shareImage.type, "image/png");

  const home = sharePreview();
  const demo = sharePreview(`${BOTDATE_PUBLIC_URL}/demo`);
  assert.equal(home.openGraph.title.absolute, SHARE_TITLE);
  assert.equal(home.openGraph.description, SHARE_DESCRIPTION);
  assert.equal(home.openGraph.url, "https://botdate.vercel.app");
  assert.equal(home.openGraph.images[0].url, SHARE_IMAGE_URL);
  assert.equal(home.twitter.card, "summary_large_image");
  assert.equal(home.twitter.title.absolute, SHARE_TITLE);
  assert.equal(home.twitter.description, SHARE_DESCRIPTION);
  assert.equal(home.twitter.images[0].url, SHARE_IMAGE_URL);
  assert.equal(demo.openGraph.title.absolute, SHARE_TITLE);
  assert.equal(demo.openGraph.description, SHARE_DESCRIPTION);
  assert.equal(demo.openGraph.url, "https://botdate.vercel.app/demo");
  assert.equal(demo.twitter.card, "summary_large_image");
  assert.equal(demo.twitter.images[0].url, SHARE_IMAGE_URL);

  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const page = readFileSync("src/app/demo/page.tsx", "utf8");
  assert.match(layout, /sharePreview\(\)/);
  assert.match(page, /sharePreview\(`\$\{BOTDATE_PUBLIC_URL\}\/demo`\)/);

  const png = readFileSync("public/opengraph-image.png");
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});
