import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import manifest from "../app/manifest";
import { INSTALL_HINT, PWA_BACKGROUND, PWA_THEME, installHintPlatform } from "./pwa";

function pngSize(file: string): { width: number; height: number } {
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

test("the web manifest is an installable BotDate app", () => {
  const doc = manifest();
  assert.equal(doc.name, "BotDate");
  assert.equal(doc.short_name, "BotDate");
  assert.equal(doc.display, "standalone");
  assert.equal(doc.theme_color, PWA_THEME);
  assert.equal(doc.theme_color, "#E8173A");
  assert.equal(doc.background_color, PWA_BACKGROUND);
  assert.equal(doc.start_url, "/");
  const icons = doc.icons ?? [];
  assert.deepEqual(
    icons.map((icon) => `${icon.sizes} ${icon.purpose}`),
    ["192x192 any", "512x512 any", "192x192 maskable", "512x512 maskable"],
  );
  assert.equal(pngSize(new URL("../../public/icons/icon-192.png", import.meta.url)).width, 192);
  assert.equal(pngSize(new URL("../../public/icons/icon-512.png", import.meta.url)).width, 512);
  assert.equal(pngSize(new URL("../../public/icons/icon-maskable-192.png", import.meta.url)).height, 192);
  assert.equal(pngSize(new URL("../../public/icons/icon-maskable-512.png", import.meta.url)).height, 512);
  assert.equal(pngSize(new URL("../../public/icons/apple-touch-icon.png", import.meta.url)).width, 180);
  assert.equal(INSTALL_HINT, "Add BotDate to your Home Screen");
  const hint = fs.readFileSync(new URL("../components/install-hint.tsx", import.meta.url), "utf8");
  assert.match(hint, /\{INSTALL_HINT\}/);
  assert.match(hint, /dismiss-install-hint/);
});

test("the home-screen hint is only for iOS Safari and Android, and it stays dismissed", () => {
  assert.equal(installHintPlatform({ userAgent: IPHONE_SAFARI, standalone: false, dismissed: false }), "ios");
  assert.equal(installHintPlatform({ userAgent: IPHONE_CHROME, standalone: false, dismissed: false }), null);
  assert.equal(installHintPlatform({ userAgent: ANDROID, standalone: false, dismissed: false }), "android");
  assert.equal(installHintPlatform({ userAgent: DESKTOP, standalone: false, dismissed: false }), null);
  assert.equal(installHintPlatform({ userAgent: IPHONE_SAFARI, standalone: true, dismissed: false }), null);
  assert.equal(installHintPlatform({ userAgent: ANDROID, standalone: false, dismissed: true }), null);
  assert.equal(
    installHintPlatform({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
      standalone: false,
      dismissed: false,
      platform: "MacIntel",
      maxTouchPoints: 5,
    }),
    "ios",
  );
});
