import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SYNCED_TABLES, openDatabase, useAppDatabaseForTests } from "../db/open";
import { SCHEMA_SQL, users, xBotCredentials } from "../db/schema";
import { isOpenPath } from "../http/public";
import { secretMatches } from "./admin-auth";
import { readBotOAuthState, signBotOAuthState } from "./bot-state";
import {
  REFRESH_IF_REMAINING_LT_MS,
  ensureBotAccessToken,
  isBotDateAppUsername,
  saveBotCredentials,
  shouldRefreshAccessToken,
} from "./bot-credentials";
import { XAuthError, exchangeAuthorizationCode, exchangeBotAuthorizationCode, normalizeExpiresIn, refreshBotAccessToken } from "./oauth";
import { X_BOT_SCOPES, X_SCOPES, X_TOKEN_URL, authorizeUrl, codeChallenge } from "./pkce";
import { X_TWEETS_URL, parsePostBody, parseSinceId, xUserMentionsUrl } from "./poster";
import { openSecret, sealSecret } from "./seal";

const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const SESSION = "test-session-secret-for-bot";
const ADMIN = "admin-secret-value";
const POSTER = "poster-secret-value";
const ACCESS = "AT_supersecrettokenvalue";
const REFRESH = "RT_supersecretrefreshtoken";
const CODE = "authcodeSECRETVALUE99";
const ORIGIN = "https://botdate.vercel.app";

const X_ENV = {
  X_CLIENT_ID: "id",
  X_CLIENT_SECRET: "secret",
  X_REDIRECT_URI: `${ORIGIN}/api/auth/x/callback`,
  SESSION_SECRET: SESSION,
  ADMIN_SECRET: ADMIN,
  POSTER_SECRET: POSTER,
};

