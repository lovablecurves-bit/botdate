import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { fireXPixelEvent, readXPixelEventId, readXPixelId, xPixelBaseSource, X_PIXEL_SRC } from "./pixel";

test("X Pixel base code and conversion events are a no-op when unset", () => {
  assert.equal(readXPixelId(undefined), null);
  assert.equal(readXPixelId("  "), null);
  assert.equal(readXPixelId("o8z4h"), "o8z4h");
  assert.equal(readXPixelId("bad id"), null);
  assert.equal(readXPixelId("o8z4h';alert(1)//"), null);
  assert.equal(xPixelBaseSource("bad id"), null);

  assert.equal(readXPixelEventId(undefined, "tw-o8z4h-wait"), null);
  assert.equal(readXPixelEventId("o8z4h", undefined), null);
  assert.equal(readXPixelEventId("o8z4h", " "), null);
  assert.equal(readXPixelEventId("o8z4h", "tw-o8z4h-wait"), "tw-o8z4h-wait");
  assert.equal(readXPixelEventId("o8z4h", "tw wait"), null);

  const source = xPixelBaseSource("o8z4h");
  assert.ok(source);
  assert.match(source, new RegExp(X_PIXEL_SRC.replace(/\./g, "\\.")));
  assert.match(source, /twq\('config','o8z4h'\)/);
  assert.equal(source.includes("signed_up"), false);
  assert.equal(source.includes("waitlist_joined"), false);

  const previous = {
    NEXT_PUBLIC_X_PIXEL_ID: process.env.NEXT_PUBLIC_X_PIXEL_ID,
    NEXT_PUBLIC_X_EVT_SIGNUP: process.env.NEXT_PUBLIC_X_EVT_SIGNUP,
    NEXT_PUBLIC_X_EVT_SIGNIN: process.env.NEXT_PUBLIC_X_EVT_SIGNIN,
  };
  delete process.env.NEXT_PUBLIC_X_PIXEL_ID;
  delete process.env.NEXT_PUBLIC_X_EVT_SIGNUP;
  delete process.env.NEXT_PUBLIC_X_EVT_SIGNIN;
  const calls: unknown[][] = [];
  const storage = new Map<string, string>();
  const previousWindow = globalThis.window;
  Object.assign(globalThis, {
    window: {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      twq: (...args: unknown[]) => calls.push(args),
    },
  });
  try {
    assert.equal(fireXPixelEvent("signed_up", "signed_up"), false);
    assert.equal(calls.length, 0);

    process.env.NEXT_PUBLIC_X_PIXEL_ID = "o8z4h";
    process.env.NEXT_PUBLIC_X_EVT_SIGNUP = "tw-o8z4h-signup";
    process.env.NEXT_PUBLIC_X_EVT_SIGNIN = "tw-o8z4h-signin";
    assert.equal(fireXPixelEvent("signed_up", "signed_up"), true);
    assert.equal(fireXPixelEvent("signed_up", "signed_up"), false);
    assert.equal(fireXPixelEvent("signed_in_with_x", "signed_in"), true);
    assert.deepEqual(calls, [
      ["event", "tw-o8z4h-signup"],
      ["event", "tw-o8z4h-signin"],
    ]);
  } finally {
    if (previousWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else globalThis.window = previousWindow;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  const privacy = fs.readFileSync(new URL("../../app/privacy/page.tsx", import.meta.url), "utf8");
  assert.match(privacy, /X Pixel/);
  assert.match(privacy, /signed_up/);
  assert.match(privacy, /signed_in_with_x/);
  assert.equal(privacy.includes("waitlist_joined"), false);
  const callback = fs.readFileSync(new URL("../../app/api/auth/x/callback/route.ts", import.meta.url), "utf8");
  assert.match(callback, /xPixelEventId\("signed_in_with_x"\)/);
  assert.match(callback, /signedIn\.created && xPixelEventId\("signed_up"\)/);
  const login = fs.readFileSync(new URL("../../app/login/page.tsx", import.meta.url), "utf8");
  assert.equal(login.includes("waitlist_joined"), false);
  assert.equal(login.includes("XPixelConversion"), false);
});
