import { desc } from "drizzle-orm";
import { isBotConnected } from "../agent/connection";
import type { BotDateDb } from "../db/open";
import { users } from "../db/schema";
import { listMembers } from "../domain";
import { isProfileComplete } from "../types";

export type SignupRow = {
  member_number: number | null;
  x_handle: string | null;
  created_at: string;
  profile_complete: boolean;
  bot_connected: boolean;
};

export type SignupReport = {
  total: number;
  users: SignupRow[];
};

/** Every user, newest first. Profile completeness and a real bot link are reported, not invented. */
export function listSignups(ctx: BotDateDb): SignupReport {
  const members = new Map(listMembers(ctx).map((member) => [member.id, member]));
  const rows = ctx.db.select().from(users).orderBy(desc(users.createdAt), desc(users.id)).all();
  const listed = rows.map((row) => {
    const member = members.get(row.id);
    return {
      member_number: row.memberNumber == null ? null : Number(row.memberNumber),
      x_handle: row.xHandle?.trim() ? row.xHandle : null,
      created_at: row.createdAt,
      profile_complete: member ? isProfileComplete(member) : false,
      bot_connected: isBotConnected(ctx, row.id),
    };
  });
  return { total: listed.length, users: listed };
}
