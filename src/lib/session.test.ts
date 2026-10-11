import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { memberHome, safePostLoginPath } from "./auth";
import { coldStartNote } from "./x/config";
import { needsPaywall } from "./stripe/access";
import {
  claimsFromMember,
  memberFromClaims,
  oauthCookieOptions,
  requestIsSecureSync,
  sessionCookieOptions,
  sessionSecret,
  signSession,
  verifySession,
  type SessionClaims,
} from "./session";

const BILLING = { STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: "whsec_test", STRIPE_PRICE_ID: "price_420" };

function sample(extra: Partial<SessionClaims> = {}): SessionClaims {
  return {
    id: "x_42",
    xUserId: "42",
    handle: "ada_bot",
    name: "Ada Lovelace",
    avatar: "https://pbs.twimg.com/profile_images/a/ada_400x400.jpg",
    bio: "Analytical.",
    connectSeen: false,
    locked: false,
    founder: true,
    memberNumber: 1,
    subscriptionStatus: null,
    stripeCustomerId: null,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extra,
  };
}

test("the session cookie is an HMAC JWT of the member id and X profile snapshot", () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret";
  try {
    const claims = sample();
    const token = signSession(claims);
    const verified = verifySession(token);
    assert.ok(verified);
    assert.equal(verified.id, "x_42");
    assert.equal(verified.handle, "ada_bot");
    assert.equal(verified.name, "Ada Lovelace");
    assert.equal(verified.avatar, claims.avatar);
    assert.equal(verified.bio, "Analytical.");
    assert.equal(verifySession(`${token}x`), null);
    const [header, body, signature] = token.split(".");
    assert.equal(verifySession(`${header}.${body}.${signature?.slice(0, -1)}a`), null);
    assert.equal(verifySession(token, "other-secret"), null);
    const expired = signSession(sample({ exp: Math.floor(Date.now() / 1000) - 10 }));
    assert.equal(verifySession(expired), null);
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});

test("SESSION_SECRET wins and otherwise the key is derived from X_CLIENT_SECRET", () => {
  const previous = { session: process.env.SESSION_SECRET, secret: process.env.X_CLIENT_SECRET };
  delete process.env.SESSION_SECRET;
  delete process.env.X_CLIENT_SECRET;
  try {
    assert.equal(sessionSecret(), sessionSecret());
    process.env.X_CLIENT_SECRET = "oauth-secret";
    const derived = sessionSecret();
    assert.notEqual(derived, "oauth-secret");
    const token = signSession(sample(), derived);
    assert.ok(verifySession(token, derived));
    assert.equal(verifySession(token, sessionSecret({ X_CLIENT_SECRET: "different" })), null);
    process.env.SESSION_SECRET = "explicit";
    assert.equal(sessionSecret(), "explicit");
    assert.ok(verifySession(signSession(sample()), "explicit"));
  } finally {
    if (previous.session === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous.session;
    if (previous.secret === undefined) delete process.env.X_CLIENT_SECRET;
    else process.env.X_CLIENT_SECRET = previous.secret;
  }
});

test("session and PKCE cookies are HttpOnly, Secure on https, SameSite=Lax, and path=/", () => {
  const session = sessionCookieOptions(true);
  const oauth = oauthCookieOptions(true);
  for (const options of [session, oauth]) {
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.path, "/");
  }
  assert.equal(oauthCookieOptions(false).secure, false);
  assert.equal(requestIsSecureSync("https://botdate.vercel.app/api/auth/x/start", null), true);
  assert.equal(requestIsSecureSync("http://localhost:3000/api/auth/x/start", "https"), true);
  assert.equal(requestIsSecureSync("http://localhost:3000/api/auth/x/start", null), false);
});

