/** Columns added after the first demo schema. CREATE TABLE IF NOT EXISTS will not add them. */
export const ADDED_COLUMNS: { table: string; column: string; ddl: string; after?: string }[] = [
  { table: "users", column: "x_user_id", ddl: "TEXT" },
  { table: "users", column: "x_handle", ddl: "TEXT" },
  { table: "users", column: "x_avatar_url", ddl: "TEXT" },
  { table: "date_proposals", column: "released", ddl: "INTEGER NOT NULL DEFAULT 1" },
  { table: "users", column: "founder", ddl: "INTEGER NOT NULL DEFAULT 0" },
  { table: "users", column: "member_number", ddl: "INTEGER" },
  { table: "users", column: "connect_seen", ddl: "INTEGER NOT NULL DEFAULT 0" },
  { table: "users", column: "stripe_customer_id", ddl: "TEXT" },
  { table: "users", column: "stripe_subscription_id", ddl: "TEXT" },
  { table: "users", column: "stripe_subscription_status", ddl: "TEXT" },
  { table: "users", column: "referral_code", ddl: "TEXT" },
  { table: "users", column: "referred_by", ddl: "TEXT" },
  { table: "agent_tokens", column: "last_used_at", ddl: "TEXT" },
  { table: "agent_tokens", column: "expires_at", ddl: "TEXT" },
  { table: "prefs", column: "seeking", ddl: "TEXT" },
  { table: "prefs", column: "dealbreakers", ddl: "TEXT", after: "UPDATE prefs SET dealbreakers = '[]' WHERE dealbreakers IS NULL" },
];

export const X_USER_INDEX = "CREATE UNIQUE INDEX IF NOT EXISTS users_x_user_idx ON users(x_user_id)";
export const REFERRAL_INDEX = "CREATE UNIQUE INDEX IF NOT EXISTS users_referral_idx ON users(referral_code)";
export const STRIPE_CUSTOMER_INDEX = "CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_idx ON users(stripe_customer_id)";

export function missingColumnStatements(columnsByTable: Record<string, readonly string[]>): string[] {
  return ADDED_COLUMNS.filter((column) => !(columnsByTable[column.table] ?? []).includes(column.column)).map(
    (column) => `ALTER TABLE ${column.table} ADD COLUMN ${column.column} ${column.ddl}`,
  );
}

export function isBenignMigrationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate column|already exists/i.test(message);
}

/** Signup defaults written before profiles were allowed to be unknown. */
export const PLACEHOLDER_AGE = 30;
export const PLACEHOLDER_CITY = "San Francisco";
export const PLACEHOLDER_OCCUPATION = "New here";
export const PLACEHOLDER_PRONOUNS = "they/them";
export const PLACEHOLDER_BIO = "Signed in with X.";
export const PLACEHOLDER_AGE_MIN = 25;
export const PLACEHOLDER_AGE_MAX = 45;
export const PLACEHOLDER_CITIES_JSON = '["San Francisco"]';

export type ProfileShape = {
  hasPronouns: boolean;
  ageNotNull: boolean;
  prefsAgeNotNull: boolean;
};

type SqlGet = { exec(sql: string): void; prepare(sql: string): { get(...params: unknown[]): unknown } };

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function profileMatch(alias: string, pronouns: boolean): string {
  const gender = pronouns
    ? `${alias}.pronouns = ${sqlString(PLACEHOLDER_PRONOUNS)}`
    : `(${alias}.gender IS NULL OR ${alias}.gender = '')`;
  return `${alias}.age = ${PLACEHOLDER_AGE} AND ${alias}.city = ${sqlString(PLACEHOLDER_CITY)} AND ${alias}.occupation = ${sqlString(PLACEHOLDER_OCCUPATION)} AND ${gender}`;
}

const PLACEHOLDER_PROFILE_MATCH = profileMatch("profiles", true).replaceAll("profiles.", "");
const PLACEHOLDER_PROFILE_MATCH_GENDER = profileMatch("profiles", false).replaceAll("profiles.", "");
const PLACEHOLDER_PREFS_MATCH = `age_min = ${PLACEHOLDER_AGE_MIN} AND age_max = ${PLACEHOLDER_AGE_MAX} AND cities = ${sqlString(PLACEHOLDER_CITIES_JSON)}`;

function prefsMatch(alias: string): string {
  return `${alias}.age_min = ${PLACEHOLDER_AGE_MIN} AND ${alias}.age_max = ${PLACEHOLDER_AGE_MAX} AND ${alias}.cities = ${sqlString(PLACEHOLDER_CITIES_JSON)}`;
}

function prefsRebuild(usePronouns: boolean): string {
  const matched = `${prefsMatch("p")} AND pr.user_id IS NOT NULL`;
  return `
DROP TABLE IF EXISTS prefs__migrated;
CREATE TABLE prefs__migrated (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  age_min INTEGER,
  age_max INTEGER,
  cities TEXT,
  smoking TEXT NOT NULL,
  kids TEXT NOT NULL,
  intent TEXT NOT NULL,
  nice_to_haves TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  seeking TEXT,
  dealbreakers TEXT
);
INSERT INTO prefs__migrated (user_id, age_min, age_max, cities, smoking, kids, intent, nice_to_haves, locked, seeking, dealbreakers)
SELECT
  p.user_id,
  CASE WHEN ${matched} THEN NULL ELSE p.age_min END,
  CASE WHEN ${matched} THEN NULL ELSE p.age_max END,
  CASE WHEN ${matched} THEN NULL ELSE p.cities END,
  CASE WHEN ${matched} AND p.smoking = 'no' THEN 'any' ELSE p.smoking END,
  p.kids,
  p.intent,
  p.nice_to_haves,
  p.locked,
  NULL,
  '[]'
FROM prefs p
LEFT JOIN profiles pr ON pr.user_id = p.user_id AND ${profileMatch("pr", usePronouns)};
DROP TABLE prefs;
ALTER TABLE prefs__migrated RENAME TO prefs;
`;
}

