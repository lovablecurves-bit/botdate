/** Columns added after the first demo schema. CREATE TABLE IF NOT EXISTS will not add them. */
export const ADDED_COLUMNS: { table: string; column: string; ddl: string }[] = [
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
