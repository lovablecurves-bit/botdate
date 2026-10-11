import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase } from "../db/open";
import { getMember } from "../domain";
import { upsertXMember } from "./account";
import { xAuthConfigured, xCredentials } from "./config";
import { XAuthError, exchangeAuthorizationCode, fetchXProfile } from "./oauth";
import { X_SCOPES, authorizeUrl, codeChallenge } from "./pkce";
import { safeAvatarUrl, xProfileFromPayload } from "./profile";

const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

test("PKCE S256 matches the RFC 7636 vector and the authorize URL asks for both scopes", () => {
  assert.equal(codeChallenge(VERIFIER), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const url = new URL(
    authorizeUrl({
      clientId: "client",
      redirectUri: "http://localhost:3000/api/auth/x/callback",
      state: "state",
      verifier: VERIFIER,
    }),
  );
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert.equal(url.searchParams.get("scope"), X_SCOPES);
  assert.match(X_SCOPES, /users\.read/);
  assert.match(X_SCOPES, /tweet\.read/);
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
  process.env.X_CLIENT_ID = "id";
  process.env.X_CLIENT_SECRET = "secret";
  assert.equal(xAuthConfigured(), false);
  process.env.X_REDIRECT_URI = "http://localhost:3000/api/auth/x/callback";
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
      assert.match(String(init?.headers && (init.headers as Record<string, string>).Authorization), /^Basic /);
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
