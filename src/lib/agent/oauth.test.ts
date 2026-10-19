import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";
import { openDatabase, useAppDatabaseForTests } from "../db/open";
import { oauthCodes, users } from "../db/schema";
import { getMember } from "../domain";
import { X_ME_URL, X_TOKEN_URL, codeChallenge, randomVerifier } from "../x/pkce";
import { handleMcp } from "./mcp";
import { acceptableRedirectUri, authorizationServerMetadata, protectedResourceMetadata, storeMcpAuthorizationCode, wwwAuthenticate } from "./oauth";
import { issueAgentToken, memberForAgentToken } from "./tokens";

const ORIGIN = "https://botdate.vercel.app";
const REDIRECT = "https://grok.example/oauth/callback";

function cookieValue(setCookies: string[], name: string): string {
  const raw = setCookies.find((item) => item.startsWith(`${name}=`));
  assert.ok(raw, name);
  return decodeURIComponent(raw.slice(name.length + 1).split(";")[0] ?? "");
}

test("OAuth metadata points Grok at Sign in with X, PKCE, and dynamic registration", async () => {
  const { GET: authorization } = await import("../../app/.well-known/oauth-authorization-server/route");
  const { GET: resourceRoot } = await import("../../app/.well-known/oauth-protected-resource/route");
  const { GET: resourcePath } = await import("../../app/.well-known/oauth-protected-resource/api/mcp/route");
  const auth = await authorization(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`));
  const root = await resourceRoot(new Request(`${ORIGIN}/.well-known/oauth-protected-resource`));
  const path = await resourcePath(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`));
  assert.deepEqual(await auth.json(), authorizationServerMetadata(ORIGIN));
  assert.deepEqual(await root.json(), protectedResourceMetadata(ORIGIN));
  assert.deepEqual(await path.json(), protectedResourceMetadata(ORIGIN));
  const doc = authorizationServerMetadata(ORIGIN);
  assert.equal(doc.issuer, ORIGIN);
  assert.deepEqual(doc.code_challenge_methods_supported, ["S256"]);
  assert.equal(doc.registration_endpoint, `${ORIGIN}/oauth/register`);
  assert.equal(protectedResourceMetadata(ORIGIN).resource, `${ORIGIN}/api/mcp`);
  assert.equal(protectedResourceMetadata(ORIGIN).authorization_servers[0], ORIGIN);
  const challenge = wwwAuthenticate(ORIGIN, false);
  assert.match(challenge, /resource_metadata="https:\/\/botdate\.vercel\.app\/\.well-known\/oauth-protected-resource\/api\/mcp"/);
  assert.equal(acceptableRedirectUri("javascript:alert(1)"), false);
  assert.equal(acceptableRedirectUri("http://evil.example/cb"), false);
  assert.equal(acceptableRedirectUri("http://127.0.0.1:9/cb"), true);
  assert.equal(acceptableRedirectUri(REDIRECT), true);
});

