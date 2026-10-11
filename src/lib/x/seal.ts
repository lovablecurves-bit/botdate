import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

/** SESSION_SECRET is required. Do not fall back to the demo session key. */
export function readSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET?.trim() ?? "";
  return secret || null;
}

export function requireSessionSecret(): string {
  const secret = readSessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is required to encrypt BotDateApp tokens.");
  return secret;
}

function aesKey(secret: string): Buffer {
  if (!secret) throw new Error("SESSION_SECRET is required to encrypt BotDateApp tokens.");
  return createHash("sha256").update(`botdate-x-token-v1\0${secret}`).digest();
}

/** AES-256-GCM. The sealed string is version, iv, tag, and ciphertext. It does not contain the plaintext. */
export function sealSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey(secret), iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function openSecret(sealed: string, secret: string): string {
  const parts = sealed.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Stored BotDateApp token could not be read.");
  const iv = Buffer.from(parts[1] ?? "", "base64url");
  const tag = Buffer.from(parts[2] ?? "", "base64url");
  const ciphertext = Buffer.from(parts[3] ?? "", "base64url");
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Stored BotDateApp token could not be read.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", aesKey(secret), iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Stored BotDateApp token could not be read.");
  }
}
