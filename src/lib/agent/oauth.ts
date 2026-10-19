import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { BotDateDb } from "../db/open";
import { oauthClients, oauthCodes, oauthRefreshTokens } from "../db/schema";
import { getMember } from "../domain";
import { corsHeaders } from "../http/cors";
import { sessionSecret } from "../session";
import { codeChallenge } from "../x/pkce";
import { markConnectSeen } from "../x/account";
import { hashAgentToken, issueCompanionAgentToken, revokeAgentTokenId } from "./tokens";

export const MCP_OAUTH_COOKIE = "botdate_mcp_oauth";
export const MCP_SCOPE = "mcp";
export const ACCESS_TOKEN_SECONDS = 60 * 60;
export const REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 30;
const AUTH_CODE_SECONDS = 10 * 60;
/** A client that retries the same code exchange (lost response, timeout) within this window still gets tokens. */
export const CODE_RETRY_GRACE_SECONDS = 120;
/** RFC 7636: code_verifier is 43-128 unreserved characters, including "." and "~". */
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

const BLOCKED_SCHEMES = new Set(["javascript", "data", "file", "blob", "vbscript"]);

export type PendingMcpOauth = {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  resource: string;
  exp: number;
};

export type OauthForm = Record<string, string>;

type OauthFailure = { ok: false; status: number; error: string; description: string; redirect: string | null };
type AuthorizeOk = { ok: true; pending: Omit<PendingMcpOauth, "exp"> };

export function requestOrigin(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const url = new URL(request.url);
  if (forwarded === "https" || forwarded === "http") {
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host") || url.host;
    return `${forwarded}://${host}`;
  }
  return url.origin;
}

export function mcpResourceUrl(origin: string): string {
  return `${origin}/api/mcp`;
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [MCP_SCOPE],
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: mcpResourceUrl(origin),
    authorization_servers: [origin],
    bearer_methods_supported: ["header"],
    scopes_supported: [MCP_SCOPE],
  };
}

export function wwwAuthenticate(origin: string, invalidToken: boolean): string {
  const metadata = `${origin}/.well-known/oauth-protected-resource/api/mcp`;
  if (invalidToken) return `Bearer realm="botdate", error="invalid_token", resource_metadata="${metadata}"`;
  return `Bearer realm="botdate", resource_metadata="${metadata}"`;
}

export function metadataJson(body: unknown): Response {
  return Response.json(body, {
    headers: { ...corsHeaders, "Cache-Control": "public, max-age=3600" },
  });
}

export function oauthJson(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}

/** https, loopback http, or a private app scheme. Fragments and scriptable schemes are rejected. */
export function acceptableRedirectUri(value: string): boolean {
  if (value.length < 1 || value.length > 500 || value.includes("#") || /\s/.test(value)) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  if (BLOCKED_SCHEMES.has(scheme)) return false;
  if (scheme === "https") return url.hostname.length > 0;
  if (scheme === "http") {
    const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  }
  return /^[a-z][a-z0-9+.-]*$/.test(scheme);
}

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function sameResource(value: string, origin: string): boolean {
  return value.trim().replace(/\/$/, "") === mcpResourceUrl(origin);
}

function redirectUrisOf(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function clientAllows(ctx: BotDateDb, clientId: string, redirectUri: string): boolean {
  const client = ctx.db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).get();
  if (!client) return false;
  return redirectUrisOf(client.redirectUris).includes(redirectUri);
}

function deny(redirect: string | null, state: string, error: string, description: string, status = 400): OauthFailure {
  if (!redirect) return { ok: false, status, error, description, redirect: null };
  const dest = new URL(redirect);
  dest.searchParams.set("error", error);
  dest.searchParams.set("error_description", description);
  if (state) dest.searchParams.set("state", state);
  return { ok: false, status, error, description, redirect: dest.toString() };
}

