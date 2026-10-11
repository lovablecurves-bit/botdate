import assert from "node:assert/strict";
import { test } from "node:test";
import { memberHome } from "../auth";
import { openDatabase, useAppDatabaseForTests } from "../db/open";
import { getMember } from "../domain";
import { memberFromClaims, verifySession } from "../session";
import { upsertXMember } from "./account";
import { demoMode, xAuthConfigured, xCredentials } from "./config";
import { XAuthError, exchangeAuthorizationCode, fetchXProfile, loginErrorText, logOAuthCallbackError, readOAuthCallbackError } from "./oauth";
import { X_AUTHORIZE_URL, X_ME_URL, X_SCOPES, X_TOKEN_URL, authorizeUrl, codeChallenge, randomVerifier } from "./pkce";
import { safeAvatarUrl, xProfileFromPayload } from "./profile";

const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

test("PKCE S256 matches the RFC 7636 vector and the authorize URL asks for both scopes", () => {
  assert.equal(VERIFIER.length, 43);
  const challenge = codeChallenge(VERIFIER);
  assert.equal(challenge, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert.equal(challenge.includes("="), false);
  assert.match(challenge, /^[A-Za-z0-9_-]+$/);
  const raw = authorizeUrl({
    clientId: "client",
    redirectUri: "http://localhost:3000/api/auth/x/callback",
    state: "state",
    verifier: VERIFIER,
  });
  const expected = `https://x.com/i/oauth2/authorize?${[
    ["response_type", "code"],
    ["client_id", "client"],
    ["redirect_uri", "http://localhost:3000/api/auth/x/callback"],
    ["scope", X_SCOPES],
    ["state", "state"],
    ["code_challenge", challenge],
    ["code_challenge_method", "S256"],
  ]
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")}`;
  assert.equal(raw, expected);
  assert.equal(X_AUTHORIZE_URL, "https://x.com/i/oauth2/authorize");
  assert.equal(raw.startsWith("https://x.com/i/oauth2/authorize?"), true);
  assert.equal(raw.includes("twitter.com"), false);
  assert.match(raw, /(?:^|&)scope=users\.read%20tweet\.read(?:&|$)/);
  assert.equal(raw.includes("+"), false);
  assert.equal(raw.includes("scope=users.read+tweet.read"), false);
  const url = new URL(raw);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), challenge);
  assert.equal(url.searchParams.get("scope"), X_SCOPES);
  assert.match(X_SCOPES, /users\.read/);
  assert.match(X_SCOPES, /tweet\.read/);
});

test("PKCE verifier is 43-128 characters and the challenge is unpadded base64url", () => {
  for (let i = 0; i < 20; i++) {
    const verifier = randomVerifier();
    assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
    const challenge = codeChallenge(verifier);
    assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(challenge.includes("="), false);
  }
  assert.throws(() =>
    authorizeUrl({
      clientId: "client",
      redirectUri: "http://localhost:3000/api/auth/x/callback",
      state: "state",
      verifier: "a".repeat(42),
    }),
  );
  assert.throws(() =>
    authorizeUrl({
      clientId: "client",
      redirectUri: "http://localhost:3000/api/auth/x/callback",
      state: "state",
      verifier: "a".repeat(129),
    }),
  );
});