test("adding the MCP URL signs in with X once, creates the member, and keeps a bearer key", async () => {
  const previous = {
    id: process.env.X_CLIENT_ID,
    secret: process.env.X_CLIENT_SECRET,
    redirect: process.env.X_REDIRECT_URI,
    session: process.env.SESSION_SECRET,
  };
  process.env.X_CLIENT_ID = "id";
  process.env.X_CLIENT_SECRET = "secret";
  process.env.X_REDIRECT_URI = `${ORIGIN}/api/auth/x/callback`;
  process.env.SESSION_SECRET = "test-session-secret";
  const db = await openDatabase(":memory:", { seed: true });
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
          },
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const { POST: mcp } = await import("../../app/api/mcp/route");
    const anonymous = await mcp(
      new Request(`${ORIGIN}/api/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
      }),
    );
    assert.equal(anonymous.status, 401);
    const www = anonymous.headers.get("www-authenticate") ?? "";
    assert.match(www, /Bearer/);
    assert.match(www, /resource_metadata="https:\/\/botdate\.vercel\.app\/\.well-known\/oauth-protected-resource\/api\/mcp"/);

    const { POST: register } = await import("../../app/oauth/register/route");
    const registered = await register(
      new Request(`${ORIGIN}/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Grok",
          redirect_uris: [REDIRECT],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      }),
    );
    assert.equal(registered.status, 201);
    const client = (await registered.json()) as { client_id: string };
    assert.match(client.client_id, /^mcp_/);

    const verifier = randomVerifier();
    const { GET: authorize } = await import("../../app/oauth/authorize/route");
    const started = await authorize(
      new Request(
        `${ORIGIN}/oauth/authorize?response_type=code&client_id=${client.client_id}&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=${codeChallenge(verifier)}&code_challenge_method=S256&state=grok-state&resource=${encodeURIComponent(`${ORIGIN}/api/mcp`)}&scope=mcp`,
      ),
    );
    assert.equal(started.status, 307);
    const xUrl = new URL(started.headers.get("location") ?? "");
    assert.equal(`${xUrl.origin}${xUrl.pathname}`, "https://x.com/i/oauth2/authorize");
    const state = cookieValue(started.headers.getSetCookie(), "botdate_x_state");
    const xVerifier = cookieValue(started.headers.getSetCookie(), "botdate_x_verifier");
    const pending = cookieValue(started.headers.getSetCookie(), "botdate_mcp_oauth");

    const { GET: callback } = await import("../../app/api/auth/x/callback/route");
    const finished = await callback(
      new Request(`${ORIGIN}/api/auth/x/callback?code=abc&state=${encodeURIComponent(state)}`, {
        headers: { cookie: `botdate_x_state=${state}; botdate_x_verifier=${xVerifier}; botdate_mcp_oauth=${pending}` },
      }),
    );
    assert.equal(finished.status, 307);
    const back = new URL(finished.headers.get("location") ?? "");
    assert.equal(`${back.origin}${back.pathname}`, REDIRECT);
    assert.equal(back.searchParams.get("state"), "grok-state");
    const code = back.searchParams.get("code") ?? "";
    assert.ok(code);
    assert.equal(calls.filter((url) => url.startsWith(X_ME_URL)).length, 1);
    const rows = db.db.select().from(users).where(eq(users.xUserId, "42")).all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.id, "x_42");
    assert.equal(getMember(db, "x_42")?.xAccount?.handle, "ada_bot");

    const website = issueAgentToken(db, "x_42");
    assert.ok(website);

    const { POST: token } = await import("../../app/oauth/token/route");
    const exchanged = await token(
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT,
          client_id: client.client_id,
          code_verifier: verifier,
          resource: `${ORIGIN}/api/mcp`,
        }),
      }),
    );
    assert.equal(exchanged.status, 200);
    const issued = (await exchanged.json()) as { access_token: string; refresh_token: string; token_type: string; expires_in: number };
    assert.equal(issued.token_type, "Bearer");
    assert.equal(issued.expires_in, 3600);
    assert.match(issued.access_token, /^bd_/);
    assert.match(issued.refresh_token, /^bdr_/);
    assert.equal(calls.filter((url) => url.startsWith(X_ME_URL)).length, 1);
    assert.ok(memberForAgentToken(db, website.token));
    assert.ok(memberForAgentToken(db, issued.access_token));

    const authed = handleMcp({
      ctx: db,
      authorization: `Bearer ${issued.access_token}`,
      message: { jsonrpc: "2.0", id: 7, method: "tools/list" },
    });
    assert.equal(authed.status, 200);
    const again = await token(
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT,
          client_id: client.client_id,
          code_verifier: verifier,
        }),
      }),
    );
    assert.equal(again.status, 200, "a quick retry of the same exchange with the right verifier still succeeds");
    const wrongVerifier = await token(
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT,
          client_id: client.client_id,
          code_verifier: randomVerifier(),
        }),
      }),
    );
    assert.equal(wrongVerifier.status, 400);
    db.db.update(oauthCodes).set({ usedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() }).run();
    const stale = await token(
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT,
          client_id: client.client_id,
          code_verifier: verifier,
        }),
      }),
    );
    assert.equal(stale.status, 400);
    assert.equal(((await stale.json()) as { error: string }).error, "invalid_grant");

    const dotted = "abc.DEF~ghi-JKL_mno.PQR~stu-VWX_yz0.123~456-789_abc";
    const dottedCode = storeMcpAuthorizationCode(
      db,
      {
        clientId: client.client_id,
        redirectUri: REDIRECT,
        state: "s",
        codeChallenge: codeChallenge(dotted),
        resource: `${ORIGIN}/api/mcp`,
        exp: Math.floor(Date.now() / 1000) + 600,
      },
      "x_42",
    );
    assert.ok(dottedCode);
    const dottedExchange = await token(
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: dottedCode,
          redirect_uri: REDIRECT,
          client_id: client.client_id,
          code_verifier: dotted,
        }),
      }),
    );
    assert.equal(dottedExchange.status, 200, "RFC 7636 verifiers may use . and ~");

    const refreshed = await token(
      new Request(`${ORIGIN}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: issued.refresh_token,
          client_id: client.client_id,
        }),
      }),
    );
    assert.equal(refreshed.status, 200);
    const next = (await refreshed.json()) as { access_token: string };
    assert.equal(memberForAgentToken(db, issued.access_token), null);
    assert.ok(memberForAgentToken(db, next.access_token));
    assert.ok(memberForAgentToken(db, website.token));
    const live = await mcp(
      new Request(`${ORIGIN}/api/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${website.token}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
    );
    assert.equal(live.status, 200);
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