const PROFILES_FROM_PRONOUNS = `
DROP TABLE IF EXISTS profiles__migrated;
CREATE TABLE profiles__migrated (
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
INSERT INTO profiles__migrated (user_id, age, city, occupation, bio, gender, smoking, kids, intent, interests, accent, voice)
SELECT
  user_id,
  CASE WHEN ${PLACEHOLDER_PROFILE_MATCH} THEN NULL ELSE age END,
  CASE WHEN ${PLACEHOLDER_PROFILE_MATCH} THEN NULL ELSE city END,
  CASE WHEN ${PLACEHOLDER_PROFILE_MATCH} THEN '' ELSE occupation END,
  CASE WHEN ${PLACEHOLDER_PROFILE_MATCH} AND bio = ${sqlString(PLACEHOLDER_BIO)} THEN '' ELSE bio END,
  CASE
    WHEN ${PLACEHOLDER_PROFILE_MATCH} THEN NULL
    WHEN pronouns IN ('she/her', 'woman', 'Woman') THEN 'woman'
    WHEN pronouns IN ('he/him', 'man', 'Man') THEN 'man'
    ELSE NULL
  END,
  smoking,
  kids,
  intent,
  interests,
  accent,
  CASE
    WHEN pronouns IN ('he/him', 'man', 'Man') THEN '{"subject":"he","object":"him","possessive":"his"}'
    WHEN pronouns IN ('she/her', 'woman', 'Woman') THEN '{"subject":"she","object":"her","possessive":"her"}'
    ELSE voice
  END
FROM profiles;
DROP TABLE profiles;
ALTER TABLE profiles__migrated RENAME TO profiles;
`;

const PROFILES_RELAX_NOT_NULL = `
DROP TABLE IF EXISTS profiles__migrated;
CREATE TABLE profiles__migrated (
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
INSERT INTO profiles__migrated (user_id, age, city, occupation, bio, gender, smoking, kids, intent, interests, accent, voice)
SELECT
  user_id,
  CASE WHEN ${PLACEHOLDER_PROFILE_MATCH_GENDER} THEN NULL ELSE age END,
  CASE WHEN ${PLACEHOLDER_PROFILE_MATCH_GENDER} THEN NULL ELSE city END,
  CASE WHEN ${PLACEHOLDER_PROFILE_MATCH_GENDER} THEN '' ELSE occupation END,
  CASE WHEN ${PLACEHOLDER_PROFILE_MATCH_GENDER} AND bio = ${sqlString(PLACEHOLDER_BIO)} THEN '' ELSE bio END,
  CASE WHEN gender IN ('man', 'woman') THEN gender ELSE NULL END,
  smoking,
  kids,
  intent,
  interests,
  accent,
  voice
FROM profiles;
DROP TABLE profiles;
ALTER TABLE profiles__migrated RENAME TO profiles;
`;

const BACKFILL = `
UPDATE prefs
SET
  age_min = NULL,
  age_max = NULL,
  cities = NULL,
  smoking = CASE WHEN smoking = 'no' THEN 'any' ELSE smoking END
WHERE ${PLACEHOLDER_PREFS_MATCH}
  AND user_id IN (
    SELECT user_id FROM profiles
    WHERE ${PLACEHOLDER_PROFILE_MATCH_GENDER}
       OR (age IS NULL AND city IS NULL AND (gender IS NULL OR gender = '') AND occupation = '')
  );
UPDATE profiles
SET
  age = NULL,
  city = NULL,
  gender = NULL,
  occupation = '',
  bio = CASE WHEN bio = ${sqlString(PLACEHOLDER_BIO)} THEN '' ELSE bio END
WHERE ${PLACEHOLDER_PROFILE_MATCH_GENDER};
`;

export function readLegacyProfileShape(get: (sql: string) => unknown): ProfileShape {
  const pronouns = get("SELECT 1 AS ok FROM pragma_table_info('profiles') WHERE name = 'pronouns'") as { ok?: number } | undefined;
  const age = get('SELECT "notnull" AS is_required FROM pragma_table_info(\'profiles\') WHERE name = \'age\'') as { is_required?: number } | undefined;
  const prefs = get('SELECT "notnull" AS is_required FROM pragma_table_info(\'prefs\') WHERE name = \'age_min\'') as { is_required?: number } | undefined;
  return {
    hasPronouns: Boolean(pronouns),
    ageNotNull: Number(age?.is_required) === 1,
    prefsAgeNotNull: Number(prefs?.is_required) === 1,
  };
}

/** Rebuild legacy NOT NULL profile tables, then null only the exact signup placeholder bundle. */
export function legacyProfileMigrationSql(shape: ProfileShape): string {
  const parts: string[] = [];
  const rebuild = shape.hasPronouns || shape.ageNotNull || shape.prefsAgeNotNull;
  if (rebuild) parts.push("PRAGMA foreign_keys = OFF;");
  if (shape.prefsAgeNotNull) {
    parts.push(prefsRebuild(shape.hasPronouns));
  }
  if (shape.hasPronouns) parts.push(PROFILES_FROM_PRONOUNS);
  else if (shape.ageNotNull) parts.push(PROFILES_RELAX_NOT_NULL);
  if (rebuild) parts.push("PRAGMA foreign_keys = ON;");
  parts.push(BACKFILL);
  return parts.join("\n");
}

export function applyProfileMigration(db: SqlGet): void {
  const shape = readLegacyProfileShape((sql) => db.prepare(sql).get());
  db.exec(legacyProfileMigrationSql(shape));
}
