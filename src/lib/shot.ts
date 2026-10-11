import { eq } from "drizzle-orm";
import type { BotDateDb } from "./db/open";
import { users, waitlistSignups } from "./db/schema";
import { composeShot } from "./share";
import type { Member } from "./types";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

function newCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

function codeTaken(ctx: BotDateDb, code: string): boolean {
  const waitlist = ctx.db.select({ id: waitlistSignups.id }).from(waitlistSignups).where(eq(waitlistSignups.referralCode, code)).get();
  if (waitlist) return true;
  const member = ctx.db.select({ id: users.id }).from(users).where(eq(users.referralCode, code)).get();
  return Boolean(member);
}

/** Stable referral code for this member. Created once and reused on later shots. */
export function ensureMemberReferral(ctx: BotDateDb, userId: string): string {
  const row = ctx.db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) throw new Error("Member not found.");
  if (row.referralCode) return row.referralCode;
  let code = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const next = newCode();
    if (!codeTaken(ctx, next)) {
      code = next;
      break;
    }
  }
  if (!code) throw new Error("Could not allocate a referral code.");
  ctx.db.update(users).set({ referralCode: code }).where(eq(users.id, userId)).run();
  return code;
}

/** Handles already on BotDate, so the member can tap one instead of typing. */
export function crushHandlePicks(ctx: BotDateDb, userId: string): string[] {
  return ctx.db
    .select()
    .from(users)
    .all()
    .filter((row) => row.id !== userId && row.xHandle)
    .map((row) => row.xHandle as string)
    .sort((a, b) => a.localeCompare(b))
    .slice(0, 12);
}

export function draftShot(
  ctx: BotDateDb,
  member: Member,
  handle: string,
  message?: string | null,
): { ok: true; handle: string; text: string; intentUrl: string } | { ok: false; error: string } {
  if (member.xAccount?.handle && member.xAccount.handle.toLowerCase() === handle.trim().replace(/^@+/, "").toLowerCase()) {
    return { ok: false, error: "Pick someone else's handle." };
  }
  const code = ensureMemberReferral(ctx, member.id);
  const shot = composeShot({ handle, code, message });
  if ("error" in shot) return { ok: false, error: shot.error };
  return { ok: true, handle: shot.handle, text: shot.text, intentUrl: shot.intentUrl };
}
