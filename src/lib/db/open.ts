import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client, type InValue } from "@libsql/client/web";
import { drizzle, type SQLJsDatabase } from "drizzle-orm/sql-js";
import initSqlJs from "sql.js";
import * as schema from "./schema";
import { SCHEMA_SQL } from "./schema";
import { seedIfEmpty } from "./seed";

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
type SqlDatabase = InstanceType<SqlJsStatic["Database"]>;

type PendingStatement = { sql: string; args: InValue[] };

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
};

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

const TABLE_ORDER = ["users", "profiles", "prefs", "matches", "bot_threads", "messages", "date_proposals"] as const;

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
    try {
      await client.executeMultiple(SCHEMA_SQL);
    } catch {
      await client.batch(statementsOf(SCHEMA_SQL), "write");
    }
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

async function openApp(): Promise<BotDateDb> {
  const state = globals();
  if (!state.opening) {
    state.opening = (async () => {
      const remote = tursoConfig();
      const client = remote ? createClient({ url: remote.url, authToken: remote.authToken, intMode: "number" }) : null;
      const filePath = client || process.env.VERCEL ? null : path.join(process.cwd(), "data", "botdate.sqlite");
      return createSqlDatabase({ filePath, client, seed: true });
    })().catch((error) => {
      state.opening = undefined;
      throw error;
    });
  }
  return state.opening;
}

/**
 * Run read or write work against the shared demo database.
 * Requests take turns so an in-memory database cannot interleave, and Turso
 * writes from this turn are flushed before the next turn starts.
 */
export async function withDb<T>(fn: (ctx: BotDateDb) => T | Promise<T>): Promise<T> {
  const current = activeDb.getStore();
  if (current) return fn(current);
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
