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
  { table: "users", column: "subscription_status", ddl: "TEXT" },
];

export const X_USER_INDEX = "CREATE UNIQUE INDEX IF NOT EXISTS users_x_user_idx ON users(x_user_id)";

export function missingColumnStatements(columnsByTable: Record<string, readonly string[]>): string[] {
  return ADDED_COLUMNS.filter((column) => !(columnsByTable[column.table] ?? []).includes(column.column)).map(
    (column) => `ALTER TABLE ${column.table} ADD COLUMN ${column.column} ${column.ddl}`,
  );
}

export function isBenignMigrationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate column|already exists/i.test(message);
}