describe("BotDateApp auto-posting", { concurrency: false }, () => {
  test("admin and poster secrets match in constant time and fail closed when unset", () => {
    assert.equal(secretMatches(ADMIN, ADMIN), true);
    assert.equal(secretMatches(ADMIN, "nope"), false);
    assert.equal(secretMatches(ADMIN, ""), false);
    assert.equal(secretMatches(undefined, ADMIN), false);
    assert.equal(secretMatches("", ""), false);
    assert.equal(secretMatches("short", "a-much-longer-wrong-secret"), false);
  });

  test("AES-GCM seals hide the token and only open with the same SESSION_SECRET", () => {
    const sealed = sealSecret(ACCESS, SESSION);
    const again = sealSecret(ACCESS, SESSION);
    assert.equal(sealed.startsWith("v1."), true);
    assert.notEqual(sealed, again);
    assert.equal(sealed.includes(ACCESS), false);
    assert.equal(openSecret(sealed, SESSION), ACCESS);
    assert.throws(() => openSecret(sealed, "other-secret"), /could not be read/);
    const [version, iv, tag, ciphertext] = sealed.split(".");
    const flipped = tag?.endsWith("a") ? `${tag.slice(0, -1)}b` : `${tag?.slice(0, -1)}a`;
    assert.throws(() => openSecret([version, iv, flipped, ciphertext].join("."), SESSION), /could not be read/);
    assert.throws(() => sealSecret(ACCESS, ""), /SESSION_SECRET/);
  });

  test("bot OAuth state is signed, carries mode=bot, and rejects tampering", () => {
    const now = Date.parse("2026-10-11T12:00:00.000Z");
    const state = signBotOAuthState(SESSION, now);
    const [body, sig] = state.split(".");
    assert.ok(body && sig);
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { mode: string; nonce: string; exp: number };
    assert.equal(payload.mode, "bot");
    assert.equal(payload.exp, Math.floor(now / 1000) + 600);
    const fresh = readBotOAuthState(state, SESSION, now);
    assert.equal(fresh.trusted && fresh.fresh, true);
    const expired = readBotOAuthState(state, SESSION, now + 11 * 60 * 1000);
    assert.deepEqual(expired, { trusted: true, fresh: false });
    const flipped = sig.endsWith("a") ? `${sig.slice(0, -1)}b` : `${sig.slice(0, -1)}a`;
    assert.deepEqual(readBotOAuthState(`${body}.${flipped}`, SESSION, now), { trusted: false });
    const rewritten = Buffer.from(JSON.stringify({ mode: "member", nonce: payload.nonce, exp: payload.exp })).toString("base64url");
    assert.deepEqual(readBotOAuthState(`${rewritten}.${sig}`, SESSION, now), { trusted: false });
    assert.deepEqual(readBotOAuthState("member-state-without-a-dot", SESSION, now), { trusted: false });
    assert.equal(isBotDateAppUsername("BotDateApp"), true);
    assert.equal(isBotDateAppUsername("@botdateapp"), true);
    assert.equal(isBotDateAppUsername("BOTDATEAPP"), true);
    assert.equal(isBotDateAppUsername("not_the_bot"), false);
  });

  test("access tokens refresh only when fewer than five minutes remain, defaulting to a two hour life", () => {
    const now = 1_700_000_000_000;
    assert.equal(normalizeExpiresIn(undefined), 7200);
    assert.equal(normalizeExpiresIn(0), 7200);
    assert.equal(normalizeExpiresIn(100.9), 100);
    assert.equal(REFRESH_IF_REMAINING_LT_MS, 5 * 60 * 1000);
    assert.equal(shouldRefreshAccessToken(now + 2 * 60 * 60 * 1000, now), false);
    assert.equal(shouldRefreshAccessToken(now + REFRESH_IF_REMAINING_LT_MS, now), false);
    assert.equal(shouldRefreshAccessToken(now + REFRESH_IF_REMAINING_LT_MS - 1, now), true);
    assert.equal(shouldRefreshAccessToken(Number.NaN, now), true);
  });

  test("bot authorize URL asks for write and offline access; member sign-in does not", () => {
    const bot = authorizeUrl({
      clientId: "client",
      redirectUri: `${ORIGIN}/api/auth/x/callback`,
      state: "state",
      verifier: VERIFIER,
      scopes: X_BOT_SCOPES,
    });
    assert.equal(new URL(bot).searchParams.get("scope"), "tweet.read tweet.write users.read offline.access");
    assert.match(bot, /scope=tweet\.read%20tweet\.write%20users\.read%20offline\.access/);
    assert.equal(bot.includes("+"), false);
    const member = authorizeUrl({
      clientId: "client",
      redirectUri: `${ORIGIN}/api/auth/x/callback`,
      state: "state",
      verifier: VERIFIER,
    });
    assert.equal(new URL(member).searchParams.get("scope"), X_SCOPES);
    assert.equal(isOpenPath("/api/admin/x/connect"), true);
    assert.equal(isOpenPath("/api/admin/x/post"), true);
    assert.equal(isOpenPath("/api/admin/x/mentions"), true);
    assert.equal(isOpenPath("/api/admin/x/mentions/"), true);
    assert.equal(isOpenPath("/admin/x/connected"), true);
    assert.equal(isOpenPath("/admin/x/connected/"), true);
    assert.equal(isOpenPath("/api/admin/x/secret"), false);
    assert.equal(isOpenPath("/admin/waitlist"), false);
    assert.equal(isOpenPath("/api/auth/x/callback"), true);
    assert.match(SCHEMA_SQL, /CREATE TABLE IF NOT EXISTS x_bot_credentials/);
    assert.match(SCHEMA_SQL, /access_token_ciphertext/);
    assert.match(SCHEMA_SQL, /refresh_token_ciphertext/);
    assert.equal(SYNCED_TABLES.includes("x_bot_credentials"), true);
    assert.deepEqual(parsePostBody({ text: "hello" }), { ok: true, value: { text: "hello", replyToId: null } });
    assert.deepEqual(parsePostBody({ text: "hello", reply_to_id: "99" }), { ok: true, value: { text: "hello", replyToId: "99" } });
    assert.equal(parsePostBody({ text: "  " }).ok, false);
    assert.equal(parsePostBody({ text: "hello", reply_to_id: 99 }).ok, false);
    assert.deepEqual(parseSinceId(null), { ok: true, sinceId: null });
    assert.deepEqual(parseSinceId(""), { ok: true, sinceId: null });
    assert.deepEqual(parseSinceId("55"), { ok: true, sinceId: "55" });
    assert.deepEqual(parseSinceId("nope"), { ok: false });
    assert.equal(xUserMentionsUrl("8675309", "55"), "https://api.x.com/2/users/8675309/mentions?since_id=55");
    assert.equal(xUserMentionsUrl("8675309", null), "https://api.x.com/2/users/8675309/mentions");
  });

  test("refresh uses Basic auth and member code exchange still returns only the access token", async () => {
    const creds = { clientId: "id", clientSecret: "secret", redirectUri: `${ORIGIN}/api/auth/x/callback` };
    const fetchImpl: typeof fetch = async (input, init) => {
      assert.equal(String(input), X_TOKEN_URL);
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers.Authorization, `Basic ${Buffer.from("id:secret").toString("base64")}`);
      const params = new URLSearchParams(String(init?.body));
      assert.equal(params.get("grant_type"), "refresh_token");
      assert.equal(params.get("refresh_token"), REFRESH);
      assert.equal(params.has("client_id"), false);
      assert.equal(params.has("client_secret"), false);
      return new Response(JSON.stringify({ access_token: "next-access-token", refresh_token: "next-refresh-token", expires_in: 7200 }), { status: 200 });
    };
    const refreshed = await refreshBotAccessToken(creds, REFRESH, fetchImpl);
    assert.deepEqual(refreshed, { accessToken: "next-access-token", refreshToken: "next-refresh-token", expiresIn: 7200 });

    const member = await exchangeAuthorizationCode(creds, "code", VERIFIER, async () => {
      return new Response(JSON.stringify({ access_token: "access", refresh_token: REFRESH, expires_in: 7200 }), { status: 200 });
    });
    assert.equal(member, "access");

    await assert.rejects(
      () => exchangeBotAuthorizationCode(creds, "code", VERIFIER, async () => new Response(JSON.stringify({ access_token: ACCESS }), { status: 200 })),
      (error: unknown) => {
        assert.ok(error instanceof XAuthError);
        assert.equal(error.message.includes(ACCESS), false);
        assert.equal(error.message, "X did not return a refresh token.");
        return true;
      },
    );
  });

  test("connect starts a separate PKCE flow and member sign-in keeps its scopes", async () => {
    await withEnv(X_ENV, async () => {
      const { GET: connect } = await import("../../app/api/admin/x/connect/route");
      const denied = await connect(new Request(`${ORIGIN}/api/admin/x/connect?key=wrong`));
      assert.equal(denied.status, 401);
      assert.equal(denied.headers.get("location"), null);
      await withEnv({ ...X_ENV, ADMIN_SECRET: undefined }, async () => {
        const unset = await connect(new Request(`${ORIGIN}/api/admin/x/connect?key=${ADMIN}`));
        assert.equal(unset.status, 401);
      });
      await withEnv({ ...X_ENV, X_CLIENT_ID: undefined }, async () => {
        const missing = await connect(new Request(`${ORIGIN}/api/admin/x/connect?key=${ADMIN}`));
        assert.equal(missing.status, 503);
      });
      await withEnv({ ...X_ENV, SESSION_SECRET: undefined }, async () => {
        const missingSecret = await connect(new Request(`${ORIGIN}/api/admin/x/connect?key=${ADMIN}`));
        assert.equal(missingSecret.status, 503);
      });

      const started = await connect(new Request(`${ORIGIN}/api/admin/x/connect?key=${ADMIN}`));
      assert.equal(started.status, 307);
      assert.equal(started.headers.get("referrer-policy"), "no-referrer");
      const location = started.headers.get("location") ?? "";
      assert.equal(location.includes(ADMIN), false);
      const authorize = new URL(location);
      assert.equal(authorize.origin + authorize.pathname, "https://x.com/i/oauth2/authorize");
      assert.equal(authorize.searchParams.get("scope"), X_BOT_SCOPES);
      assert.equal(authorize.searchParams.get("redirect_uri"), `${ORIGIN}/api/auth/x/callback`);
      assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
      const setCookies = started.headers.getSetCookie();
      const state = cookieValue(setCookies, "botdate_x_bot_state");
      const verifier = cookieValue(setCookies, "botdate_x_bot_verifier");
      assert.equal(authorize.searchParams.get("state"), state);
      assert.equal(authorize.searchParams.get("code_challenge"), codeChallenge(verifier));
      assert.equal(readBotOAuthState(state, SESSION).trusted, true);
      const decoded = JSON.parse(Buffer.from(state.split(".")[0] ?? "", "base64url").toString()) as { mode: string };
      assert.equal(decoded.mode, "bot");
      for (const name of ["botdate_x_bot_state", "botdate_x_bot_verifier"]) {
        const raw = setCookies.find((item) => item.startsWith(`${name}=`));
        assert.ok(raw);
        assert.match(raw, /HttpOnly/);
        assert.match(raw, /Secure/);
        assert.match(raw, /SameSite=Lax/i);
      }
      assert.equal(setCookies.some((item) => item.startsWith("botdate_x_state=")), false);
      assert.equal(setCookies.some((item) => item.startsWith("botdate_session=")), false);

      const { GET: start } = await import("../../app/api/auth/x/start/route");
      const member = await start(new Request(`${ORIGIN}/api/auth/x/start`));
      assert.equal(new URL(member.headers.get("location") ?? "").searchParams.get("scope"), X_SCOPES);
    });
  });

  test("bot callback stores encrypted tokens for @BotDateApp and leaves member login alone", async () => {
    const logs = captureLogs();
    const db = await openDatabase(":memory:", { seed: false });
    useAppDatabaseForTests(db);
    const originalFetch = globalThis.fetch;
    try {
      await withEnv(X_ENV, async () => {
        const { GET: connect } = await import("../../app/api/admin/x/connect/route");
        const started = await connect(new Request(`${ORIGIN}/api/admin/x/connect?key=${ADMIN}`));
        const setCookies = started.headers.getSetCookie();
        const state = cookieValue(setCookies, "botdate_x_bot_state");
        const verifier = cookieValue(setCookies, "botdate_x_bot_verifier");
        globalThis.fetch = async (input) => {
          const url = String(input);
          if (url.startsWith(X_TOKEN_URL)) {
            return new Response(JSON.stringify({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 7200 }), { status: 200 });
          }
          return profileResponse("bOtDaTeApP");
        };
        const { GET: callback } = await import("../../app/api/auth/x/callback/route");
        const finished = await callback(callbackRequest(state, verifier, `code=${CODE}`));
        assert.equal(finished.status, 307);
        const dest = new URL(finished.headers.get("location") ?? "");
        assert.equal(dest.pathname, "/admin/x/connected");
        assert.equal(dest.searchParams.get("error"), null);
        assert.equal(finished.headers.getSetCookie().some((item) => item.startsWith("botdate_session=")), false);
        const row = db.db.select().from(xBotCredentials).all()[0];
        assert.ok(row);
        assert.equal(row.xUserId, "8675309");
        assert.equal(row.username, "bOtDaTeApP");
        assert.equal(row.accessTokenCiphertext.includes(ACCESS), false);
        assert.equal(row.refreshTokenCiphertext.includes(REFRESH), false);
        assert.equal(openSecret(row.accessTokenCiphertext, SESSION), ACCESS);
        assert.equal(openSecret(row.refreshTokenCiphertext, SESSION), REFRESH);
        const remaining = Date.parse(row.expiresAt) - Date.now();
        assert.ok(remaining > 7000 * 1000 && remaining <= 7200 * 1000);
        assert.equal(db.db.select().from(users).all().length, 0);
        assert.equal(logs.text().includes(ACCESS), false);
        assert.equal(logs.text().includes(REFRESH), false);
        assert.equal(logs.text().includes(CODE), false);
        assert.equal(logs.text().includes(verifier), false);

        globalThis.fetch = async (input) => {
          const url = String(input);
          if (url.startsWith(X_TOKEN_URL)) {
            return new Response(JSON.stringify({ access_token: ACCESS, refresh_token: REFRESH, expires_in: 7200 }), { status: 200 });
          }
          return profileResponse("not_the_bot");
        };
        const rejected = await callback(callbackRequest(state, verifier, `code=${CODE}`));
        const rejectedDest = new URL(rejected.headers.get("location") ?? "");
        assert.equal(rejectedDest.pathname, "/admin/x/connected");
        assert.equal(rejectedDest.searchParams.get("error"), "account");
        assert.equal(db.db.select().from(users).all().length, 0);
        assert.match(logs.text(), /username=not_the_bot/);
        assert.equal(logs.text().includes(ACCESS), false);

        const denied = await callback(callbackRequest(state, verifier, "error=access_denied&error_description=nope"));
        assert.equal(new URL(denied.headers.get("location") ?? "").searchParams.get("error"), "denied");

        const expiredState = signBotOAuthState(SESSION, Date.now() - 11 * 60 * 1000);
        let fetched = false;
        globalThis.fetch = async () => {
          fetched = true;
          throw new Error("expired state must not call X");
        };
        const expired = await callback(callbackRequest(expiredState, verifier, `code=${CODE}`));
        assert.equal(new URL(expired.headers.get("location") ?? "").searchParams.get("error"), "expired");
        assert.equal(fetched, false);

        const tampered = `${state.slice(0, -1)}${state.endsWith("a") ? "b" : "a"}`;
        const member = await callback(new Request(`${ORIGIN}/api/auth/x/callback?code=${CODE}&state=${encodeURIComponent(tampered)}`));
        assert.equal(new URL(member.headers.get("location") ?? "").pathname, "/login");
      });
    } finally {
      logs.restore();
      globalThis.fetch = originalFetch;
      useAppDatabaseForTests(null);
      db.close();
    }
  });

  test("poster endpoints require POSTER_SECRET, post, reply, refresh, and list mentions", async () => {
    const logs = captureLogs();
    const db = await openDatabase(":memory:", { seed: false });
    useAppDatabaseForTests(db);
    const originalFetch = globalThis.fetch;
    try {
      await withEnv(X_ENV, async () => {
        const { POST } = await import("../../app/api/admin/x/post/route");
        const { GET } = await import("../../app/api/admin/x/mentions/route");
        globalThis.fetch = async () => {
          throw new Error("auth failures must not call X");
        };
        const unset = await withEnv({ ...X_ENV, POSTER_SECRET: undefined }, () =>
          POST(jsonRequest("POST", { text: "hello" }, `Bearer ${POSTER}`)),
        );
        assert.equal(unset.status, 401);
        const wrong = await POST(jsonRequest("POST", { text: "hello" }, "Bearer wrong-poster-secret"));
        assert.equal(wrong.status, 401);
        assert.deepEqual(await wrong.json(), { error: "unauthorized" });
        const bad = await POST(jsonRequest("POST", { text: "" }, `Bearer ${POSTER}`));
        assert.equal(bad.status, 400);
        const missing = await POST(jsonRequest("POST", { text: "hello" }, `Bearer ${POSTER}`));
        assert.equal(missing.status, 503);
        assert.deepEqual(await missing.json(), { error: "BotDateApp is not connected." });

        saveBotCredentials(db, {
          xUserId: "8675309",
          username: "BotDateApp",
          accessToken: ACCESS,
          refreshToken: REFRESH,
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          secret: SESSION,
        });
        globalThis.fetch = async (input, init) => {
          const url = String(input);
          assert.equal(header(init, "Authorization"), `Bearer ${ACCESS}`);
          assert.equal(header(init, "Authorization").includes(POSTER), false);
          if (url === X_TWEETS_URL) {
            assert.deepEqual(JSON.parse(String(init?.body)), { text: "hello from the bot" });
            return new Response(JSON.stringify({ data: { id: "1001", text: "hello from the bot" } }), { status: 200 });
          }
          throw new Error(`unexpected ${url}`);
        };
        const posted = await POST(jsonRequest("POST", { text: "hello from the bot" }, `Bearer ${POSTER}`));
        assert.equal(posted.status, 200);
        assert.deepEqual(await posted.json(), { id: "1001" });

        globalThis.fetch = async (input, init) => {
          assert.equal(String(input), X_TWEETS_URL);
          assert.deepEqual(JSON.parse(String(init?.body)), { text: "reply", reply: { in_reply_to_tweet_id: "1001" } });
          return new Response(JSON.stringify({ data: { id: "1002" } }), { status: 200 });
        };
        const reply = await POST(jsonRequest("POST", { text: "reply", reply_to_id: "1001" }, `Bearer ${POSTER}`));
        assert.deepEqual(await reply.json(), { id: "1002" });

        const leaked = ACCESS;
        globalThis.fetch = async () => new Response(JSON.stringify({ detail: leaked }), { status: 403 });
        const failed = await POST(jsonRequest("POST", { text: "nope" }, `Bearer ${POSTER}`));
        assert.equal(failed.status, 502);
        assert.equal(JSON.stringify(await failed.json()).includes(ACCESS), false);

        saveBotCredentials(db, {
          xUserId: "8675309",
          username: "BotDateApp",
          accessToken: ACCESS,
          refreshToken: REFRESH,
          expiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
          secret: SESSION,
        });
        const seen: string[] = [];
        globalThis.fetch = async (input, init) => {
          const url = String(input);
          seen.push(url);
          if (url === X_TOKEN_URL) {
            const params = new URLSearchParams(String(init?.body));
            assert.equal(params.get("grant_type"), "refresh_token");
            assert.equal(params.get("refresh_token"), REFRESH);
            assert.equal(header(init, "Authorization"), `Basic ${Buffer.from("id:secret").toString("base64")}`);
            return new Response(
              JSON.stringify({ access_token: "AT_rotatedaccesstoken", refresh_token: "RT_rotatedrefreshtoken", expires_in: 7200 }),
              { status: 200 },
            );
          }
          if (url === X_TWEETS_URL) {
            assert.equal(header(init, "Authorization"), "Bearer AT_rotatedaccesstoken");
            return new Response(JSON.stringify({ data: { id: "1003" } }), { status: 200 });
          }
          throw new Error(`unexpected ${url}`);
        };
        const rotated = await POST(jsonRequest("POST", { text: "after refresh" }, `Bearer ${POSTER}`));
        assert.deepEqual(await rotated.json(), { id: "1003" });
        assert.deepEqual(seen, [X_TOKEN_URL, X_TWEETS_URL]);
        const row = db.db.select().from(xBotCredentials).all()[0];
        assert.ok(row);
        assert.equal(openSecret(row.refreshTokenCiphertext, SESSION), "RT_rotatedrefreshtoken");
        assert.equal(openSecret(row.accessTokenCiphertext, SESSION), "AT_rotatedaccesstoken");
        assert.equal(row.refreshTokenCiphertext.includes(REFRESH), false);
        assert.equal(row.refreshTokenCiphertext.includes("RT_rotatedrefreshtoken"), false);
        const left = Date.parse(row.expiresAt) - Date.now();
        assert.ok(left > 7000 * 1000);

        globalThis.fetch = async (input, init) => {
          assert.equal(String(input), "https://api.x.com/2/users/8675309/mentions?since_id=1003");
          assert.equal(header(init, "Authorization"), "Bearer AT_rotatedaccesstoken");
          return new Response(JSON.stringify({ data: [{ id: "1004", text: "hi @BotDateApp" }], meta: { result_count: 1 } }), { status: 200 });
        };
        const mentions = await GET(new Request(`${ORIGIN}/api/admin/x/mentions?since_id=1003`, { headers: { authorization: `Bearer ${POSTER}` } }));
        assert.equal(mentions.status, 200);
        assert.deepEqual(await mentions.json(), { data: [{ id: "1004", text: "hi @BotDateApp" }], meta: { result_count: 1 } });

        globalThis.fetch = async (input) => {
          assert.equal(String(input), "https://api.x.com/2/users/8675309/mentions");
          return new Response(JSON.stringify({ meta: { result_count: 0 } }), { status: 200 });
        };
        const all = await GET(new Request(`${ORIGIN}/api/admin/x/mentions`, { headers: { authorization: `Bearer ${POSTER}` } }));
        assert.deepEqual(await all.json(), { data: [], meta: { result_count: 0 } });
        const badSince = await GET(new Request(`${ORIGIN}/api/admin/x/mentions?since_id=nope`, { headers: { authorization: `Bearer ${POSTER}` } }));
        assert.equal(badSince.status, 400);

        const now = Date.parse("2026-10-11T12:00:00.000Z");
        saveBotCredentials(db, {
          xUserId: "8675309",
          username: "BotDateApp",
          accessToken: ACCESS,
          refreshToken: REFRESH,
          expiresAt: new Date(now + REFRESH_IF_REMAINING_LT_MS).toISOString(),
          secret: SESSION,
          now,
        });
        let refreshed = false;
        const held = await ensureBotAccessToken(db, {
          now,
          fetchImpl: async () => {
            refreshed = true;
            throw new Error("five minutes remaining must not refresh");
          },
        });
        assert.equal(refreshed, false);
        assert.equal(held.accessToken, ACCESS);
        assert.equal(logs.text().includes(ACCESS), false);
        assert.equal(logs.text().includes(REFRESH), false);
        assert.equal(logs.text().includes("RT_rotatedrefreshtoken"), false);
      });
    } finally {
      logs.restore();
      globalThis.fetch = originalFetch;
      useAppDatabaseForTests(null);
      db.close();
    }
  });
});

