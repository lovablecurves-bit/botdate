import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "@libsql/client/web";
import { listRoster } from "../domain";
import { isOpenPath } from "../http/public";
import { bootPersistence } from "./boot";
import {
  databaseHealth,
  databaseMode,
  resetAppDatabaseForTests,
  setRemoteClientFactoryForTests,
  useAppDatabaseForTests,
  withDb,
  type BotDateDb,
} from "./open";

const TOKEN = "turso-token-do-not-leak-85d8";
const URL = "libsql://botdate-secret-host.turso.io";

function unauthorizedClient(): Client {
  const error = Object.assign(new Error(`Server returned HTTP status 401 for Authorization: Bearer ${TOKEN}`), {
    status: 401,
    code: "SERVER_ERROR",
  });
  const fail = async () => {
    throw error;
  };
  return {
    execute: fail,
    batch: fail,
    executeMultiple: fail,
    close() {},
  } as unknown as Client;
}

function acceptingClient(): Client {
  return {
    async execute() {
      return { columns: [], columnTypes: [], rows: [], rowsAffected: 0, lastInsertRowid: undefined };
    },
    async executeMultiple() {},
    async batch(statements: unknown) {
      const count = Array.isArray(statements) ? statements.length : 0;
      return Array.from({ length: count }, () => ({ columns: [], columnTypes: [], rows: [], rowsAffected: 0 }));
    },
    close() {},
  } as unknown as Client;
}

function restoreEnv(previous: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function captureEnv(): Record<string, string | undefined> {
  return {
    VERCEL: process.env.VERCEL,
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
    X_CLIENT_ID: process.env.X_CLIENT_ID,
    X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
    X_REDIRECT_URI: process.env.X_REDIRECT_URI,
  };
}

async function withIsolatedApp(fn: (logs: string[]) => Promise<void>) {
  const previousEnv = captureEnv();
  const previousDb = (globalThis as { __botdate?: { testDb?: BotDateDb | null } }).__botdate?.testDb ?? null;
  const original = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => {
    logs.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  useAppDatabaseForTests(null);
  try {
    await fn(logs);
  } finally {
    console.error = original;
    await resetAppDatabaseForTests();
    useAppDatabaseForTests(previousDb);
    restoreEnv(previousEnv);
  }
}

test("an invalid Turso token falls back to memory so login data still loads", async () => {
  await withIsolatedApp(async (logs) => {
    let opens = 0;
    setRemoteClientFactoryForTests(() => {
      opens += 1;
      return unauthorizedClient();
    });
    process.env.VERCEL = "1";
    process.env.TURSO_DATABASE_URL = URL;
    process.env.TURSO_AUTH_TOKEN = TOKEN;
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    delete process.env.X_REDIRECT_URI;

    const snapshot = await withDb((db) => listRoster(db));
    assert.ok(snapshot.length > 0);
    assert.equal(databaseMode(), "error");
    assert.equal(opens, 1);

    const again = await withDb((db) => listRoster(db));
    assert.equal(again.length, snapshot.length);
    assert.equal(opens, 1);

    const { GET } = await import("../../app/api/health/route");
    const response = await GET();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.deepEqual(body, { ok: false, db: "error" });
    assert.deepEqual(Object.keys(body).sort(), ["db", "ok"]);
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes(TOKEN), false);
    assert.equal(serialized.includes(URL), false);
    assert.equal(serialized.includes("Bearer"), false);

    const logged = logs.join("\n");
    assert.match(logged, /libSQL connection or migration failed; using the in-memory database/);
    assert.match(logged, /401/);
    assert.equal(logged.includes(TOKEN), false);
  });
});

test("boot logs a rejected Turso token and the next request still serves memory", async () => {
  await withIsolatedApp(async (logs) => {
    let opens = 0;
    setRemoteClientFactoryForTests(() => {
      opens += 1;
      return unauthorizedClient();
    });
    process.env.VERCEL = "1";
    process.env.TURSO_DATABASE_URL = URL;
    process.env.TURSO_AUTH_TOKEN = TOKEN;

    await bootPersistence();
    assert.equal(opens, 1);
    const report = await databaseHealth();
    assert.deepEqual(report, { status: 200, body: { ok: false, db: "error" } });
    assert.equal(opens, 1);
    const roster = await withDb((db) => listRoster(db));
    assert.ok(Array.isArray(roster));
    assert.equal(loggedWithoutToken(logs), true);
  });
});

test("health reports memory when Turso is unset and turso when the remote accepts the schema", async () => {
  await withIsolatedApp(async () => {
    process.env.VERCEL = "1";
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    const memory = await databaseHealth();
    assert.deepEqual(memory, { status: 200, body: { ok: true, db: "memory" } });
    const roster = await withDb((db) => listRoster(db));
    assert.ok(Array.isArray(roster));
  });

  await withIsolatedApp(async (logs) => {
    setRemoteClientFactoryForTests(() => acceptingClient());
    process.env.VERCEL = "1";
    process.env.TURSO_DATABASE_URL = URL;
    process.env.TURSO_AUTH_TOKEN = TOKEN;
    const remote = await databaseHealth();
    assert.deepEqual(remote, { status: 200, body: { ok: true, db: "turso" } });
    assert.equal(databaseMode(), "turso");
    const body = JSON.stringify(remote.body);
    assert.equal(body.includes(TOKEN), false);
    assert.equal(body.includes("turso.io"), false);
    assert.equal(logs.join("\n").includes(TOKEN), false);
  });
});

test("the health route is public", () => {
  assert.equal(isOpenPath("/api/health"), true);
  assert.equal(isOpenPath("/api/health/"), true);
  assert.equal(isOpenPath("/api/health/private"), false);
});

function loggedWithoutToken(logs: string[]): boolean {
  const logged = logs.join("\n");
  return /in-memory database/.test(logged) && !logged.includes(TOKEN);
}