test("a signed snapshot signs the member in when the database has no row", () => {
  const previous = {
    key: process.env.STRIPE_SECRET_KEY,
    hook: process.env.STRIPE_WEBHOOK_SECRET,
    price: process.env.STRIPE_PRICE_ID,
  };
  const founder = memberFromClaims(sample());
  assert.equal(founder.id, "x_42");
  assert.equal(founder.xAccount?.handle, "ada_bot");
  assert.equal(founder.displayName, "Ada Lovelace");
  assert.equal(founder.profile.bio, "Analytical.");
  assert.equal(founder.xAccount?.avatarUrl, sample().avatar);
  assert.equal(founder.founder, true);
  assert.equal(founder.connectSeen, false);
  assert.equal(needsPaywall(founder, BILLING), false);
  assert.equal(memberHome(founder), "/connect");
  assert.equal(safePostLoginPath(memberHome(founder)), "/connect");
  assert.equal(safePostLoginPath("/"), "/connect");
  assert.equal(safePostLoginPath("/login"), "/connect");

  const guest = memberFromClaims(sample({ founder: false, memberNumber: 2, handle: "grace", name: "Grace", connectSeen: true, locked: true }));
  assert.equal(needsPaywall(guest, {}), false);
  process.env.STRIPE_SECRET_KEY = BILLING.STRIPE_SECRET_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = BILLING.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_PRICE_ID = BILLING.STRIPE_PRICE_ID;
  try {
    assert.equal(needsPaywall(guest), true);
    assert.equal(memberHome(guest), "/join");
    assert.notEqual(memberHome(guest), "/");
    assert.notEqual(memberHome(guest), "/login");
    const subscribed = memberFromClaims(sample({ founder: false, memberNumber: 2, connectSeen: true, locked: true, subscriptionStatus: "trialing" }));
    assert.equal(needsPaywall(subscribed), false);
    assert.equal(memberHome(subscribed), "/shortlist");
  } finally {
    if (previous.key === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = previous.key;
    if (previous.hook === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = previous.hook;
    if (previous.price === undefined) delete process.env.STRIPE_PRICE_ID;
    else process.env.STRIPE_PRICE_ID = previous.price;
  }

  const roundTrip = memberFromClaims(verifySession(signSession(claimsFromMember(founder), "explicit"), "explicit")!);
  assert.equal(roundTrip.xAccount?.handle, "ada_bot");
  assert.equal(roundTrip.profile.bio, "Analytical.");
});

test("public pages do not render the cold-start developer note", () => {
  const files = [
    "src/app/page.tsx",
    "src/app/login/page.tsx",
    "src/app/join/page.tsx",
    "src/app/privacy/page.tsx",
    "src/app/terms/page.tsx",
    "src/app/error.tsx",
    "src/app/not-found.tsx",
    "src/app/(app)/members/page.tsx",
    "src/app/(app)/members/[memberId]/page.tsx",
    "src/app/(app)/connect/page.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("won't survive"), false, file);
    assert.equal(source.includes("local database"), false, file);
    assert.equal(/\bcoldStartNote\(/.test(source), false, file);
    assert.equal(/\berror\.message\b/.test(source), false, file);
    assert.equal(/\berror\.stack\b/.test(source), false, file);
  }
  const previous = {
    vercel: process.env.VERCEL,
    id: process.env.X_CLIENT_ID,
    secret: process.env.X_CLIENT_SECRET,
    redirect: process.env.X_REDIRECT_URI,
    url: process.env.TURSO_DATABASE_URL,
    token: process.env.TURSO_AUTH_TOKEN,
  };
  process.env.VERCEL = "1";
  process.env.X_CLIENT_ID = "id";
  process.env.X_CLIENT_SECRET = "secret";
  process.env.X_REDIRECT_URI = "https://botdate.vercel.app/api/auth/x/callback";
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  try {
    assert.match(coldStartNote() ?? "", /won't survive cold starts without Turso/);
  } finally {
    for (const [key, value] of Object.entries({
      VERCEL: previous.vercel,
      X_CLIENT_ID: previous.id,
      X_CLIENT_SECRET: previous.secret,
      X_REDIRECT_URI: previous.redirect,
      TURSO_DATABASE_URL: previous.url,
      TURSO_AUTH_TOKEN: previous.token,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