export function registerMcpClient(ctx: BotDateDb, payload: unknown): { status: number; body: Record<string, unknown> } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { status: 400, body: { error: "invalid_client_metadata", error_description: "Send a JSON object." } };
  }
  const record = payload as Record<string, unknown>;
  const uris = record.redirect_uris;
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 8 || uris.some((item) => typeof item !== "string" || !acceptableRedirectUri(item))) {
    return { status: 400, body: { error: "invalid_client_metadata", error_description: "redirect_uris must be https, loopback, or an app scheme." } };
  }
  const method = record.token_endpoint_auth_method ?? "none";
  if (method !== "none") {
    return { status: 400, body: { error: "invalid_client_metadata", error_description: "BotDate clients use PKCE and token_endpoint_auth_method none." } };
  }
  if (record.grant_types !== undefined) {
    if (!Array.isArray(record.grant_types) || record.grant_types.some((item) => item !== "authorization_code" && item !== "refresh_token")) {
      return { status: 400, body: { error: "invalid_client_metadata", error_description: "grant_types must be authorization_code and refresh_token." } };
    }
  }
  if (record.response_types !== undefined) {
    if (!Array.isArray(record.response_types) || record.response_types.some((item) => item !== "code")) {
      return { status: 400, body: { error: "invalid_client_metadata", error_description: "response_types must be code." } };
    }
  }
  const now = new Date();
  const clientId = `mcp_${randomBytes(16).toString("base64url")}`;
  const clientName = typeof record.client_name === "string" && record.client_name.trim() ? clip(record.client_name, 80) : "MCP client";
  const redirectUris = uris as string[];
  ctx.db
    .insert(oauthClients)
    .values({
      clientId,
      clientName,
      redirectUris: JSON.stringify(redirectUris),
      createdAt: now.toISOString(),
    })
    .run();
  return {
    status: 201,
    body: {
      client_id: clientId,
      client_id_issued_at: Math.floor(now.getTime() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    },
  };
}

export function prepareMcpAuthorize(ctx: BotDateDb, params: URLSearchParams, origin: string): AuthorizeOk | OauthFailure {
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state") ?? "";
  const registered = clientId && redirectUri && clientAllows(ctx, clientId, redirectUri) ? redirectUri : null;
  if (!clientId || !ctx.db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).get()) {
    return deny(null, state, "invalid_client", "Unknown client_id.", 401);
  }
  if (!registered) return deny(null, state, "invalid_request", "redirect_uri is not registered for this client.");
  if ((params.get("response_type") ?? "") !== "code") {
    return deny(registered, state, "unsupported_response_type", "response_type must be code.");
  }
  if ((params.get("code_challenge_method") ?? "") !== "S256") {
    return deny(registered, state, "invalid_request", "code_challenge_method must be S256.");
  }
  const challenge = params.get("code_challenge") ?? "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
    return deny(registered, state, "invalid_request", "code_challenge must be the S256 challenge.");
  }
  const resource = params.get("resource");
  if (resource && !sameResource(resource, origin)) {
    return deny(registered, state, "invalid_target", "resource must be this server's MCP URL.");
  }
  return {
    ok: true,
    pending: {
      clientId,
      redirectUri: registered,
      state,
      codeChallenge: challenge,
      resource: mcpResourceUrl(origin),
    },
  };
}

export function signPendingMcpOauth(pending: Omit<PendingMcpOauth, "exp">, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...pending, exp: Math.floor(now / 1000) + AUTH_CODE_SECONDS })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyPendingMcpOauth(token: string, now = Date.now()): PendingMcpOauth | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as Partial<PendingMcpOauth>;
    if (typeof parsed.exp !== "number" || parsed.exp * 1000 <= now) return null;
    if (typeof parsed.clientId !== "string" || typeof parsed.redirectUri !== "string") return null;
    if (typeof parsed.codeChallenge !== "string" || typeof parsed.resource !== "string") return null;
    if (typeof parsed.state !== "string") return null;
    if (!acceptableRedirectUri(parsed.redirectUri)) return null;
    return {
      clientId: parsed.clientId,
      redirectUri: parsed.redirectUri,
      state: parsed.state,
      codeChallenge: parsed.codeChallenge,
      resource: parsed.resource,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}

export function mcpOauthCodeLocation(pending: Pick<PendingMcpOauth, "redirectUri" | "state">, code: string): string {
  const dest = new URL(pending.redirectUri);
  dest.searchParams.set("code", code);
  if (pending.state) dest.searchParams.set("state", pending.state);
  return dest.toString();
}