test("X sign-in stays off unless client id, secret, and redirect URI are all set", () => {
  const previous = {
    id: process.env.X_CLIENT_ID,
    secret: process.env.X_CLIENT_SECRET,
    redirect: process.env.X_REDIRECT_URI,
  };
  delete process.env.X_CLIENT_ID;
  delete process.env.X_CLIENT_SECRET;
  delete process.env.X_REDIRECT_URI;
  assert.equal(xCredentials(), null);
  assert.equal(xAuthConfigured(), false);
  assert.equal(demoMode(), true);
  process.env.X_CLIENT_ID = "id";
  process.env.X_CLIENT_SECRET = "secret";
  assert.equal(xAuthConfigured(), false);
  assert.equal(demoMode(), true);
  process.env.X_REDIRECT_URI = "http://localhost:3000/api/auth/x/callback";
  assert.equal(demoMode(), false);
  assert.deepEqual(xCredentials(), {
    clientId: "id",
    clientSecret: "secret",
    redirectUri: "http://localhost:3000/api/auth/x/callback",
  });
  for (const [key, value] of Object.entries({ X_CLIENT_ID: previous.id, X_CLIENT_SECRET: previous.secret, X_REDIRECT_URI: previous.redirect })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("profile import keeps handle, name, bio, and an X-hosted avatar", () => {
  const profile = xProfileFromPayload({
    data: {
      id: "998877",
      name: "Dan Kettlebell",
      username: "KettlebellDan",
      description: "Lifts, then looks for a date.",
      profile_image_url: "https://pbs.twimg.com/profile_images/1/face_normal.jpg",
    },
  });
  assert.ok(profile);
  assert.equal(profile.handle, "KettlebellDan");
  assert.equal(profile.name, "Dan Kettlebell");
  assert.equal(profile.bio, "Lifts, then looks for a date.");
  assert.equal(profile.avatarUrl, "https://pbs.twimg.com/profile_images/1/face_400x400.jpg");
  assert.equal(safeAvatarUrl("javascript:alert(1)"), "");
  assert.equal(safeAvatarUrl("https://evil.example/a.jpg"), "");
  assert.equal(xProfileFromPayload({ data: { id: "nope", username: "ab" } }), null);
});

test("token exchange and users/me parse through an injected fetch", async () => {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/oauth2/token")) {
      assert.equal(url, X_TOKEN_URL);
      assert.equal(X_TOKEN_URL, "https://api.x.com/2/oauth2/token");
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, `Basic ${Buffer.from("id:secret").toString("base64")}`);
      assert.equal(headers["Content-Type"], "application/x-www-form-urlencoded");
      const body = String(init?.body);
      assert.match(body, /grant_type=authorization_code/);
      assert.match(body, /code=code/);
      assert.match(body, new RegExp(`code_verifier=${VERIFIER}`));
      assert.equal(body.includes("client_id"), false);
      assert.equal(body.includes("client_secret"), false);
      return new Response(JSON.stringify({ access_token: "access" }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        data: { id: "42", name: "Ada", username: "ada_bot", description: "Hello", profile_image_url: "https://pbs.twimg.com/profile_images/a/b_normal.png" },
      }),
      { status: 200 },
    );
  };
  const token = await exchangeAuthorizationCode(
    { clientId: "id", clientSecret: "secret", redirectUri: "http://localhost/callback" },
    "code",
    VERIFIER,
    fetchImpl,
  );
  assert.equal(token, "access");
  const profile = await fetchXProfile(token, fetchImpl);
  assert.equal(profile.handle, "ada_bot");
  assert.equal(calls.length, 2);
  await assert.rejects(
    () => exchangeAuthorizationCode({ clientId: "id", clientSecret: "secret", redirectUri: "http://localhost/callback" }, "code", VERIFIER, async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })),
    XAuthError,
  );
});

