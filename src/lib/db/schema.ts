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
  xCreatedAt: text("x_created_at"),
  xFollowers: integer("x_followers").notNull().default(0),
  xVerified: integer("x_verified", { mode: "boolean" }).notNull().default(false),
  shareInActivity: integer("share_in_activity", { mode: "boolean" }).notNull().default(false),
  safetyStatus: text("safety_status").notNull().default(""),
  safetyReason: text("safety_reason").notNull().default(""),
  referralCode: text("referral_code"),
});

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  age: integer("age").notNull(),
  city: text("city").notNull(),
  occupation: text("occupation").notNull(),
  bio: text("bio").notNull(),
  pronouns: text("pronouns").notNull(),
  smoking: integer("smoking", { mode: "boolean" }).notNull(),
  kids: text("kids").notNull(),
  intent: text("intent").notNull(),
  interests: text("interests").notNull(),
  accent: text("accent").notNull(),
  voice: text("voice").notNull(),
});

export const prefs = sqliteTable("prefs", {
  userId: text("user_id").primaryKey(),
  ageMin: integer("age_min").notNull(),
  ageMax: integer("age_max").notNull(),
  cities: text("cities").notNull(),
  smoking: text("smoking").notNull(),
  kids: text("kids").notNull(),
  intent: text("intent").notNull(),
  niceToHaves: text("nice_to_haves").notNull(),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  onboarding: text("onboarding").notNull().default("{}"),
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

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporter_id").notNull(),
  targetId: text("target_id").notNull(),
  matchId: text("match_id").notNull().default(""),
  reason: text("reason").notNull().default(""),
  createdAt: text("created_at").notNull(),
});

export const blocks = sqliteTable("blocks", {
  id: text("id").primaryKey(),
  blockerId: text("blocker_id").notNull(),
  blockedId: text("blocked_id").notNull(),
  createdAt: text("created_at").notNull(),
});

/** Encrypted interview. The key lives in PREFS_KEY, never in this table. */
export const privatePrefs = sqliteTable("private_prefs", {
  memberId: text("member_id").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** One row per match check. No other member id and no result, so the log cannot leak a miss. */
export const matchCheckHits = sqliteTable("match_check_hits", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull(),
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
  x_created_at TEXT,
  x_followers INTEGER NOT NULL DEFAULT 0,
  x_verified INTEGER NOT NULL DEFAULT 0,
  share_in_activity INTEGER NOT NULL DEFAULT 0,
  safety_status TEXT NOT NULL DEFAULT '',
  safety_reason TEXT NOT NULL DEFAULT '',
  referral_code TEXT
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  age INTEGER NOT NULL,
  city TEXT NOT NULL,
  occupation TEXT NOT NULL,
  bio TEXT NOT NULL,
  pronouns TEXT NOT NULL,
  smoking INTEGER NOT NULL,
  kids TEXT NOT NULL,
  intent TEXT NOT NULL,
  interests TEXT NOT NULL,
  accent TEXT NOT NULL,
  voice TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  age_min INTEGER NOT NULL,
  age_max INTEGER NOT NULL,
  cities TEXT NOT NULL,
  smoking TEXT NOT NULL,
  kids TEXT NOT NULL,
  intent TEXT NOT NULL,
  nice_to_haves TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  onboarding TEXT NOT NULL DEFAULT '{}'
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
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id),
  target_id TEXT NOT NULL REFERENCES users(id),
  match_id TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  blocker_id TEXT NOT NULL REFERENCES users(id),
  blocked_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agent_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
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
CREATE UNIQUE INDEX IF NOT EXISTS reports_pair_idx ON reports(reporter_id, target_id);
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports(target_id);
CREATE UNIQUE INDEX IF NOT EXISTS blocks_pair_idx ON blocks(blocker_id, blocked_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_idx ON users(referral_code);
CREATE TABLE IF NOT EXISTS private_prefs (
  member_id TEXT PRIMARY KEY REFERENCES users(id),
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS match_check_hits (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS match_check_hits_member_idx ON match_check_hits(member_id, created_at);
`;
