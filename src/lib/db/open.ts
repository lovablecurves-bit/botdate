import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client, type InValue } from "@libsql/client/web";
import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import initSqlJs from "sql.js";
import * as schema from "./schema";
import { ADDED_COLUMNS, STRIPE_CUSTOMER_INDEX, X_USER_INDEX, isBenignMigrationError } from "./migrate";
import { SCHEMA_SQL } from "./schema";
import { seedIfEmpty } from "./seed";
import { demoMode, logColdStartNote } from "../x/config";
import { ensureRealMemberNumbers } from "../x/account";

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
type SqlDatabase = InstanceType<SqlJsStatic["Database"]>;

type PendingStatement = { sql: string; args: InValue[] };

/** `error` means Turso was configured but connection or migration failed and the process is serving memory. */
export type DbMode = "turso" | "memory" | "error";

export type DatabaseHealth = {
  ok: boolean;
  db: DbMode;
};

export type BotDateDb = {
  db: SQLJsDatabase<typeof schema>;
  sqlite: {
    exec(sql: string): void;
    prepare(sql: string): { get(...params: unknown[]): unknown };
    transaction<T>(fn: () => T): () => T;
  };
  /** Pull the latest rows when a Turso database is configured. */
  refresh: () => Promise<void>;
  /** Push queued writes to Turso and save the local file, if either is in use. */
  flush: () => Promise<void>;
  close: () => void;
};

const activeDb = new AsyncLocalStorage<BotDateDb>();

type DbGlobal = {
  gate: Promise<void>;
  opening?: Promise<BotDateDb>;
  sqlJs?: Promise<SqlJsStatic>;
  /** Set by tests so a request can run against an isolated database. */
  testDb?: BotDateDb | null;
  /** Database mode serving this process. Unset until the first open settles. */
  mode?: DbMode;
  /** Turso was configured and connection or migration failed. Later opens skip the remote. */
  remoteFailed?: boolean;
};

type RemoteConfig = { url: string; authToken: string };
type RemoteClientFactory = (config: RemoteConfig) => Client;

function defaultRemoteClient(config: RemoteConfig): Client {
  return createClient({ url: config.url, authToken: config.authToken, intMode: "number" });
}

let remoteClientFactory: RemoteClientFactory = defaultRemoteClient;

/** Tests substitute a client that fails the way an invalid Turso token does. */
export function setRemoteClientFactoryForTests(factory: RemoteClientFactory | null): void {
  remoteClientFactory = factory ?? defaultRemoteClient;
}

const globalForDb = globalThis as { __botdate?: DbGlobal };