export function mcpOauthErrorLocation(pending: Pick<PendingMcpOauth, "redirectUri" | "state">, error: string, description: string): string {
  const dest = new URL(pending.redirectUri);
  dest.searchParams.set("error", error);
  dest.searchParams.set("error_description", description.slice(0, 180));
  if (pending.state) dest.searchParams.set("state", pending.state);
  return dest.toString();
}

/** After the one users/me upsert. Returns the authorization code, or null if the member row is missing. */
export function storeMcpAuthorizationCode(ctx: BotDateDb, pending: PendingMcpOauth, userId: string): string | null {
  if (!getMember(ctx, userId)) return null;
  if (!clientAllows(ctx, pending.clientId, pending.redirectUri)) return null;
  const code = randomBytes(32).toString("base64url");
  const now = new Date();
  ctx.db
    .insert(oauthCodes)
    .values({
      id: `code_${crypto.randomUUID()}`,
      codeHash: hashAgentToken(code),
      clientId: pending.clientId,
      userId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      resource: pending.resource,
      expiresAt: new Date(now.getTime() + AUTH_CODE_SECONDS * 1000).toISOString(),
      usedAt: null,
      createdAt: now.toISOString(),
    })
    .run();
  return code;
}

function pkceMatches(verifier: string, challenge: string): boolean {
  if (!VERIFIER.test(verifier)) return false;
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return false;
  let actual: string;
  try {
    actual = codeChallenge(verifier);
  } catch {
    return false;
  }
  const left = Buffer.from(actual);
  const right = Buffer.from(challenge);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function tokenBody(accessToken: string, refreshToken: string) {
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_SECONDS,
    refresh_token: refreshToken,
    scope: MCP_SCOPE,
  };
}

function issueRefresh(ctx: BotDateDb, clientId: string, userId: string, accessTokenId: string, now: Date): string {
  const refresh = `bdr_${randomBytes(32).toString("base64url")}`;
  ctx.db
    .insert(oauthRefreshTokens)
    .values({
      id: `ort_${crypto.randomUUID()}`,
      tokenHash: hashAgentToken(refresh),
      clientId,
      userId,
      accessTokenId,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_SECONDS * 1000).toISOString(),
      revokedAt: null,
      createdAt: now.toISOString(),
    })
    .run();
  return refresh;
}

function revokeRefreshFamily(ctx: BotDateDb, userId: string, clientId: string) {
  const rows = ctx.db
    .select()
    .from(oauthRefreshTokens)
    .where(and(eq(oauthRefreshTokens.userId, userId), eq(oauthRefreshTokens.clientId, clientId)))
    .all();
  const now = new Date().toISOString();
  for (const row of rows) {
    revokeAgentTokenId(ctx, row.accessTokenId);
    if (!row.revokedAt) {
      ctx.db.update(oauthRefreshTokens).set({ revokedAt: now }).where(eq(oauthRefreshTokens.id, row.id)).run();
    }
  }
}

export type GrantResult = { status: number; body: Record<string, unknown>; reason?: string };

/** `reason` is for server logs only; it never contains a code, token, or verifier. */
function invalidGrant(description: string, reason: string): GrantResult {
  return { status: 400, body: { error: "invalid_grant", error_description: description }, reason };
}

function secondsSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? Math.round((now - parsed) / 1000) : null;
}

export function grantMcpToken(ctx: BotDateDb, form: OauthForm): GrantResult {
  const grant = form.grant_type ?? "";
  const clientId = form.client_id ?? "";
  if (!clientId || !ctx.db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).get()) {
    return { status: 401, body: { error: "invalid_client", error_description: "Unknown client_id." } };
  }
  if (grant === "authorization_code") return grantAuthorizationCode(ctx, form, clientId);
  if (grant === "refresh_token") return grantRefreshToken(ctx, form, clientId);
  return { status: 400, body: { error: "unsupported_grant_type", error_description: "Use authorization_code or refresh_token." } };
}

