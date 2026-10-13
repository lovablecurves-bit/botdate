import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { DEMO_BANNER } from "./demo/exhibit";
import { isOpenPath } from "./http/public";

const root = path.resolve(import.meta.dirname, "../..");

test("the public demo walkthrough is open, sample-only, and linked from the hero", () => {
  assert.equal(DEMO_BANNER, "Demo, sample data, not real members");
  assert.equal(isOpenPath("/demo"), true);
  assert.equal(isOpenPath("/demo/"), true);

  const screen = fs.readFileSync(path.join(root, "src/components/sign-in-screen.tsx"), "utf8");
  assert.match(screen, /See a demo/);
  assert.match(screen, /href="\/demo"/);
  assert.match(screen, /data-testid="see-a-demo"/);
  assert.match(screen, /data-testid="sign-in-x"/);

  const page = fs.readFileSync(path.join(root, "src/app/demo/page.tsx"), "utf8");
  const exhibit = fs.readFileSync(path.join(root, "src/lib/demo/exhibit.ts"), "utf8");
  assert.equal((page.match(/<DemoBanner \/>/g) ?? []).length, 5);
  assert.match(page, /data-testid="demo-profile"/);
  assert.match(page, /data-testid="demo-shortlist"/);
  assert.match(page, /data-testid="demo-chat"/);
  assert.match(page, /data-testid="demo-date"/);
  assert.match(page, /data-testid="demo-revealed"/);
  assert.match(page, /A private profile, set up by the bot/);
  assert.match(page, /The bot’s shortlist, with reasons/);
  assert.match(page, /Two matchmaker bots talk in private/);
  assert.match(page, /A date both bots agree on/);
  assert.match(page, /Identities are revealed/);
  assert.match(page, /\/preview\/shortlist\.png/);
  assert.match(page, /\/preview\/bot-desk\.png/);
  assert.match(page, /\/preview\/confirmed-date\.png/);
  assert.match(exhibit, /Avery Chen/);
  assert.match(exhibit, /Jordan Hale/);
  assert.match(exhibit, /Tartine Manufactory/);

  for (const file of ["src/app/demo/page.tsx", "src/lib/demo/exhibit.ts"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.equal(source.includes("withDb"), false, file);
    assert.equal(source.includes("openDatabase"), false, file);
    assert.equal(source.includes("@/app/actions"), false, file);
    assert.equal(source.includes("insert("), false, file);
    assert.equal(source.includes("@/lib/db"), false, file);
  }
});
