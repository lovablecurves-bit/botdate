import { DEMO_MEMBERS } from "../demo/members";
import { HUMAN_LINES, MATCH_FLAGS, SCRIPTS, SENT_THROUGH } from "../demo/scripts";
import { canonicalPair } from "../types";
import { pacificLocalToIso, upcomingSaturdayLocal } from "../time";
import type { BotDateDb } from "./open";
import { botThreads, dateProposals, matches, messages, prefs, profiles, users } from "./schema";

const CREATED = "2026-09-20T15:00:00.000Z";

function at(offsetSeconds: number): string {
  return new Date(Date.parse(CREATED) + offsetSeconds * 1000).toISOString();
}

export function seed(ctx: BotDateDb) {
  const db = ctx.db;
  for (const member of DEMO_MEMBERS) {
    db.insert(users)
      .values({
        id: member.id,
        email: member.email,
        displayName: member.displayName,
        botPaused: member.botPaused,
        createdAt: CREATED,
      })
      .run();
    db.insert(profiles)
      .values({
        userId: member.id,
        age: member.profile.age,
        city: member.profile.city,
        occupation: member.profile.occupation,
        bio: member.profile.bio,
        pronouns: member.profile.pronouns,
        smoking: member.profile.smoking,
        kids: member.profile.kids,
        intent: member.profile.intent,
        interests: JSON.stringify(member.profile.interests),
        accent: member.profile.accent,
        voice: JSON.stringify(member.profile.voice),
      })
      .run();
    db.insert(prefs)
      .values({
        userId: member.id,
        ageMin: member.prefs.ageMin,
        ageMax: member.prefs.ageMax,
        cities: JSON.stringify(member.prefs.cities),
        smoking: member.prefs.smoking,
        kids: member.prefs.kids,
        intent: member.prefs.intent,
        niceToHaves: member.prefs.niceToHaves,
        locked: member.prefs.locked,
      })
      .run();
  }

  let clock = 0;
  for (const [matchId, lines] of Object.entries(SCRIPTS)) {
    const [userAId, userBId] = matchId.replace("match_", "").split("_") as [string, string];
    const [a, b] = canonicalPair(userAId, userBId);
    if (`match_${a}_${b}` !== matchId) {
      throw new Error(`Script key ${matchId} is not canonical`);
    }
    const flags = MATCH_FLAGS[matchId] ?? { aOptIn: false, bOptIn: false, channelChoice: "unset" as const };
    db.insert(matches)
      .values({
        id: matchId,
        userAId: a,
        userBId: b,
        aOptIn: flags.aOptIn,
        bOptIn: flags.bOptIn,
        channelChoice: flags.channelChoice,
        createdAt: at(clock),
      })
      .run();
    db.insert(botThreads)
      .values({ id: `thread_${matchId}`, matchId, createdAt: at(clock) })
      .run();
    const sentThrough = SENT_THROUGH[matchId] ?? lines.length;
    lines.forEach((line, index) => {
      if (index >= sentThrough) return;
      const status = "sent";
      clock += 60;
      db.insert(messages)
        .values({
          id: `msg_${matchId}_${index}`,
          matchId,
          channel: "bot",
          authorUserId: line.authorId,
          authorKind: "bot",
          body: line.body,
          approvalStatus: status,
          scriptStep: index,
          edited: false,
          createdAt: at(clock),
        })
        .run();
    });
    for (const [index, line] of (HUMAN_LINES[matchId] ?? []).entries()) {
      clock += 60;
      db.insert(messages)
        .values({
          id: `msg_${matchId}_human_${index}`,
          matchId,
          channel: "human",
          authorUserId: line.authorId,
          authorKind: "human",
          body: line.body,
          approvalStatus: "sent",
          scriptStep: null,
          edited: false,
          createdAt: at(clock),
        })
        .run();
    }
  }

  const when = pacificLocalToIso(upcomingSaturdayLocal(new Date("2026-09-23T18:00:00.000Z")));
  db.insert(dateProposals)
    .values({
      id: "proposal_avery_jordan",
      matchId: "match_avery_jordan",
      proposedByUserId: "jordan",
      startsAt: when,
      place: "Tartine Manufactory",
      note: "Late morning, a table, no agenda beyond an hour.",
      status: "proposed",
      aDecision: "pending",
      bDecision: "pending",
      createdAt: at(clock + 60),
    })
    .run();
}

export function seedIfEmpty(ctx: BotDateDb) {
  const row = ctx.sqlite.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
  if (row.c === 0) seed(ctx);
}

export function resetDatabase(ctx: BotDateDb) {
  ctx.sqlite.exec("BEGIN");
  try {
    ctx.sqlite.exec(`
      DELETE FROM date_proposals;
      DELETE FROM messages;
      DELETE FROM bot_threads;
      DELETE FROM matches;
      DELETE FROM prefs;
      DELETE FROM profiles;
      DELETE FROM users;
    `);
    seed(ctx);
    ctx.sqlite.exec("COMMIT");
  } catch (error) {
    ctx.sqlite.exec("ROLLBACK");
    throw error;
  }
}
