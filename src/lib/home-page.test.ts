import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

test("the public homepage keeps sign-in and adds how-it-works, preview, FAQ, and legal footer", () => {
  const screen = fs.readFileSync(path.join(root, "src/components/sign-in-screen.tsx"), "utf8");
  const showcase = fs.readFileSync(path.join(root, "src/components/home-showcase.tsx"), "utf8");
  const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

  assert.match(screen, /data-testid="sign-in-x"/);
  assert.match(screen, /founding-spots/);
  assert.match(screen, /loadFoundingSpotsLeft/);
  assert.match(screen, /HomeShowcase/);
  assert.match(screen, /HomeFooter/);

  assert.match(showcase, /How it works/);
  assert.match(showcase, /Sign in with X/);
  assert.match(showcase, /Connect your Grok Bot and set your must-haves/);
  assert.match(showcase, /Your bot screens matches and brings you dates/);
  assert.match(showcase, /\/preview\/shortlist\.png/);
  assert.match(showcase, /\/preview\/bot-desk\.png/);
  assert.match(showcase, /\/preview\/confirmed-date\.png/);
  assert.match(showcase, /Profiles and preferences stay private/);
  assert.match(showcase, /There is no public browsing/);
  assert.match(showcase, /Your identity is revealed only when both bots agree on a date/);
  assert.match(showcase, /18\+ only/);
  assert.match(showcase, /then \$4\.20\/mo/);
  assert.match(showcase, /Austin is opening first/);
  assert.match(showcase, /href="\/privacy"/);
  assert.match(showcase, /href="\/terms"/);
  assert.equal(showcase.includes("spots left"), false);
  assert.equal(/\b\d{2,}\s+members joined\b/.test(showcase), false);

  assert.match(css, /#E8173A/);
  for (const file of ["shortlist.png", "bot-desk.png", "confirmed-date.png"]) {
    assert.equal(fs.existsSync(path.join(root, "public/preview", file)), true, file);
  }
});
