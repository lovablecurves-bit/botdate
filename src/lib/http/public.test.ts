import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";
import { isOpenPath, referralCode } from "./public";

const OPEN = [
  "/",
  "/privacy",
  "/terms",
  "/video",
  "/video/",
  "/video/embed",
  "/video/embed/",
  "/video/botdate-how-it-works.mp4",
  "/video/botdate-how-it-works.png",
  "/api/health",
  "/api/mcp",
  "/api/auth/x/start",
  "/api/auth/x/callback",
  "/api/admin/x/connect",
  "/api/admin/x/post",
  "/api/admin/x/mentions",
  "/api/admin/x/media",
  "/api/admin/x/pin",
  "/api/stripe/webhook",
  "/icon.svg",
  "/apple-icon.png",
  "/opengraph-image.png",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/_next/static/chunks/app.js",
];

test("logged-out visitors can open the homepage, auth, health, and static files", () => {
  for (const pathname of OPEN) {
    assert.equal(isOpenPath(pathname), true, pathname);
    const response = middleware(new NextRequest(`https://botdate.vercel.app${pathname}`));
    assert.equal(response.headers.get("location"), null, pathname);
    assert.notEqual(response.status, 307, pathname);
  }
  for (const pathname of ["/profile", "/onboarding", "/members", "/shortlist", "/admin/waitlist", "/api/stripe/portal"]) {
    assert.equal(isOpenPath(pathname), false, pathname);
    const response = middleware(new NextRequest(`https://botdate.vercel.app${pathname}`));
    assert.equal(response.status, 307, pathname);
    assert.equal(new URL(response.headers.get("location") ?? "https://botdate.vercel.app/").pathname, "/login");
  }
});

test("the old waitlist URL redirects to the public homepage and keeps a referral code", () => {
  const plain = middleware(new NextRequest("https://botdate.vercel.app/waitlist"));
  assert.equal(plain.status, 307);
  assert.equal(new URL(plain.headers.get("location") ?? "https://botdate.vercel.app/missing").pathname, "/");

  const invited = middleware(new NextRequest("https://botdate.vercel.app/waitlist?ref=Ab12cd34"));
  const dest = new URL(invited.headers.get("location") ?? "https://botdate.vercel.app/missing");
  assert.equal(dest.pathname, "/");
  assert.equal(dest.searchParams.get("ref"), "ab12cd34");
  assert.equal(referralCode("no"), null);
});

test("the public homepage offers Sign in with X and no waitlist", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const files = ["src/app/page.tsx", "src/app/login/page.tsx", "src/components/sign-in-screen.tsx", "src/app/profile/page.tsx"];
  const profile = fs.readFileSync(path.join(root, "src/app/profile/page.tsx"), "utf8");
  assert.match(profile, /You're in 💘/);
  assert.match(profile, /🔒 Only you see this\. Your bot does the rest\./);
  assert.match(profile, /data-testid="x-profile-photo"/);
  assert.match(profile, /data-testid="x-handle"/);
  assert.match(profile, /Connect your Grok Bot/);
  assert.match(profile, /data-testid="bot-status"/);
  assert.equal(profile.includes("About you"), false);
  assert.equal(profile.includes("member.profile.bio"), false);
  const onboard = fs.readFileSync(path.join(root, "src/app/(app)/onboarding/page.tsx"), "utf8");
  assert.match(onboard, /redirect\("\/profile"\)/);
  assert.equal(onboard.includes("About you"), false);
  const screen = fs.readFileSync(path.join(root, "src/components/sign-in-screen.tsx"), "utf8");
  assert.match(screen, /Sign in with X/);
  assert.match(screen, /data-testid="sign-in-x"/);
  assert.equal(screen.includes("Join the waitlist"), false);
  assert.equal(screen.includes("Invite-only"), false);
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal(source.includes("Join the waitlist"), false, file);
    assert.equal(source.includes("Invite-only"), false, file);
    assert.equal(source.includes("won't survive"), false, file);
  }
});
