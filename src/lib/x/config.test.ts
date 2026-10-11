import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { coldStartLogLine } from "./config";

const root = path.resolve(import.meta.dirname, "../../..");

test("the cold-start limitation is a server log line and is not rendered on pages", () => {
  const previous = {
    VERCEL: process.env.VERCEL,
    X_CLIENT_ID: process.env.X_CLIENT_ID,
    X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
    X_REDIRECT_URI: process.env.X_REDIRECT_URI,
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
  };
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    delete process.env.VERCEL;
    process.env.X_CLIENT_ID = "id";
    process.env.X_CLIENT_SECRET = "secret";
    process.env.X_REDIRECT_URI = "https://botdate.example/api/auth/x/callback";
    assert.equal(coldStartLogLine(), null);
    process.env.VERCEL = "1";
    assert.equal(coldStartLogLine(), "Member data won't survive cold starts without Turso.");
    process.env.TURSO_DATABASE_URL = "libsql://botdate.turso.io";
    process.env.TURSO_AUTH_TOKEN = "token";
    assert.equal(coldStartLogLine(), null);
  } finally {
    restore();
  }

  const pages = [
    "src/app/login/page.tsx",
    "src/app/(app)/members/page.tsx",
    "src/app/(app)/onboarding/page.tsx",
    "src/app/(app)/shortlist/page.tsx",
    "src/app/(app)/connect/page.tsx",
  ];
  for (const file of pages) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal(source.includes("won't survive cold starts"), false, file);
    assert.equal(source.includes("coldStartNote"), false, file);
  }
});
