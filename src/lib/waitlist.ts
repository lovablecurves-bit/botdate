import { asc, eq } from "drizzle-orm";
import type { BotDateDb } from "./db/open";
import { waitlistSignups } from "./db/schema";

export type WaitlistEntry = {
  id: string;
  email: string;
  xHandle: string | null;
  position: number;
  referralCode: string;
  referredBy: string | null;
  createdAt: string;
};

export type JoinWaitlistResult =
  | { ok: true; entry: WaitlistEntry; already: boolean }
  | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
const REFERRAL = /^[a-z0-9]{6,16}$/;
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return null;
  if (!EMAIL.test(email)) return null;
  return email;
}

export function normalizeHandle(value: string | null | undefined): { ok: true; handle: string | null } | { ok: false } {
  const raw = (value ?? "").trim();
  if (!raw) return { ok: true, handle: null };
  const handle = raw.replace(/^@+/, "");
  if (!HANDLE.test(handle)) return { ok: false };
  return { ok: true, handle };
}

export function normalizeReferralCode(value: string | null | undefined): string | null {
  const ref = (value ?? "").trim().toLowerCase();
  if (!REFERRAL.test(ref)) return null;
  return ref;
}

export function peopleWaitingLabel(count: number): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  return `${n} ${n === 1 ? "person" : "people"} waiting`;
}

export function founderMayExport(member: { founder: boolean } | null | undefined): boolean {
  return member?.founder === true;
}

function toEntry(row: typeof waitlistSignups.$inferSelect): WaitlistEntry {
  return {
    id: row.id,
    email: row.email,
    xHandle: row.xHandle,
    position: row.position,
    referralCode: row.referralCode,
    referredBy: row.referredBy,
    createdAt: row.createdAt,
  };
}

function findByEmail(ctx: BotDateDb, email: string): WaitlistEntry | null {
  const row = ctx.db.select().from(waitlistSignups).where(eq(waitlistSignups.email, email)).get();
  return row ? toEntry(row) : null;
}

function findByHandle(ctx: BotDateDb, handle: string): WaitlistEntry | null {
  const row = ctx.sqlite.prepare("SELECT id FROM waitlist WHERE x_handle = ? COLLATE NOCASE").get(handle) as { id: string } | undefined;
  if (!row) return null;
  const full = ctx.db.select().from(waitlistSignups).where(eq(waitlistSignups.id, String(row.id))).get();
  return full ? toEntry(full) : null;
}

export function findWaitlistByCode(ctx: BotDateDb, code: string): WaitlistEntry | null {
  const ref = normalizeReferralCode(code);
  if (!ref) return null;
  const row = ctx.db.select().from(waitlistSignups).where(eq(waitlistSignups.referralCode, ref)).get();
  return row ? toEntry(row) : null;
}

export function waitlistCount(ctx: BotDateDb): number {
  const row = ctx.sqlite.prepare("SELECT COUNT(*) AS c FROM waitlist").get() as { c: number } | undefined;
  return Number(row?.c ?? 0);
}

function nextPosition(ctx: BotDateDb): number {
  const row = ctx.sqlite.prepare("SELECT COALESCE(MAX(position), 0) AS max FROM waitlist").get() as { max: number } | undefined;
  return Number(row?.max ?? 0) + 1;
}

function newReferralCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

function unusedCode(ctx: BotDateDb): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = newReferralCode();
    const taken = ctx.db.select({ id: waitlistSignups.id }).from(waitlistSignups).where(eq(waitlistSignups.referralCode, code)).get();
    if (!taken) return code;
  }
  throw new Error("Could not allocate a referral code.");
}

function isUniqueEmailError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique constraint failed: waitlist\.email/i.test(message);
}

function isDuplicateHandle(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message === "That X handle is already on the waitlist." || /unique constraint failed: waitlist\.x_handle|waitlist_handle_idx/i.test(message);
}

function referrerCode(ctx: BotDateDb, ref: string | null): string | null {
  if (!ref) return null;
  const row = ctx.db.select().from(waitlistSignups).where(eq(waitlistSignups.referralCode, ref)).get();
  return row?.referralCode ?? null;
}

export function joinWaitlist(
  ctx: BotDateDb,
  input: { email: string; xHandle?: string | null; ref?: string | null },
): JoinWaitlistResult {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "Enter a valid email." };
  const handle = normalizeHandle(input.xHandle);
  if (!handle.ok) return { ok: false, error: "X handles use letters, numbers, and underscores, up to 15 characters." };

  const existing = findByEmail(ctx, email);
  if (existing) return { ok: true, already: true, entry: existing };
  if (handle.handle && findByHandle(ctx, handle.handle)) {
    return { ok: false, error: "That X handle is already on the waitlist." };
  }

  const referredBy = referrerCode(ctx, normalizeReferralCode(input.ref));
  try {
    const placed: { entry: WaitlistEntry | null; already: boolean; handleTaken: boolean } = {
      entry: null,
      already: false,
      handleTaken: false,
    };
    ctx.sqlite.transaction(() => {
      const again = findByEmail(ctx, email);
      if (again) {
        placed.entry = again;
        placed.already = true;
        return;
      }
      if (handle.handle && findByHandle(ctx, handle.handle)) {
        placed.handleTaken = true;
        return;
      }
      const row = {
        id: `wl_${crypto.randomUUID()}`,
        email,
        xHandle: handle.handle,
        position: nextPosition(ctx),
        referralCode: unusedCode(ctx),
        referredBy,
        createdAt: new Date().toISOString(),
      };
      ctx.db.insert(waitlistSignups).values(row).run();
      placed.entry = toEntry(row);
    })();
    if (placed.handleTaken) return { ok: false, error: "That X handle is already on the waitlist." };
    const entry = placed.entry;
    if (!entry) return { ok: false, error: "Could not join the waitlist." };
    return { ok: true, already: placed.already, entry };
  } catch (error) {
    if (isDuplicateHandle(error)) return { ok: false, error: "That X handle is already on the waitlist." };
    if (!isUniqueEmailError(error)) throw error;
    const again = findByEmail(ctx, email);
    if (again) return { ok: true, already: true, entry: again };
    throw error;
  }
}

export function listWaitlist(ctx: BotDateDb): WaitlistEntry[] {
  return ctx.db
    .select()
    .from(waitlistSignups)
    .orderBy(asc(waitlistSignups.position), asc(waitlistSignups.createdAt))
    .all()
    .map(toEntry);
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function waitlistCsv(ctx: BotDateDb): string {
  const lines = ["position,email,x_handle,referral_code,referred_by,created_at"];
  for (const row of listWaitlist(ctx)) {
    lines.push(
      [
        String(row.position),
        csvCell(row.email),
        csvCell(row.xHandle ?? ""),
        csvCell(row.referralCode),
        csvCell(row.referredBy ?? ""),
        csvCell(row.createdAt),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export type WaitlistExport =
  | { status: 200; body: string; contentType: "text/csv; charset=utf-8"; filename: string }
  | { status: 403; body: string; contentType: "text/plain; charset=utf-8" };

export function waitlistExport(member: { founder: boolean } | null | undefined, csv: string): WaitlistExport {
  if (!founderMayExport(member)) {
    return {
      status: 403,
      body: "Only the founder can export the waitlist.\n",
      contentType: "text/plain; charset=utf-8",
    };
  }
  return {
    status: 200,
    body: csv,
    contentType: "text/csv; charset=utf-8",
    filename: "botdate-waitlist.csv",
  };
}
