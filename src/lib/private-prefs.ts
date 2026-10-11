import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { BotDateDb } from "./db/open";
import { privatePrefs } from "./db/schema";
import { parseOnboarding } from "./onboarding";
import type { OnboardingAnswers } from "./types";

export const PREFS_KEY_MISSING = "PREFS_KEY is not configured.";
export const PREFS_KEY_INVALID = "PREFS_KEY must be 32 bytes, as 64 hex characters or standard base64.";

/** 32-byte AES key from PREFS_KEY. Missing or malformed keys fail closed. There is no default. */
export function readPrefsKey(): { ok: true; key: Buffer } | { ok: false; error: string } {
  const raw = process.env.PREFS_KEY?.trim() ?? "";
  if (!raw) return { ok: false, error: PREFS_KEY_MISSING };
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return { ok: true, key: Buffer.from(raw, "hex") };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return { ok: false, error: PREFS_KEY_INVALID };
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32) return { ok: false, error: PREFS_KEY_INVALID };
  const canonical = decoded.toString("base64").replace(/=+$/, "");
  if (canonical !== raw.replace(/=+$/, "")) return { ok: false, error: PREFS_KEY_INVALID };
  return { ok: true, key: decoded };
}

/** AES-256-GCM. The auth tag is the last 16 bytes of ciphertext. The key is not stored. */
export function sealPrivatePrefs(answers: OnboardingAnswers, key: Buffer): { ciphertext: string; iv: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(answers), "utf8"), cipher.final()]);
  const packed = Buffer.concat([encrypted, cipher.getAuthTag()]);
  return { ciphertext: packed.toString("base64"), iv: iv.toString("base64") };
}

export function openPrivatePrefs(ciphertext: string, iv: string, key: Buffer): OnboardingAnswers | null {
  try {
    const packed = Buffer.from(ciphertext, "base64");
    const nonce = Buffer.from(iv, "base64");
    if (packed.length < 17 || nonce.length !== 12) return null;
    const tag = packed.subarray(packed.length - 16);
    const data = packed.subarray(0, packed.length - 16);
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parseOnboarding(parsed);
  } catch {
    return null;
  }
}

export function writePrivatePrefs(
  ctx: BotDateDb,
  memberId: string,
  answers: OnboardingAnswers,
): { ok: true } | { ok: false; error: string } {
  const key = readPrefsKey();
  if (!key.ok) return key;
  const sealed = sealPrivatePrefs(answers, key.key);
  const now = new Date().toISOString();
  const existing = ctx.db.select({ memberId: privatePrefs.memberId }).from(privatePrefs).where(eq(privatePrefs.memberId, memberId)).get();
  if (existing) {
    ctx.db
      .update(privatePrefs)
      .set({ ciphertext: sealed.ciphertext, iv: sealed.iv, updatedAt: now })
      .where(eq(privatePrefs.memberId, memberId))
      .run();
  } else {
    ctx.db.insert(privatePrefs).values({ memberId, ciphertext: sealed.ciphertext, iv: sealed.iv, updatedAt: now }).run();
  }
  return { ok: true };
}

/** Decrypted answers for this member, or null when they have not stored any. Decrypt failure is an error, not an empty profile. */
export function readPrivatePrefs(
  ctx: BotDateDb,
  memberId: string,
): { ok: true; answers: OnboardingAnswers | null } | { ok: false; error: string } {
  const key = readPrefsKey();
  if (!key.ok) return key;
  const row = ctx.db.select().from(privatePrefs).where(eq(privatePrefs.memberId, memberId)).get();
  if (!row) return { ok: true, answers: null };
  const answers = openPrivatePrefs(row.ciphertext, row.iv, key.key);
  if (!answers) return { ok: false, error: "Private preferences could not be read." };
  return { ok: true, answers };
}
