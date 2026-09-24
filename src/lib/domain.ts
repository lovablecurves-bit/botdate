import { and, asc, eq, or } from "drizzle-orm";
import type { BotDateDb } from "./db/open";
import { botThreads, dateProposals, matches, messages, prefs, profiles, users } from "./db/schema";
import { DEMO_ORDER } from "./demo/members";
import { SCRIPTS } from "./demo/scripts";
import { HOLD_LABELS, mutualPass, primaryHold } from "./matchmaker/filters";
import { matchmaker } from "./matchmaker/service";
import { fail, ok, type ActionResult } from "./result";
import { formatPacific, isFutureIso, pacificLocalToIso } from "./time";
import {
  CITIES,
  INTERESTS,
  PRONOUNS,
  canonicalPair,
  matchIdFor,
  voiceForPronouns,
  type ChannelChoice,
  type Intent,
  type IntentFilter,
  type KidsFilter,
  type KidsStance,
  type Member,
  type MemberInput,
  type ProposalStatus,
  type SmokingFilter,
  type Voice,
} from "./types";

export type PublicPerson = {
  id: string;
  displayName: string;
  pronouns: string;
  age: number;
  city: string;
  occupation: string;
  bio: string;
  interests: string[];
  accent: string;
  smoking: boolean;
  kids: KidsStance;
  intent: Intent;
};

export type StageState = {
  filters: "done";
  talk: "done" | "current" | "todo";
  intro: "done" | "current" | "todo";
  date: "done" | "current" | "todo";
};

export type ShortlistCard = {
  matchId: string;
  person: PublicPerson;
  score: number;
  why: string[];
  rankNotes: string[];
  draftWaiting: boolean;
  bothOptedIn: boolean;
  viewerOptIn: boolean;
  channelChoice: ChannelChoice;
  dateStatus: "none" | "proposed" | "confirmed";
  proposalMine: boolean;
};

export type Shortlist = {
  locked: boolean;
  niceToHaves: string;
  cards: ShortlistCard[];
  heldBack: { label: string; count: number }[];
  inactive: number;
};

export type ThreadItem = {
  id: string;
  body: string;
  authorName: string;
  mine: boolean;
  kind: "bot" | "human" | "system";
  edited: boolean;
  at: string;
};

export type DeskData = {
  matchId: string;
  person: PublicPerson;
  paused: boolean;
  items: ThreadItem[];
  heldCount: number;
  heldLabel: string;
  draft: { id: string; body: string } | null;
  killed: { id: string; body: string }[];
  canAsk: boolean;
  askLabel: string;
  stage: StageState;
};

export type DeskListItem = {
  matchId: string;
  person: PublicPerson;
  preview: string;
  draftWaiting: boolean;
  held: boolean;
  at: string | null;
};

export type IntroData = {
  matchId: string;
  person: PublicPerson;
  viewerOptIn: boolean;
  otherOptIn: boolean;
  channelChoice: ChannelChoice;
  recap: { id: string; authorName: string; body: string }[];
  humanMessages: { id: string; mine: boolean; body: string; authorName: string; at: string }[];
  stage: StageState;
};

export type DateProposalView = {
  id: string;
  place: string;
  note: string;
  whenLabel: string;
  status: ProposalStatus;
  mine: boolean;
  proposedBy: string;
};

export type DateData = {
  matchId: string;
  person: PublicPerson;
  bothOptIn: boolean;
  proposals: DateProposalView[];
  canPropose: boolean;
  blockReason: string | null;
  suggestion: { local: string; place: string; note: string };
  stage: StageState;
};

export type RosterEntry = {
  id: string;
  displayName: string;
  accent: string;
  city: string;
  locked: boolean;
};

type MatchRow = typeof matches.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