function globals(): DbGlobal {
  if (!globalForDb.__botdate) globalForDb.__botdate = { gate: Promise.resolve() };
  return globalForDb.__botdate;
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const state = globals();
  const run = state.gate.then(fn, fn);
  state.gate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function wasmPath(): string {
  const candidates = [
    path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm-browser.wasm"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("sql.js wasm was not found in node_modules. Run npm install and deploy with the sql.js package included.");
}

function loadSqlJs(): Promise<SqlJsStatic> {
  const state = globals();
  if (!state.sqlJs) {
    state.sqlJs = (async () => {
      const wasm = fs.readFileSync(wasmPath());
      const copy = new Uint8Array(wasm);
      return initSqlJs({ wasmBinary: copy.buffer });
    })().catch((error) => {
      state.sqlJs = undefined;
      throw error;
    });
  }
  return state.sqlJs;
}

export async function applyRemoteSchema(client: Client): Promise<void> {
  try {
    await client.executeMultiple(SCHEMA_SQL);
  } catch {
    await client.batch(statementsOf(SCHEMA_SQL), "write");
  }
  for (const column of ADDED_COLUMNS) {
    try {
      await client.execute(`ALTER TABLE ${column.table} ADD COLUMN ${column.column} ${column.ddl}`);
    } catch (error) {
      if (!isBenignMigrationError(error)) throw error;
    }
  }
  await client.execute(X_USER_INDEX);
  await client.execute(STRIPE_CUSTOMER_INDEX);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "libSQL request failed";
}

/** Drop the auth token if a driver error echoes it. The database URL is not a credential. */
export function redactSecrets(text: string): string {
  const token = process.env.TURSO_AUTH_TOKEN?.trim() ?? "";
  if (!token) return text;
  return text.split(token).join("[redacted]");
}

function rememberLibsqlFailure(error: unknown): void {
  const state = globals();
  if (state.remoteFailed) return;
  state.remoteFailed = true;
  console.error("[botdate] libSQL connection or migration failed; using the in-memory database.", redactSecrets(errorText(error)));
}

/** Create tables on Turso when both variables are set. Returns false when persistence is not configured. */
export async function migrateLibsqlIfConfigured(): Promise<boolean> {
  const state = globals();
  if (state.remoteFailed) return false;
  const remote = tursoConfig();
  if (!remote) return false;
  const client = remoteClientFactory(remote);
  try {
    await applyRemoteSchema(client);
  } catch (error) {
    rememberLibsqlFailure(error);
    throw error;
  } finally {
    try {
      client.close();
    } catch {
      // The request already failed; closing is best-effort.
    }
  }
  console.info("libSQL schema migration finished for members, subscriptions, and bot data.");
  return true;
}

function tursoConfig(): { url: string; authToken: string } | null {
  const url = process.env.TURSO_DATABASE_URL?.trim() ?? "";
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim() ?? "";
  if (!url && !authToken) return null;
  if (!url || !authToken) {
    throw new Error("Set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, or leave both unset to use the in-memory demo.");
  }
  if (!/^(libsql|https?|wss?):\/\//i.test(url)) {
    throw new Error("TURSO_DATABASE_URL must be a libsql://, https://, or wss:// URL from `turso db show`.");
  }
  return { url, authToken };
}

function firstKeyword(sql: string): string {
  const trimmed = sql.trim().replace(/^\/\*[\s\S]*?\*\//, "").trim().toLowerCase();
  return trimmed.split(/\s+/)[0] ?? "";
}

function statementsOf(script: string): string[] {
  return script
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith("--"));
}

function isControl(keyword: string): boolean {
  return keyword === "begin" || keyword === "commit" || keyword === "rollback" || keyword === "savepoint" || keyword === "release";
}

function isMutating(sql: string): boolean {
  const keyword = firstKeyword(sql);
  if (!keyword || keyword === "select" || keyword === "pragma" || isControl(keyword)) return false;
  return true;
}

function toArgs(values: unknown): InValue[] {
  if (!Array.isArray(values)) return [];
  return values.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") return value;
    if (typeof value === "bigint") return Number(value);
    if (value instanceof Uint8Array) return value;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  });
}

/** Tables copied to and from Turso. A missing name here is invisible after a cold start. */
export const SYNCED_TABLES = ["users", "profiles", "prefs", "matches", "bot_threads", "messages", "date_proposals", "agent_tokens", "waitlist", "x_bot_credentials"] as const;

const TABLE_ORDER = SYNCED_TABLES;

