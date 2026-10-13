import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  botPaused: integer("bot_paused", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  xUserId: text("x_user_id"),
  xHandle: text("x_handle"),
  xAvatarUrl: text("x_avatar_url"),
  founder: integer("founder", { mode: "boolean" }).notNull().default(false),
  memberNumber: integer("member_number"),
  connectSeen: integer("connect_seen", { mode: "boolean" }).notNull().default(false),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeSubscriptionStatus: text("stripe_subscription_status"),
  referralCode: text("referral_code"),
  referredBy: text("referred_by"),
});

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  age: integer("age"),
  city: text("city"),
  occupation: text("occupation").notNull(),
  bio: text("bio").notNull(),
  gender: text("gender"),
  smoking: integer("smoking", { mode: "boolean" }).notNull(),
  kids: text("kids").notNull(),
  intent: text("intent").notNull(),
  interests: text("interests").notNull(),
  accent: text("accent").notNull(),
  voice: text("voice").notNull(),
});

export const prefs = sqliteTable("prefs", {
  userId: text("user_id").primaryKey(),
  ageMin: integer("age_min"),
  ageMax: integer("age_max"),
  cities: text("cities"),
  smoking: text("smoking").notNull(),
  kids: text("kids").notNull(),
  intent: text("intent").notNull(),
  niceToHaves: text("nice_to_haves").notNull(),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
});

export const matches = sqliteTable("matches", {
  id: text("id").primaryKey(),
  userAId: text("user_a_id").notNull(),
  userBId: text("user_b_id").notNull(),
  aOptIn: integer("a_opt_in", { mode: "boolean" }).notNull().default(false),
  bOptIn: integer("b_opt_in", { mode: "boolean" }).notNull().default(false),
  channelChoice: text("channel_choice").notNull().default("unset"),
  createdAt: text("created_at").notNull(),
});

export const botThreads = sqliteTable("bot_threads", {
  id: text("id").primaryKey(),
  matchId: text("match_id").notNull().unique(),
  createdAt: text("created_at").notNull(),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  matchId: text("match_id").notNull(),
  channel: text("channel").notNull(),
  authorUserId: text("author_user_id"),
  authorKind: text("author_kind").notNull(),
  body: text("body").notNull(),
  approvalStatus: text("approval_status").notNull(),
  scriptStep: integer("script_step"),
  edited: integer("edited", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const dateProposals = sqliteTable("date_proposals", {
  id: text("id").primaryKey(),
  matchId: text("match_id").notNull(),
  proposedByUserId: text("proposed_by_user_id").notNull(),
  startsAt: text("starts_at").notNull(),
  place: text("place").notNull(),
  note: text("note").notNull().default(""),
  status: text("status").notNull(),
  aDecision: text("a_decision").notNull().default("pending"),
  bDecision: text("b_decision").notNull().default("pending"),
  released: integer("released", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const agentTokens = sqliteTable("agent_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  tokenPrefix: text("token_prefix").notNull(),
  createdAt: text("created_at").notNull(),
  revokedAt: text("revoked_at"),
  lastUsedAt: text("last_used_at"),
  /** Null means the bearer key does not expire. OAuth access tokens set this. */
  expiresAt: text("expires_at"),
});

export const oauthClients = sqliteTable("oauth_clients", {
  clientId: text("client_id").primaryKey(),
  clientName: text("client_name").notNull(),
  redirectUris: text("redirect_uris").notNull(),
  createdAt: text("created_at").notNull(),
});

export const oauthCodes = sqliteTable("oauth_codes", {
  id: text("id").primaryKey(),
  codeHash: text("code_hash").notNull().unique(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  resource: text("resource").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});

export const oauthRefreshTokens = sqliteTable("oauth_refresh_tokens", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  clientId: text("client_id").notNull(),
  userId: text("user_id").notNull(),
  accessTokenId: text("access_token_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at").notNull(),
});

export const waitlistSignups = sqliteTable("waitlist", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  xHandle: text("x_handle"),
  position: integer("position").notNull().unique(),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: text("referred_by"),
  createdAt: text("created_at").notNull(),
});

/** Singleton row `botdateapp`. Tokens are AES-GCM ciphertext, never plaintext. */
export const xBotCredentials = sqliteTable("x_bot_credentials", {
  id: text("id").primaryKey(),
  xUserId: text("x_user_id").notNull(),
  username: text("username").notNull(),
  accessTokenCiphertext: text("access_token_ciphertext").notNull(),
  refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
  expiresAt: text("expires_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bot_paused INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  x_user_id TEXT,
  x_handle TEXT,
  x_avatar_url TEXT,
  founder INTEGER NOT NULL DEFAULT 0,
  member_number INTEGER,
  connect_seen INTEGER NOT NULL DEFAULT 0,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_subscription_status TEXT,
  referral_code TEXT,
  referred_by TEXT
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  age INTEGER,
  city TEXT,
  occupation TEXT NOT NULL,
  bio TEXT NOT NULL,
  gender TEXT,
  smoking INTEGER NOT NULL,
  kids TEXT NOT NULL,
  intent TEXT NOT NULL,
  interests TEXT NOT NULL,
  accent TEXT NOT NULL,
  voice TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  age_min INTEGER,
  age_max INTEGER,
  cities TEXT,
  smoking TEXT NOT NULL,
  kids TEXT NOT NULL,
  intent TEXT NOT NULL,
  nice_to_haves TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  user_a_id TEXT NOT NULL REFERENCES users(id),
  user_b_id TEXT NOT NULL REFERENCES users(id),
  a_opt_in INTEGER NOT NULL DEFAULT 0,
  b_opt_in INTEGER NOT NULL DEFAULT 0,
  channel_choice TEXT NOT NULL DEFAULT 'unset',
  created_at TEXT NOT NULL,
  UNIQUE (user_a_id, user_b_id)
);
CREATE TABLE IF NOT EXISTS bot_threads (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL UNIQUE REFERENCES matches(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  channel TEXT NOT NULL,
  author_user_id TEXT REFERENCES users(id),
  author_kind TEXT NOT NULL,
  body TEXT NOT NULL,
  approval_status TEXT NOT NULL,
  script_step INTEGER,
  edited INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS date_proposals (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id),
  proposed_by_user_id TEXT NOT NULL REFERENCES users(id),
  starts_at TEXT NOT NULL,
  place TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  a_decision TEXT NOT NULL DEFAULT 'pending',
  b_decision TEXT NOT NULL DEFAULT 'pending',
  released INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT,
  expires_at TEXT
);
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  user_id TEXT NOT NULL REFERENCES users(id),
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  resource TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  user_id TEXT NOT NULL REFERENCES users(id),
  access_token_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  x_handle TEXT,
  position INTEGER NOT NULL UNIQUE,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS x_bot_credentials (
  id TEXT PRIMARY KEY,
  x_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_match_idx ON messages(match_id);
CREATE INDEX IF NOT EXISTS proposals_match_idx ON date_proposals(match_id);
CREATE INDEX IF NOT EXISTS agent_tokens_user_idx ON agent_tokens(user_id);
CREATE INDEX IF NOT EXISTS waitlist_referred_idx ON waitlist(referred_by);
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_handle_idx ON waitlist(x_handle COLLATE NOCASE);
`;