function asBool(value: unknown): boolean {
  return value === true || value === 1;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

export function toPublic(member: Member): PublicPerson {
  return {
    id: member.id,
    displayName: member.displayName,
    pronouns: member.profile.pronouns,
    age: member.profile.age,
    city: member.profile.city,
    occupation: member.profile.occupation,
    bio: member.profile.bio,
    interests: member.profile.interests,
    accent: member.profile.accent,
    smoking: member.profile.smoking,
    kids: member.profile.kids,
    intent: member.profile.intent,
  };
}

export function listMembers(ctx: BotDateDb): Member[] {
  const userRows = ctx.db.select().from(users).all();
  const profileRows = ctx.db.select().from(profiles).all();
  const prefRows = ctx.db.select().from(prefs).all();
  const profilesById = new Map(profileRows.map((row) => [row.userId, row]));
  const prefsById = new Map(prefRows.map((row) => [row.userId, row]));
  const members: Member[] = [];
  for (const user of userRows) {
    const profile = profilesById.get(user.id);
    const pref = prefsById.get(user.id);
    if (!profile || !pref) continue;
    const voice = parseJson<Voice>(profile.voice, voiceForPronouns(profile.pronouns));
    members.push({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      botPaused: asBool(user.botPaused),
      profile: {
        age: profile.age,
        city: profile.city,
        occupation: profile.occupation,
        bio: profile.bio,
        pronouns: profile.pronouns,
        smoking: asBool(profile.smoking),
        kids: profile.kids as KidsStance,
        intent: profile.intent as Intent,
        interests: parseJson<string[]>(profile.interests, []),
        accent: profile.accent,
        voice,
      },
      prefs: {
        ageMin: pref.ageMin,
        ageMax: pref.ageMax,
        cities: parseJson<string[]>(pref.cities, []),
        smoking: pref.smoking as SmokingFilter,
        kids: pref.kids as KidsFilter,
        intent: pref.intent as IntentFilter,
        niceToHaves: pref.niceToHaves,
        locked: asBool(pref.locked),
      },
    });
  }
  return members;
}

export function getMember(ctx: BotDateDb, userId: string): Member | null {
  return listMembers(ctx).find((member) => member.id === userId) ?? null;
}

export function memberToInput(member: Member): MemberInput {
  return {
    displayName: member.displayName,
    pronouns: member.profile.pronouns,
    age: member.profile.age,
    city: member.profile.city,
    occupation: member.profile.occupation,
    bio: member.profile.bio,
    smoking: member.profile.smoking,
    kids: member.profile.kids,
    intent: member.profile.intent,
    interests: [...member.profile.interests],
    ageMin: member.prefs.ageMin,
    ageMax: member.prefs.ageMax,
    cities: [...member.prefs.cities],
    smokingFilter: member.prefs.smoking,
    kidsFilter: member.prefs.kids,
    intentFilter: member.prefs.intent,
    niceToHaves: member.prefs.niceToHaves,
    locked: member.prefs.locked,
  };
}

export function listRoster(ctx: BotDateDb): RosterEntry[] {
  const order = new Map(DEMO_ORDER.map((id, index) => [id, index]));
  return listMembers(ctx)
    .map((member) => ({
      id: member.id,
      displayName: member.displayName,
      accent: member.profile.accent,
      city: member.profile.city,
      locked: member.prefs.locked,
    }))
    .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
}

function messagesFor(ctx: BotDateDb, matchId: string): MessageRow[] {
  return ctx.db.select().from(messages).where(eq(messages.matchId, matchId)).orderBy(asc(messages.createdAt)).all();
}

function proposalsFor(ctx: BotDateDb, matchId: string) {
  return ctx.db
    .select()
    .from(dateProposals)
    .where(eq(dateProposals.matchId, matchId))
    .orderBy(asc(dateProposals.createdAt))
    .all();
}

function ensureMutualMatches(ctx: BotDateDb, userId: string) {
  const viewer = getMember(ctx, userId);
  if (!viewer?.prefs.locked) return;
  const now = new Date().toISOString();
  for (const other of listMembers(ctx)) {
    if (other.id === userId || !mutualPass(viewer, other)) continue;
    const id = matchIdFor(userId, other.id);
    const existing = ctx.db.select().from(matches).where(eq(matches.id, id)).get();
    if (existing) continue;
    const [userAId, userBId] = canonicalPair(userId, other.id);
    ctx.db
      .insert(matches)
      .values({
        id,
        userAId,
        userBId,
        aOptIn: false,
        bOptIn: false,
        channelChoice: "unset",
        createdAt: now,
      })
      .run();
    ctx.db.insert(botThreads).values({ id: `thread_${id}`, matchId: id, createdAt: now }).run();
  }
}

function loadPair(ctx: BotDateDb, userId: string, matchId: string) {
  ensureMutualMatches(ctx, userId);
  const match = ctx.db.select().from(matches).where(eq(matches.id, matchId)).get();
  if (!match || (match.userAId !== userId && match.userBId !== userId)) return null;
  const viewer = getMember(ctx, userId);
  const other = getMember(ctx, match.userAId === userId ? match.userBId : match.userAId);
  if (!viewer || !other || !mutualPass(viewer, other)) return null;
  return { match, viewer, other };
}

function channelOf(value: string): ChannelChoice {
  if (value === "human" || value === "bot") return value;
  return "unset";
}

function stageFor(rows: MessageRow[], match: MatchRow, proposalRows: { status: string }[]): StageState {
  const sentBot = rows.some((row) => row.channel === "bot" && row.approvalStatus === "sent");
  const both = asBool(match.aOptIn) && asBool(match.bOptIn);
  const confirmed = proposalRows.some((row) => row.status === "confirmed");
  const proposed = proposalRows.some((row) => row.status === "proposed");
  return {
    filters: "done",
    talk: sentBot ? "done" : "current",
    intro: both ? "done" : sentBot ? "current" : "todo",
    date: confirmed ? "done" : both || proposed ? "current" : "todo",
  };
}

function botLabel(member: Member): string {
  return `${member.displayName}'s matchmaker`;
}

function sentBotCount(rows: MessageRow[]): number {
  return rows.filter((row) => row.channel === "bot" && row.approvalStatus === "sent").length;
}

export function listShortlist(ctx: BotDateDb, userId: string): Shortlist {
  const viewer = getMember(ctx, userId);
  if (!viewer) return { locked: false, niceToHaves: "", cards: [], heldBack: [], inactive: 0 };
  if (!viewer.prefs.locked) {
    return { locked: false, niceToHaves: viewer.prefs.niceToHaves, cards: [], heldBack: [], inactive: 0 };
  }
  ensureMutualMatches(ctx, userId);
  const cards: ShortlistCard[] = [];
  const holds = new Map<string, number>();
  let inactive = 0;
  for (const other of listMembers(ctx)) {
    if (other.id === userId) continue;
    if (!other.prefs.locked) {
      inactive += 1;
      continue;
    }
    const reason = primaryHold(viewer, other);
    if (reason) {
      holds.set(reason, (holds.get(reason) ?? 0) + 1);
      continue;
    }
    const fit = matchmaker.explainFit(viewer, other);
    const matchId = matchIdFor(userId, other.id);
    const match = ctx.db.select().from(matches).where(eq(matches.id, matchId)).get();
    if (!match) continue;
    const rows = messagesFor(ctx, matchId);
    const proposalRows = proposalsFor(ctx, matchId);
    const open = proposalRows.find((row) => row.status === "proposed");
    const confirmed = proposalRows.find((row) => row.status === "confirmed");
    const viewerIsA = match.userAId === userId;
    cards.push({
      matchId,
      person: toPublic(other),
      score: fit.score,
      why: fit.why,
      rankNotes: fit.rankNotes,
      draftWaiting: rows.some((row) => row.channel === "bot" && row.approvalStatus === "pending" && row.authorUserId === userId),
      bothOptedIn: asBool(match.aOptIn) && asBool(match.bOptIn),
      viewerOptIn: viewerIsA ? asBool(match.aOptIn) : asBool(match.bOptIn),
      channelChoice: channelOf(match.channelChoice),
      dateStatus: confirmed ? "confirmed" : open ? "proposed" : "none",
      proposalMine: Boolean(open && open.proposedByUserId === userId && !confirmed),
    });
  }
  cards.sort((a, b) => b.score - a.score || a.person.displayName.localeCompare(b.person.displayName));
  const heldBack = [...holds.entries()].map(([key, count]) => ({
    label: HOLD_LABELS[key] ?? key,
    count,
  }));
  return { locked: true, niceToHaves: viewer.prefs.niceToHaves, cards, heldBack, inactive };
}

export function countMyDrafts(ctx: BotDateDb, userId: string): number {
  const viewer = getMember(ctx, userId);
  if (!viewer?.prefs.locked) return 0;
  const pending = ctx.db
    .select()
    .from(messages)
    .where(and(eq(messages.authorUserId, userId), eq(messages.approvalStatus, "pending"), eq(messages.channel, "bot")))
    .all();
  return pending.filter((row) => {
    const match = ctx.db.select().from(matches).where(eq(matches.id, row.matchId)).get();
    if (!match) return false;
    const otherId = match.userAId === userId ? match.userBId : match.userAId;
    const other = getMember(ctx, otherId);
    return Boolean(other && mutualPass(viewer, other));
  }).length;
}

export function listDesk(ctx: BotDateDb, userId: string): DeskListItem[] {
  const list = listShortlist(ctx, userId);
  const items = list.cards.map((card) => {
    const rows = messagesFor(ctx, card.matchId);
    const sent = rows.filter((row) => row.approvalStatus === "sent" && (row.channel === "bot" || row.channel === "system"));
    const latest = sent[sent.length - 1];
    const held = rows.some((row) => row.channel === "bot" && row.approvalStatus === "pending" && row.authorUserId !== userId);
    return {
      matchId: card.matchId,
      person: card.person,
      preview: latest ? latest.body : "No notes sent yet.",
      draftWaiting: card.draftWaiting,
      held,
      at: latest?.createdAt ?? null,
    };
  });
  items.sort((a, b) => {
    if (a.draftWaiting !== b.draftWaiting) return a.draftWaiting ? -1 : 1;
    const aTime = a.at ?? "";
    const bTime = b.at ?? "";
    return bTime.localeCompare(aTime) || a.person.displayName.localeCompare(b.person.displayName);
  });
  return items;
}

export function getDesk(ctx: BotDateDb, userId: string, matchId: string): DeskData | null {
  const pair = loadPair(ctx, userId, matchId);
  if (!pair) return null;
  const rows = messagesFor(ctx, matchId);
  const proposalRows = proposalsFor(ctx, matchId);
  const members = new Map(listMembers(ctx).map((member) => [member.id, member]));
  const items: ThreadItem[] = rows
    .filter((row) => row.approvalStatus === "sent" && (row.channel === "bot" || row.channel === "system"))
    .map((row) => ({
      id: row.id,
      body: row.body,
      authorName: row.authorKind === "system" ? "Desk" : botLabel(members.get(row.authorUserId ?? "") ?? pair.viewer),
      mine: row.authorUserId === userId,
      kind: row.channel === "system" ? "system" : "bot",
      edited: asBool(row.edited),
      at: row.createdAt,
    }));
  const heldRows = rows.filter((row) => row.channel === "bot" && row.approvalStatus === "pending" && row.authorUserId !== userId);
  const mine = rows.filter((row) => row.channel === "bot" && row.approvalStatus === "pending" && row.authorUserId === userId);
  const draft = mine[0] ? { id: mine[0].id, body: mine[0].body } : null;
  const killed = rows
    .filter((row) => row.channel === "bot" && row.approvalStatus === "killed" && row.authorUserId === userId)
    .map((row) => ({ id: row.id, body: row.body }));
  const sent = sentBotCount(rows);
  const canAsk = !pair.viewer.botPaused && !draft && heldRows.length === 0 && sent < 8;
  const askLabel = sent === 0 ? "Have your matchmaker open" : "Ask for another draft";
  const heldLabel = heldRows.length
    ? `${firstName(pair.other.displayName)}'s matchmaker has a reply ready. It stays unsent until they approve it.`
    : "";
  return {
    matchId,
    person: toPublic(pair.other),
    paused: pair.viewer.botPaused,
    items,
    heldCount: heldRows.length,
    heldLabel,
    draft,
    killed,
    canAsk,
    askLabel,
    stage: stageFor(rows, pair.match, proposalRows),
  };
}

export function getIntro(ctx: BotDateDb, userId: string, matchId: string): IntroData | null {
  const pair = loadPair(ctx, userId, matchId);
  if (!pair) return null;
  const rows = messagesFor(ctx, matchId);
  const proposalRows = proposalsFor(ctx, matchId);
  const members = new Map(listMembers(ctx).map((member) => [member.id, member]));
  const viewerIsA = pair.match.userAId === userId;
  const recap = rows
    .filter((row) => row.channel === "bot" && row.approvalStatus === "sent")
    .slice(-3)
    .map((row) => ({
      id: row.id,
      authorName: botLabel(members.get(row.authorUserId ?? "") ?? pair.viewer),
      body: row.body,
    }));
  const humanMessages = rows
    .filter((row) => row.channel === "human" && row.approvalStatus === "sent")
    .map((row) => ({
      id: row.id,
      mine: row.authorUserId === userId,
      body: row.body,
      authorName: members.get(row.authorUserId ?? "")?.displayName ?? "Member",
      at: row.createdAt,
    }));
  return {
    matchId,
    person: toPublic(pair.other),
    viewerOptIn: viewerIsA ? asBool(pair.match.aOptIn) : asBool(pair.match.bOptIn),
    otherOptIn: viewerIsA ? asBool(pair.match.bOptIn) : asBool(pair.match.aOptIn),
    channelChoice: channelOf(pair.match.channelChoice),
    recap,
    humanMessages,
    stage: stageFor(rows, pair.match, proposalRows),
  };
}

function presentProposal(row: typeof dateProposals.$inferSelect, userId: string, members: Map<string, Member>): DateProposalView {
  return {
    id: row.id,
    place: row.place,
    note: row.note,
    whenLabel: formatPacific(row.startsAt),
    status: row.status as ProposalStatus,
    mine: row.proposedByUserId === userId,
    proposedBy: members.get(row.proposedByUserId)?.displayName ?? "Member",
  };
}

export function getDate(ctx: BotDateDb, userId: string, matchId: string): DateData | null {
  const pair = loadPair(ctx, userId, matchId);
  if (!pair) return null;
  const rows = messagesFor(ctx, matchId);
  const proposalRows = proposalsFor(ctx, matchId);
  const members = new Map(listMembers(ctx).map((member) => [member.id, member]));
  const bothOptIn = asBool(pair.match.aOptIn) && asBool(pair.match.bOptIn);
  const open = proposalRows.some((row) => row.status === "proposed");
  const confirmed = proposalRows.some((row) => row.status === "confirmed");
  let blockReason: string | null = null;
  if (!bothOptIn) blockReason = "Both of you opt in on Intro before a date can be proposed.";
  else if (confirmed) blockReason = "This date is already confirmed.";
  else if (open) blockReason = "There's already an open proposal.";
  return {
    matchId,
    person: toPublic(pair.other),
    bothOptIn,
    proposals: proposalRows.map((row) => presentProposal(row, userId, members)),
    canPropose: bothOptIn && !open && !confirmed,
    blockReason,
    suggestion: matchmaker.suggestDate(pair.viewer, pair.other),
    stage: stageFor(rows, pair.match, proposalRows),
  };
}

export function listDateIndex(ctx: BotDateDb, userId: string) {
  return listShortlist(ctx, userId).cards.map((card) => {
    const date = getDate(ctx, userId, card.matchId);
    const active = date?.proposals.find((item) => item.status === "proposed" || item.status === "confirmed");
    return {
      matchId: card.matchId,
      person: card.person,
      bothOptIn: card.bothOptedIn,
      status: active?.status ?? "none",
      whenLabel: active?.whenLabel ?? null,
      place: active?.place ?? null,
      mine: active?.mine ?? false,
    };
  });
}

function cleanBody(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

export function approveDraft(ctx: BotDateDb, userId: string, messageId: string, body?: string): ActionResult {
  return ctx.sqlite.transaction(() => {
    const message = ctx.db.select().from(messages).where(eq(messages.id, messageId)).get();
    if (!message) return fail("Draft not found.");
    const pair = loadPair(ctx, userId, message.matchId);
    if (!pair) return fail("That desk is not on your shortlist.");
    if (message.authorUserId !== userId || message.channel !== "bot") {
      return fail("You can only approve notes your own matchmaker drafted.");
    }
    if (message.approvalStatus !== "pending") return fail("This draft is no longer waiting.");
    if (pair.viewer.botPaused) return fail("Your matchmaker is paused. Unpause on your profile before anything sends.");
    const nextBody = cleanBody(body ?? message.body);
    if (!nextBody) return fail("Write something before sending.");
    if (nextBody.length > 800) return fail("Keep a draft under 800 characters.");
    ctx.db
      .update(messages)
      .set({
        body: nextBody,
        approvalStatus: "sent",
        edited: asBool(message.edited) || nextBody !== message.body,
      })
      .where(eq(messages.id, messageId))
      .run();
    enqueueNext(ctx, pair, { scriptStep: message.scriptStep, authorUserId: message.authorUserId });
    return ok();
  })();
}

function enqueueNext(
  ctx: BotDateDb,
  pair: { match: MatchRow; viewer: Member; other: Member },
  sent: { scriptStep: number | null; authorUserId: string | null },
) {
  const pending = ctx.db
    .select()
    .from(messages)
    .where(and(eq(messages.matchId, pair.match.id), eq(messages.channel, "bot"), eq(messages.approvalStatus, "pending")))
    .all();
  if (pending.length) return;
  const script = SCRIPTS[pair.match.id];
  if (script && sent.scriptStep != null) {
    const next = script[sent.scriptStep + 1];
    if (next) {
      insertBotDraft(ctx, pair.match.id, next.authorId, next.body, sent.scriptStep + 1);
      return;
    }
  }
  const rows = messagesFor(ctx, pair.match.id);
  const sentCount = sentBotCount(rows);
  if (sentCount >= 6) {
    const already = rows.some((row) => row.channel === "system" && row.body.includes("enough on the record"));
    if (!already) {
      insertSystem(
        ctx,
        pair.match.id,
        "Both matchmakers have enough on the record to suggest an introduction. Further drafts wait until someone asks.",
      );
    }
    return;
  }
  if (pair.other.botPaused) {
    insertSystem(
      ctx,
      pair.match.id,
      `${firstName(pair.other.displayName)}'s matchmaker is paused, so no reply was drafted.`,
    );
    return;
  }
  const body = matchmaker.composeReply(pair.other, pair.viewer, sentCount);
  insertBotDraft(ctx, pair.match.id, pair.other.id, body, null);
}

function insertBotDraft(ctx: BotDateDb, matchId: string, authorId: string, body: string, scriptStep: number | null) {
  ctx.db
    .insert(messages)
    .values({
      id: `msg_${crypto.randomUUID()}`,
      matchId,
      channel: "bot",
      authorUserId: authorId,
      authorKind: "bot",
      body,
      approvalStatus: "pending",
      scriptStep,
      edited: false,
      createdAt: new Date().toISOString(),
    })
    .run();
}

function insertSystem(ctx: BotDateDb, matchId: string, body: string, authorUserId: string | null = null) {
  ctx.db
    .insert(messages)
    .values({
      id: `msg_${crypto.randomUUID()}`,
      matchId,
      channel: "system",
      authorUserId,
      authorKind: "system",
      body,
      approvalStatus: "sent",
      scriptStep: null,
      edited: false,
      createdAt: new Date().toISOString(),
    })
    .run();
}

export function editDraft(ctx: BotDateDb, userId: string, messageId: string, body: string): ActionResult {
  const message = ctx.db.select().from(messages).where(eq(messages.id, messageId)).get();
  if (!message) return fail("Draft not found.");
  const pair = loadPair(ctx, userId, message.matchId);
  if (!pair) return fail("That desk is not on your shortlist.");
  if (message.authorUserId !== userId || message.approvalStatus !== "pending") {
    return fail("You can only edit your own unsent draft.");
  }
  const nextBody = cleanBody(body);
  if (!nextBody) return fail("A draft needs words.");
  if (nextBody.length > 800) return fail("Keep a draft under 800 characters.");
  ctx.db
    .update(messages)
    .set({ body: nextBody, edited: nextBody !== message.body || asBool(message.edited) })
    .where(eq(messages.id, messageId))
    .run();
  return ok();
}

export function killDraft(ctx: BotDateDb, userId: string, messageId: string): ActionResult {
  const message = ctx.db.select().from(messages).where(eq(messages.id, messageId)).get();
  if (!message) return fail("Draft not found.");
  const pair = loadPair(ctx, userId, message.matchId);
  if (!pair) return fail("That desk is not on your shortlist.");
  if (message.authorUserId !== userId || message.channel !== "bot") {
    return fail("You can only kill a draft that speaks for you.");
  }
  if (message.approvalStatus !== "pending") return fail("This draft is no longer waiting.");
  ctx.db.update(messages).set({ approvalStatus: "killed" }).where(eq(messages.id, messageId)).run();
  return ok();
}

export function createDraft(ctx: BotDateDb, userId: string, matchId: string): ActionResult {
  const pair = loadPair(ctx, userId, matchId);
  if (!pair) return fail("That desk is not on your shortlist.");
  if (pair.viewer.botPaused) return fail("Your matchmaker is paused. Unpause on your profile to draft again.");
  const rows = messagesFor(ctx, matchId);
  const pending = rows.some((row) => row.channel === "bot" && row.approvalStatus === "pending");
  if (pending) return fail("There's already a note waiting on approval.");
  const sent = sentBotCount(rows);
  if (sent >= 8) return fail("There's enough on the desk to decide on an introduction.");
  const killed = rows.filter((row) => row.channel === "bot" && row.approvalStatus === "killed" && row.authorUserId === userId).length;
  const body = sent === 0 ? matchmaker.composeOpening(pair.viewer) : matchmaker.composeReply(pair.viewer, pair.other, sent + killed);
  insertBotDraft(ctx, matchId, userId, body, null);
  return ok();
}

export function optIn(ctx: BotDateDb, userId: string, matchId: string): ActionResult {
  const pair = loadPair(ctx, userId, matchId);
  if (!pair) return fail("That introduction is not on your shortlist.");
  if (pair.match.userAId === userId) {
    ctx.db.update(matches).set({ aOptIn: true }).where(eq(matches.id, matchId)).run();
  } else {
    ctx.db.update(matches).set({ bOptIn: true }).where(eq(matches.id, matchId)).run();
  }
  return ok();
}

export function chooseChannel(ctx: BotDateDb, userId: string, matchId: string, choice: ChannelChoice): ActionResult {
  const pair = loadPair(ctx, userId, matchId);
  if (!pair) return fail("That introduction is not on your shortlist.");
  if (!asBool(pair.match.aOptIn) || !asBool(pair.match.bOptIn)) {
    return fail("Both people opt in before choosing how to talk.");
  }
  if (choice !== "human" && choice !== "bot") return fail("Choose human chat or bot-mediated.");
  ctx.db.update(matches).set({ channelChoice: choice }).where(eq(matches.id, matchId)).run();
  return ok();
}

export function sendHuman(ctx: BotDateDb, userId: string, matchId: string, body: string): ActionResult {
  const pair = loadPair(ctx, userId, matchId);
  if (!pair) return fail("That chat is not on your shortlist.");
  if (channelOf(pair.match.channelChoice) !== "human" || !asBool(pair.match.aOptIn) || !asBool(pair.match.bOptIn)) {
    return fail("Human chat opens only after both of you opt in and choose it.");
  }
  const nextBody = cleanBody(body);
  if (!nextBody) return fail("Write a message first.");
  if (nextBody.length > 800) return fail("Keep a message under 800 characters.");
  ctx.db
    .insert(messages)
    .values({
      id: `msg_${crypto.randomUUID()}`,
      matchId,
      channel: "human",
      authorUserId: userId,
      authorKind: "human",
      body: nextBody,
      approvalStatus: "sent",
      scriptStep: null,
      edited: false,
      createdAt: new Date().toISOString(),
    })
    .run();
  return ok();
}

export function proposeDate(
  ctx: BotDateDb,
  userId: string,
  matchId: string,
  input: { local: string; place: string; note: string },
): ActionResult {
  const pair = loadPair(ctx, userId, matchId);
  if (!pair) return fail("That date desk is not on your shortlist.");
  if (!asBool(pair.match.aOptIn) || !asBool(pair.match.bOptIn)) {
    return fail("Both of you opt in before proposing a time.");
  }
  const existing = proposalsFor(ctx, matchId);
  if (existing.some((row) => row.status === "confirmed")) return fail("This date is already confirmed.");
  if (existing.some((row) => row.status === "proposed")) return fail("There's already an open proposal.");
  const place = input.place.trim();
  const note = input.note.trim();
  if (place.length < 2 || place.length > 120) return fail("Name a place.");
  if (note.length > 280) return fail("Keep the note under 280 characters.");
  let startsAt: string;
  try {
    startsAt = pacificLocalToIso(input.local);
  } catch {
    return fail("Choose a date and time.");
  }
  if (!isFutureIso(startsAt)) return fail("Pick a time in the future. Times are Pacific.");
  ctx.db
    .insert(dateProposals)
    .values({
      id: `proposal_${crypto.randomUUID()}`,
      matchId,
      proposedByUserId: userId,
      startsAt,
      place,
      note,
      status: "proposed",
      createdAt: new Date().toISOString(),
    })
    .run();
  return ok();
}

export function respondToDate(
  ctx: BotDateDb,
  userId: string,
  proposalId: string,
  decision: "confirm" | "decline" | "withdraw",
): ActionResult {
  const proposal = ctx.db.select().from(dateProposals).where(eq(dateProposals.id, proposalId)).get();
  if (!proposal) return fail("Proposal not found.");
  const pair = loadPair(ctx, userId, proposal.matchId);
  if (!pair) return fail("That date desk is not on your shortlist.");
  if (proposal.status !== "proposed") return fail("This proposal is already closed.");
  const mine = proposal.proposedByUserId === userId;
  if (decision === "withdraw") {
    if (!mine) return fail("Only the person who proposed can withdraw it.");
    ctx.db.update(dateProposals).set({ status: "withdrawn" }).where(eq(dateProposals.id, proposalId)).run();
    return ok();
  }
  if (mine) return fail("The other person confirms the plan.");
  ctx.db
    .update(dateProposals)
    .set({ status: decision === "confirm" ? "confirmed" : "declined" })
    .where(eq(dateProposals.id, proposalId))
    .run();
  return ok();
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return (allowed as readonly string[]).includes(value);
}

export function saveMember(ctx: BotDateDb, userId: string, input: MemberInput): ActionResult {
  const existing = getMember(ctx, userId);
  if (!existing) return fail("Member not found.");
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > 60) return fail("Use a name under 60 characters.");
  if (!oneOf(input.pronouns, PRONOUNS)) return fail("Choose pronouns.");
  if (!Number.isInteger(input.age) || input.age < 18 || input.age > 99) return fail("Age needs to be between 18 and 99.");
  if (!oneOf(input.city, CITIES)) return fail("Choose a city.");
  const occupation = input.occupation.trim();
  if (occupation.length < 2 || occupation.length > 80) return fail("Add an occupation.");
  const bio = input.bio.trim();
  if (bio.length < 1 || bio.length > 500) return fail("Keep the bio under 500 characters.");
  if (!oneOf(input.kids, ["wants", "open", "doesnt"] as const)) return fail("Choose a kids stance.");
  if (!oneOf(input.intent, ["serious", "casual"] as const)) return fail("Choose an intent.");
  const interests = [...new Set(input.interests.map((item) => item.trim()))];
  if (interests.some((item) => !oneOf(item, INTERESTS))) return fail("Use the interest list.");
  if (!Number.isInteger(input.ageMin) || !Number.isInteger(input.ageMax)) return fail("Age range needs whole numbers.");
  if (input.ageMin < 18 || input.ageMax > 99 || input.ageMin > input.ageMax) return fail("Fix the age range.");
  const cities = CITIES.filter((city) => input.cities.includes(city));
  if (!cities.length) return fail("Pick at least one city.");
  if (!oneOf(input.smokingFilter, ["no", "any"] as const)) return fail("Choose a smoking dealbreaker.");
  if (!oneOf(input.kidsFilter, ["wants", "doesnt", "any"] as const)) return fail("Choose a kids dealbreaker.");
  if (!oneOf(input.intentFilter, ["serious", "casual", "any"] as const)) return fail("Choose an intent dealbreaker.");
  const niceToHaves = input.niceToHaves.trim();
  if (niceToHaves.length > 400) return fail("Keep nice-to-haves under 400 characters.");
  const voice = voiceForPronouns(input.pronouns);
  ctx.db.update(users).set({ displayName }).where(eq(users.id, userId)).run();
  ctx.db
    .update(profiles)
    .set({
      age: input.age,
      city: input.city,
      occupation,
      bio,
      pronouns: input.pronouns,
      smoking: input.smoking,
      kids: input.kids,
      intent: input.intent,
      interests: JSON.stringify(interests),
      voice: JSON.stringify(voice),
    })
    .where(eq(profiles.userId, userId))
    .run();
  ctx.db
    .update(prefs)
    .set({
      ageMin: input.ageMin,
      ageMax: input.ageMax,
      cities: JSON.stringify(cities),
      smoking: input.smokingFilter,
      kids: input.kidsFilter,
      intent: input.intentFilter,
      niceToHaves,
      locked: input.locked,
    })
    .where(eq(prefs.userId, userId))
    .run();
  return ok();
}

export function setPaused(ctx: BotDateDb, userId: string, paused: boolean): ActionResult {
  if (!getMember(ctx, userId)) return fail("Member not found.");
  ctx.db.update(users).set({ botPaused: paused }).where(eq(users.id, userId)).run();
  return ok();
}

export function wipeMemory(ctx: BotDateDb, userId: string): ActionResult {
  const member = getMember(ctx, userId);
  if (!member) return fail("Member not found.");
  const involved = ctx.db
    .select()
    .from(matches)
    .where(or(eq(matches.userAId, userId), eq(matches.userBId, userId)))
    .all();
  const request = member.profile.voice.possessive;
  for (const match of involved) {
    ctx.db.delete(messages).where(and(eq(messages.matchId, match.id), eq(messages.channel, "bot"))).run();
    insertSystem(
      ctx,
      match.id,
      `${member.displayName} wiped matchmaker memory at ${request} request. Earlier bot-to-bot notes on this desk were deleted. Human chat was not touched.`,
      userId,
    );
  }
  return ok();
}