async function createSqlDatabase(options: { filePath: string | null; client: Client | null; seed: boolean }): Promise<BotDateDb> {
  const SQL = await loadSqlJs();
  const filePath = options.filePath;
  let raw: SqlDatabase;
  if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
    raw = new SQL.Database(fs.readFileSync(filePath));
  } else {
    raw = new SQL.Database();
  }
  raw.run("PRAGMA foreign_keys = ON");

  const client = options.client;
  const pending: PendingStatement[] = [];
  let capture = false;
  let depth = 0;
  let mark = 0;

  const persist = () => {
    if (!filePath || depth > 0) return;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from(raw.export()));
  };

  const note = (sql: string, args: InValue[]) => {
    if (!capture || !client || !isMutating(sql)) return;
    pending.push({ sql, args });
  };

  const onKeyword = (keyword: string) => {
    if (keyword === "begin") {
      depth += 1;
      if (depth === 1) mark = pending.length;
      return;
    }
    if (keyword === "commit") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) persist();
      return;
    }
    if (keyword === "rollback") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) pending.splice(mark);
    }
  };

  const execScript = (script: string) => {
    raw.exec(script);
    for (const statement of statementsOf(script)) {
      const keyword = firstKeyword(statement);
      if (isControl(keyword)) onKeyword(keyword);
      else {
        note(statement, []);
        if (depth === 0) persist();
      }
    }
  };

  const originalPrepare = raw.prepare.bind(raw);
  raw.prepare = (sql: string) => {
    const stmt = originalPrepare(sql);
    const originalRun = stmt.run.bind(stmt);
    stmt.run = (values) => {
      originalRun(values);
      if (!capture) return;
      note(sql, toArgs(values));
      if (depth === 0) persist();
    };
    return stmt;
  };

  execScript(SCHEMA_SQL);
  for (const column of ADDED_COLUMNS) {
    const info = originalPrepare(`PRAGMA table_info(${column.table})`);
    const names: string[] = [];
    while (info.step()) names.push(String(info.getAsObject().name));
    info.free();
    if (!names.includes(column.column)) raw.run(`ALTER TABLE ${column.table} ADD COLUMN ${column.column} ${column.ddl}`);
  }
  raw.run(X_USER_INDEX);
  raw.run(STRIPE_CUSTOMER_INDEX);
  persist();
  const db = drizzle(raw, { schema });

  const userCount = () => {
    const stmt = originalPrepare("SELECT COUNT(*) AS c FROM users");
    const row = stmt.step() ? stmt.getAsObject() : { c: 0 };
    stmt.free();
    return Number(row.c ?? 0);
  };

  const pull = async () => {
    if (!client) return;
    const results = await client.batch(
      TABLE_ORDER.map((table) => `SELECT * FROM ${table}`),
      "read",
    );
    const previous = capture;
    capture = false;
    raw.run("PRAGMA foreign_keys = OFF");
    try {
      raw.run("BEGIN");
      for (const table of [...TABLE_ORDER].reverse()) raw.run(`DELETE FROM ${table}`);
      for (let index = 0; index < TABLE_ORDER.length; index += 1) {
        const table = TABLE_ORDER[index];
        const result = results[index];
        if (!result || result.rows.length === 0) continue;
        const columns = result.columns;
        const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`;
        const stmt = originalPrepare(sql);
        for (const row of result.rows) {
          const record = row as unknown as Record<string, unknown>;
          stmt.run(
            columns.map((column, columnIndex) => {
              const value = column in record ? record[column] : (row as unknown as unknown[])[columnIndex];
              if (value === undefined) return null;
              if (typeof value === "bigint") return Number(value);
              return value as string | number | null | Uint8Array;
            }),
          );
        }
        stmt.free();
      }
      raw.run("COMMIT");
    } catch (error) {
      try {
        raw.run("ROLLBACK");
      } catch {
        // The transaction may not have started.
      }
      throw error;
    } finally {
      raw.run("PRAGMA foreign_keys = ON");
      capture = previous;
    }
  };

  const flush = async () => {
    persist();
    if (!client || pending.length === 0) return;
    const batch = pending.splice(0, pending.length);
    try {
      await client.batch(
        batch.map((item) => ({ sql: item.sql, args: item.args })),
        "write",
      );
    } catch (error) {
      pending.unshift(...batch);
      throw error;
    }
  };

  const ctx: BotDateDb = {
    db,
    sqlite: {
      exec: execScript,
      prepare(sql: string) {
        return {
          get(...params: unknown[]) {
            const stmt = originalPrepare(sql);
            if (params.length) stmt.bind(params as never);
            const row = stmt.step() ? stmt.getAsObject() : undefined;
            stmt.free();
            return row;
          },
        };
      },
      transaction<T>(fn: () => T) {
        return () => {
          raw.run("BEGIN");
          onKeyword("begin");
          try {
            const result = fn();
            raw.run("COMMIT");
            onKeyword("commit");
            return result;
          } catch (error) {
            raw.run("ROLLBACK");
            onKeyword("rollback");
            throw error;
          }
        };
      },
    },
    refresh: pull,
    flush,
    close: () => raw.close(),
  };

  if (client) {
    await applyRemoteSchema(client);
    await pull();
    capture = true;
    if (options.seed && userCount() === 0) {
      seedIfEmpty(ctx);
      try {
        await flush();
      } catch (error) {
        pending.splice(0, pending.length);
        await pull();
        if (userCount() === 0) throw error;
      }
    }
  } else if (options.seed) {
    seedIfEmpty(ctx);
    persist();
  }

  ensureRealMemberNumbers(ctx);
  await flush();
  return ctx;
}

/**
 * Open an isolated database for tests and scripts.
 * `:memory:` never reads Turso env vars and never writes a file.
 */
export async function openDatabase(filename: string, options?: { seed?: boolean }): Promise<BotDateDb> {
  const filePath = filename === ":memory:" ? null : filename;
  if (filePath) fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  return createSqlDatabase({ filePath, client: null, seed: options?.seed !== false });
}

/** Point `withDb` at an isolated database. Pass null to use the app database again. */
export function useAppDatabaseForTests(ctx: BotDateDb | null) {
  globals().testDb = ctx;
}

function localFilePath(): string | null {
  return process.env.VERCEL ? null : path.join(process.cwd(), "data", "botdate.sqlite");
}

function openMemoryDatabase(): Promise<BotDateDb> {
  return createSqlDatabase({ filePath: null, client: null, seed: demoMode() });
}

async function openAppDatabase(): Promise<BotDateDb> {
  const state = globals();
  if (state.remoteFailed) {
    state.mode = "error";
    return openMemoryDatabase();
  }
  const remote = tursoConfig();
  if (!remote) {
    const ctx = await createSqlDatabase({ filePath: localFilePath(), client: null, seed: demoMode() });
    state.mode = "memory";
    return ctx;
  }
  let client: Client | null = null;
  try {
    client = remoteClientFactory(remote);
    const ctx = await createSqlDatabase({ filePath: null, client, seed: demoMode() });
    state.mode = "turso";
    return ctx;
  } catch (error) {
    if (client) {
      try {
        client.close();
      } catch {
        // The request already failed; closing is best-effort.
      }
    }
    rememberLibsqlFailure(error);
    try {
      const ctx = await openMemoryDatabase();
      state.mode = "error";
      return ctx;
    } catch (fallbackError) {
      state.mode = "error";
      console.error("[botdate] In-memory database fallback failed.", redactSecrets(errorText(fallbackError)));
      throw fallbackError;
    }
  }
}

async function openApp(): Promise<BotDateDb> {
  logColdStartNote();
  const state = globals();
  if (state.testDb) return state.testDb;
  if (!state.opening) {
    state.opening = openAppDatabase().catch((error) => {
      state.opening = undefined;
      state.mode = "error";
      throw error;
    });
  }
  return state.opening;
}

/** Mode of the database serving this process, or null before the first open. */
export function databaseMode(): DbMode | null {
  return globals().mode ?? null;
}

/**
 * Report whether this process is on Turso, the local/in-memory database, or a failed Turso init.
 * A failed init still serves memory, so the status stays 200 and `db` is `error`.
 * Status 503 is only when no database could be opened. The body never includes secrets.
 */
export async function databaseHealth(): Promise<{ status: number; body: DatabaseHealth }> {
  try {
    await openApp();
  } catch {
    return { status: 503, body: { ok: false, db: "error" } };
  }
  const db = globals().mode;
  if (db !== "turso" && db !== "memory" && db !== "error") {
    return { status: 503, body: { ok: false, db: "error" } };
  }
  return { status: 200, body: { ok: db !== "error", db } };
}

/** Drop the cached app database so the next open reads the current env and client factory. */
export async function resetAppDatabaseForTests(): Promise<void> {
  const state = globals();
  const opening = state.opening;
  state.opening = undefined;
  state.mode = undefined;
  state.remoteFailed = false;
  state.gate = Promise.resolve();
  remoteClientFactory = defaultRemoteClient;
  if (!opening) return;
  try {
    const ctx = await opening;
    ctx.close();
  } catch {
    // A failed open has nothing to close.
  }
}

/**
 * Run read or write work against the app database.
 * Turso/libSQL is used when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are both set.
 * If that connection or migration fails, the error is logged once and this process serves an in-memory database.
 * Otherwise dev keeps data/botdate.sqlite and Vercel keeps an in-memory database.
 * Sign-in does not depend on that database: the signed session cookie carries the member.
 * Requests take turns so an in-memory database cannot interleave, and Turso
 * writes from this turn are flushed before the next turn starts.
 */
export async function withDb<T>(fn: (ctx: BotDateDb) => T | Promise<T>): Promise<T> {
  const current = activeDb.getStore();
  if (current) return fn(current);
  const testDb = globals().testDb;
  if (testDb) return activeDb.run(testDb, async () => fn(testDb));
  return enqueue(async () => {
    const ctx = await openApp();
    await ctx.refresh();
    try {
      return await activeDb.run(ctx, async () => fn(ctx));
    } finally {
      await ctx.flush();
    }
  });
}