function grantAuthorizationCode(ctx: BotDateDb, form: OauthForm, clientId: string): GrantResult {
  const code = form.code ?? "";
  const redirectUri = form.redirect_uri ?? "";
  const verifier = form.code_verifier ?? "";
  if (!code || !redirectUri || !verifier) {
    const missing = [!code && "code", !redirectUri && "redirect_uri", !verifier && "code_verifier"].filter(Boolean).join(",");
    return invalidGrant("code, redirect_uri, and code_verifier are required.", `missing_params:${missing}`);
  }
  const row = ctx.db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, hashAgentToken(code))).get();
  if (!row) return invalidGrant("That authorization code is not valid.", "code_not_found");
  const age = secondsSince(row.createdAt);
  if (row.clientId !== clientId) return invalidGrant("That authorization code is not valid.", `client_mismatch age=${age}s`);
  if (row.redirectUri !== redirectUri) return invalidGrant("That authorization code is not valid.", `redirect_uri_mismatch age=${age}s`);
  if (Date.parse(row.expiresAt) <= Date.now()) return invalidGrant("That authorization code expired.", `code_expired age=${age}s`);
  if (form.resource && form.resource.trim().replace(/\/$/, "") !== row.resource.replace(/\/$/, "")) {
    return invalidGrant("resource does not match the authorization request.", `resource_mismatch age=${age}s`);
  }
  if (!pkceMatches(verifier, row.codeChallenge)) {
    const shape = VERIFIER.test(verifier) ? "verifier_hash_mismatch" : `verifier_bad_format len=${verifier.length}`;
    return invalidGrant("PKCE verification failed.", `pkce_failed ${shape} age=${age}s`);
  }
  const usedAgo = secondsSince(row.usedAt);
  if (row.usedAt && (usedAgo === null || usedAgo > CODE_RETRY_GRACE_SECONDS)) {
    return invalidGrant("That authorization code was already used.", `code_reused used_ago=${usedAgo}s age=${age}s`);
  }
  const now = new Date();
  if (!row.usedAt) ctx.db.update(oauthCodes).set({ usedAt: now.toISOString() }).where(eq(oauthCodes.id, row.id)).run();
  const access = issueCompanionAgentToken(ctx, row.userId, new Date(now.getTime() + ACCESS_TOKEN_SECONDS * 1000).toISOString());
  if (!access) return invalidGrant("That member is not available.", "member_unavailable");
  markConnectSeen(ctx, row.userId);
  const refresh = issueRefresh(ctx, clientId, row.userId, access.id, now);
  return { status: 200, body: tokenBody(access.token, refresh), reason: row.usedAt ? `code_retry_within_grace used_ago=${usedAgo}s` : undefined };
}

function grantRefreshToken(ctx: BotDateDb, form: OauthForm, clientId: string): GrantResult {
  const refresh = form.refresh_token ?? "";
  if (!refresh.startsWith("bdr_")) return invalidGrant("That refresh token is not valid.", "refresh_bad_format");
  const row = ctx.db.select().from(oauthRefreshTokens).where(eq(oauthRefreshTokens.tokenHash, hashAgentToken(refresh))).get();
  if (!row) return invalidGrant("That refresh token is not valid.", "refresh_not_found");
  if (row.clientId !== clientId) return invalidGrant("That refresh token is not valid.", "refresh_client_mismatch");
  if (row.revokedAt) {
    revokeRefreshFamily(ctx, row.userId, row.clientId);
    return invalidGrant("That refresh token was already used.", `refresh_reused revoked_ago=${secondsSince(row.revokedAt)}s`);
  }
  if (Date.parse(row.expiresAt) <= Date.now()) return invalidGrant("That refresh token expired.", "refresh_expired");
  const now = new Date();
  ctx.db.update(oauthRefreshTokens).set({ revokedAt: now.toISOString() }).where(eq(oauthRefreshTokens.id, row.id)).run();
  revokeAgentTokenId(ctx, row.accessTokenId);
  const access = issueCompanionAgentToken(ctx, row.userId, new Date(now.getTime() + ACCESS_TOKEN_SECONDS * 1000).toISOString());
  if (!access) return invalidGrant("That member is not available.", "member_unavailable");
  const next = issueRefresh(ctx, clientId, row.userId, access.id, now);
  return { status: 200, body: tokenBody(access.token, next) };
}

export async function readOauthBody(request: Request): Promise<OauthForm | null> {
  const text = await request.text();
  if (text.length > 16_000) return null;
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const out: OauthForm = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string") out[key] = value;
      }
      return out;
    } catch {
      return null;
    }
  }
  const params = new URLSearchParams(text);
  const out: OauthForm = {};
  for (const [key, value] of params.entries()) out[key] = value;
  return out;
}
