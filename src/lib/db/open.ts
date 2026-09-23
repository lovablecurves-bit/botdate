import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { SCHEMA_SQL } from "./schema";
import { seedIfEmpty } from "./seed";

export type BotDateDb = {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: Database.Database;
  close: () => void;
};

export function openDatabase(filename: string, options?: { seed?: boolean }): BotDateDb {
  if (filename !== ":memory:") {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  if (filename !== ":memory:") sqlite.pragma("journal_mode = WAL");
  sqlite.exec(SCHEMA_SQL);
  const db = drizzle(sqlite, { schema });
  const ctx: BotDateDb = { db, sqlite, close: () => sqlite.close() };
  if (options?.seed !== false) seedIfEmpty(ctx);
  return ctx;
}

const globalForDb = globalThis as { __botdate?: BotDateDb };

export function getDb(): BotDateDb {
  if (!globalForDb.__botdate) {
    globalForDb.__botdate = openDatabase(path.join(process.cwd(), "data", "botdate.sqlite"));
  }
  return globalForDb.__botdate;
}