function profileResponse(username: string): Response {
  return new Response(
    JSON.stringify({
      data: {
        id: "8675309",
        name: "BotDate",
        username,
        description: "The BotDate account.",
        profile_image_url: "https://pbs.twimg.com/profile_images/a/b_normal.jpg",
      },
    }),
    { status: 200 },
  );
}

function callbackRequest(state: string, verifier: string, query: string): Request {
  return new Request(`${ORIGIN}/api/auth/x/callback?${query}&state=${encodeURIComponent(state)}`, {
    headers: { cookie: `botdate_x_bot_state=${state}; botdate_x_bot_verifier=${verifier}` },
  });
}

function jsonRequest(method: string, body: unknown, authorization: string): Request {
  return new Request(`${ORIGIN}/api/admin/x/post`, {
    method,
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function header(init: RequestInit | undefined, name: string): string {
  const headers = init?.headers;
  if (!headers) return "";
  if (headers instanceof Headers) return headers.get(name) ?? "";
  if (Array.isArray(headers)) return headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1] ?? "";
  const record = headers as Record<string, string>;
  return record[name] ?? record[name.toLowerCase()] ?? "";
}

function cookieValue(setCookies: string[], name: string): string {
  const raw = setCookies.find((item) => item.startsWith(`${name}=`));
  assert.ok(raw, name);
  const value = raw.slice(name.length + 1).split(";")[0] ?? "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function withEnv(values: Record<string, string | undefined>, fn: () => Promise<unknown>): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) previous[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function captureLogs() {
  const lines: string[] = [];
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };
  const push = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  console.log = push;
  console.info = push;
  console.warn = push;
  console.error = push;
  console.debug = push;
  return {
    text: () => lines.join("\n"),
    restore() {
      console.log = original.log;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
      console.debug = original.debug;
    },
  };
}