test("callback logs the exact error and error_description and the login page shows both", async () => {
  const parsed = readOAuthCallbackError(
    new URLSearchParams("error=access_denied&error_description=You%20were%20not%20able%20to%20give%20access%20to%20the%20App"),
  );
  assert.deepEqual(parsed, {
    error: "access_denied",
    error_description: "You were not able to give access to the App",
  });
  assert.equal(loginErrorText(parsed?.error, parsed?.error_description), "access_denied: You were not able to give access to the App");
  assert.equal(loginErrorText("That X sign-in expired. Try again.", null), "That X sign-in expired. Try again.");
  assert.equal(loginErrorText(undefined, undefined), null);
  assert.equal(readOAuthCallbackError(new URLSearchParams("code=abc")), null);

  const logs: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  const previous = {
    id: process.env.X_CLIENT_ID,
    secret: process.env.X_CLIENT_SECRET,
    redirect: process.env.X_REDIRECT_URI,
  };
  process.env.X_CLIENT_ID = "id";
  process.env.X_CLIENT_SECRET = "secret";
  process.env.X_REDIRECT_URI = "http://localhost:3000/api/auth/x/callback";
  try {
    logOAuthCallbackError(parsed!);
    assert.deepEqual(logs, [["X OAuth callback error=access_denied error_description=You were not able to give access to the App"]]);
    const { GET } = await import("../../app/api/auth/x/callback/route");
    const response = await GET(
      new Request("https://botdate.example/api/auth/x/callback?error=access_denied&error_description=You%20were%20not%20able%20to%20give%20access%20to%20the%20App"),
    );
    assert.equal(response.status, 307);
    const location = response.headers.get("location");
    assert.ok(location);
    const dest = new URL(location);
    assert.equal(dest.origin + dest.pathname, "https://botdate.example/login");
    assert.equal(dest.searchParams.get("error"), "access_denied");
    assert.equal(dest.searchParams.get("error_description"), "You were not able to give access to the App");
    assert.equal(
      logs[1]?.[0],
      "X OAuth callback error=access_denied error_description=You were not able to give access to the App",
    );
  } finally {
    console.error = original;
    for (const [key, value] of Object.entries({ X_CLIENT_ID: previous.id, X_CLIENT_SECRET: previous.secret, X_REDIRECT_URI: previous.redirect })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("signing in with X creates an unlocked member and refreshes the avatar without clobbering a locked name", async () => {
  const ctx = await openDatabase(":memory:");
  const first = upsertXMember(ctx, {
    xUserId: "42",
    handle: "ada_bot",
    name: "Ada Lovelace",
    bio: "Analytical.",
    avatarUrl: "https://pbs.twimg.com/profile_images/a/b_400x400.jpg",
  });
  assert.equal(first.locked, false);
  const member = getMember(ctx, first.userId);
  assert.equal(member?.displayName, "Ada Lovelace");
  assert.equal(member?.profile.bio, "Analytical.");
  assert.equal(member?.xAccount?.handle, "ada_bot");
  assert.equal(member?.prefs.locked, false);
  assert.equal(member?.founder, true);
  assert.equal(member?.memberNumber, 1);
  assert.equal(member?.connectSeen, false);

  upsertXMember(ctx, {
    xUserId: "42",
    handle: "ada",
    name: "Ada",
    bio: "Still analytical.",
    avatarUrl: "https://pbs.twimg.com/profile_images/a/c_400x400.jpg",
  });
  const refreshed = getMember(ctx, first.userId);
  assert.equal(refreshed?.displayName, "Ada");
  assert.equal(refreshed?.profile.bio, "Still analytical.");
  assert.equal(refreshed?.xAccount?.handle, "ada");
  assert.equal(refreshed?.founder, true);
  assert.equal(refreshed?.memberNumber, 1);
  assert.equal(refreshed?.connectSeen, false);

  const { saveMember, memberToInput } = await import("../domain");
  assert.equal(saveMember(ctx, first.userId, { ...memberToInput(refreshed!), occupation: "Mathematician", locked: true }).ok, true);
  upsertXMember(ctx, {
    xUserId: "42",
    handle: "ada",
    name: "Someone Else",
    bio: "Overwrite me",
    avatarUrl: "https://abs.twimg.com/sticky/default_profile_images/default_400x400.png",
  });
  const locked = getMember(ctx, first.userId);
  assert.equal(locked?.displayName, "Ada");
  assert.equal(locked?.profile.bio, "Still analytical.");
  assert.match(locked?.xAccount?.avatarUrl ?? "", /default_400x400/);
  ctx.close();
});

test("X sign-in survives a second instance that does not share the database", async () => {
  const previous = {
    id: process.env.X_CLIENT_ID,
    secret: process.env.X_CLIENT_SECRET,
    redirect: process.env.X_REDIRECT_URI,
    session: process.env.SESSION_SECRET,
  };
  process.env.X_CLIENT_ID = "id";
  process.env.X_CLIENT_SECRET = "secret";
  process.env.X_REDIRECT_URI = "https://botdate.vercel.app/api/auth/x/callback";
  delete process.env.SESSION_SECRET;
  const db = await openDatabase(":memory:", { seed: false });
  useAppDatabaseForTests(db);
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith(X_TOKEN_URL)) return new Response(JSON.stringify({ access_token: "access" }), { status: 200 });
    if (url.startsWith(X_ME_URL)) {
      return new Response(
        JSON.stringify({
          data: {
            id: "42",
            name: "Ada Lovelace",
            username: "ada_bot",
            description: "Analytical.",
            profile_image_url: "https://pbs.twimg.com/profile_images/a/b_normal.jpg",
            created_at: "2020-01-15T00:00:00.000Z",
            public_metrics: { followers_count: 40 },
            verified: false,
          },
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const { GET: start } = await import("../../app/api/auth/x/start/route");
    const started = await start(new Request("https://botdate.vercel.app/api/auth/x/start"));
    const startedCookies = started.headers.getSetCookie();
    const state = cookieValue(startedCookies, "botdate_x_state");
    const verifier = cookieValue(startedCookies, "botdate_x_verifier");
    for (const name of ["botdate_x_state", "botdate_x_verifier"]) {
      const raw = startedCookies.find((item) => item.startsWith(`${name}=`));
      assert.ok(raw);
      assert.match(raw, /HttpOnly/);
      assert.match(raw, /Secure/);
      assert.match(raw, /SameSite=Lax/i);
      assert.match(raw, /Path=\//);
    }
    const authorize = new URL(started.headers.get("location") ?? "");
    assert.equal(authorize.origin + authorize.pathname, "https://x.com/i/oauth2/authorize");
    assert.equal(authorize.searchParams.get("state"), state);
    assert.equal(authorize.searchParams.get("code_challenge"), codeChallenge(verifier));
    assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");

    const { GET: callback } = await import("../../app/api/auth/x/callback/route");
    const finished = await callback(
      new Request(`https://botdate.vercel.app/api/auth/x/callback?code=abc&state=${encodeURIComponent(state)}`, {
        headers: { cookie: `botdate_x_state=${state}; botdate_x_verifier=${verifier}` },
      }),
    );
    assert.equal(finished.status, 307);
    const dest = new URL(finished.headers.get("location") ?? "");
    assert.equal(dest.pathname, "/connect");
    assert.notEqual(dest.pathname, "/");
    assert.notEqual(dest.pathname, "/login");
    const sessionCookies = finished.headers.getSetCookie();
    const sessionRaw = sessionCookies.find((item) => item.startsWith("botdate_session="));
    assert.ok(sessionRaw);
    assert.match(sessionRaw, /HttpOnly/);
    assert.match(sessionRaw, /Secure/);
    assert.match(sessionRaw, /SameSite=Lax/i);
    assert.match(sessionRaw, /Path=\//);
    const token = cookieValue(sessionCookies, "botdate_session");
    const claims = verifySession(token);
    assert.ok(claims);
    assert.equal(claims.id, "x_42");
    assert.equal(claims.handle, "ada_bot");
    assert.equal(claims.name, "Ada Lovelace");
    assert.equal(claims.bio, "Analytical.");
    assert.equal(claims.avatar, "https://pbs.twimg.com/profile_images/a/b_400x400.jpg");
    assert.equal(claims.founder, true);
    assert.equal(getMember(db, claims.id)?.xAccount?.handle, "ada_bot");
    assert.equal(calls.length, 2);
    assert.equal(calls[0], X_TOKEN_URL);
    assert.ok(calls[1]?.startsWith(X_ME_URL));
  assert.match(calls[1] ?? "", /created_at/);
  assert.match(calls[1] ?? "", /public_metrics/);
  assert.match(calls[1] ?? "", /verified/);

    const other = await openDatabase(":memory:", { seed: false });
    assert.equal(getMember(other, claims.id), null);
    const restored = memberFromClaims(claims);
    assert.equal(restored.xAccount?.handle, "ada_bot");
    assert.equal(restored.displayName, "Ada Lovelace");
    assert.equal(restored.profile.bio, "Analytical.");
    assert.equal(memberHome(restored), "/connect");
    assert.equal(calls.length, 2, "profile views must not call X again");
    other.close();
  } finally {
    globalThis.fetch = originalFetch;
    useAppDatabaseForTests(null);
    db.close();
    for (const [key, value] of Object.entries({
      X_CLIENT_ID: previous.id,
      X_CLIENT_SECRET: previous.secret,
      X_REDIRECT_URI: previous.redirect,
      SESSION_SECRET: previous.session,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

function cookieValue(setCookies: string[], name: string): string {
  const raw = setCookies.find((item) => item.startsWith(`${name}=`));
  assert.ok(raw, name);
  return raw.slice(name.length + 1).split(";")[0] ?? "";
}
