import { subscriptionBlocks } from "../billing/access";
import type { BotDateDb } from "../db/open";
import {
  applyBotProfile,
  approveOffer,
  getDesk,
  getMember,
  listMembers,
  listShortlist,
  passOffer,
  proposeHeldDate,
  sendBotNote,
  type BotProfilePatch,
} from "../domain";
import { representedBy } from "../labels";
import { isAllowedMemberAge, isProfileComplete, matchIdFor, MEMBER_AGE_ERROR, normalizeDealbreakers, parseSeeking, type Gender, type Intent, type KidsStance, type Member, type Seeking, type SmokingFilter } from "../types";
import type { AgentResponse } from "./dispatch";
import { onboardingGuidance } from "./onboarding";

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function int(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function stringList(value: unknown): string[] | undefined {
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function genderOf(value: unknown): Gender | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "man" || normalized === "woman") return normalized;
  return undefined;
}

function profileBody(member: Member, self: boolean) {
  return {
    id: member.id,
    displayName: member.displayName,
    handle: member.xAccount?.handle ?? null,
    representedBy: representedBy(member.displayName, self),
    paused: member.botPaused,
    founder: member.founder,
    profile: {
      age: member.profile.age,
      city: member.profile.city,
      occupation: member.profile.occupation,
      bio: member.profile.bio,
      gender: member.profile.gender,
      smoking: member.profile.smoking,
      kids: member.profile.kids,
      intent: member.profile.intent,
      interests: member.profile.interests,
    },
    preferences: {
      ageMin: member.prefs.ageMin,
      ageMax: member.prefs.ageMax,
      cities: member.prefs.cities,
      smoking: member.prefs.smoking,
      kids: member.prefs.kids,
      intent: member.prefs.intent,
      seeking: member.prefs.seeking,
      niceToHaves: member.prefs.niceToHaves,
      ...(self ? { dealbreakers: member.prefs.dealbreakers } : {}),
      locked: member.prefs.locked,
    },
  };
}

export type BrowseFilters = {
  query?: string;
  city?: string;
  ageMin?: number;
  ageMax?: number;
  intent?: string;
  kids?: string;
  smoking?: string;
  limit?: number;
};

export function browseMembers(ctx: BotDateDb, viewerId: string, filters: BrowseFilters) {
  const query = filters.query?.trim().toLowerCase() ?? "";
  const city = filters.city?.trim().toLowerCase() ?? "";
  const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 50) : 20;
  const people = listMembers(ctx).filter((other) => {
    if (other.id === viewerId || subscriptionBlocks(other) || !isProfileComplete(other)) return false;
    if (city && other.profile.city?.toLowerCase() !== city) return false;
    if (filters.ageMin !== undefined && (other.profile.age == null || other.profile.age < filters.ageMin)) return false;
    if (filters.ageMax !== undefined && (other.profile.age == null || other.profile.age > filters.ageMax)) return false;
    if (filters.intent && filters.intent !== "any" && other.profile.intent !== filters.intent) return false;
    if (filters.kids && filters.kids !== "any" && other.profile.kids !== filters.kids) return false;
    if (filters.smoking === "no" && other.profile.smoking) return false;
    if (query) {
      const hay = [other.displayName, other.xAccount?.handle ?? "", other.profile.bio, other.profile.city ?? "", other.profile.occupation, other.profile.interests.join(" ")]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });
  return people.slice(0, limit).map((other) => profileBody(other, false));
}

export function listBotInbox(ctx: BotDateDb, userId: string, matchId?: string) {
  const list = listShortlist(ctx, userId);
  const cards = matchId ? list.cards.filter((card) => card.matchId === matchId) : list.cards;
  return cards.map((card) => {
    const desk = getDesk(ctx, userId, card.matchId);
    const messages = (desk?.items ?? [])
      .filter((item) => item.kind === "bot")
      .map((item) => ({
        id: item.id,
        body: item.body,
        authorName: item.authorName,
        mine: item.mine,
        at: item.at,
      }));
    return {
      matchId: card.matchId,
      memberId: card.person.id,
      displayName: card.person.displayName,
      messages,
    };
  });
}

function profilePatch(args: Record<string, unknown>): BotProfilePatch | { error: string } {
  const patch: BotProfilePatch = {};
  if (args.displayName !== undefined) {
    if (text(args.displayName) === undefined) return { error: "displayName must be a string." };
    patch.displayName = text(args.displayName);
  }
  if (args.bio !== undefined) {
    if (text(args.bio) === undefined) return { error: "bio must be a string." };
    patch.bio = text(args.bio);
  }
  if (args.occupation !== undefined) {
    if (text(args.occupation) === undefined) return { error: "occupation must be a string." };
    patch.occupation = text(args.occupation);
  }
  if (args.city !== undefined) {
    if (text(args.city) === undefined) return { error: "city must be a string." };
    patch.city = text(args.city);
  }
  if (args.age !== undefined) {
    const age = int(args.age);
    if (age === undefined) return { error: "age must be a whole number." };
    if (!isAllowedMemberAge(age)) return { error: MEMBER_AGE_ERROR };
    patch.age = age;
  }
  if (args.gender !== undefined) {
    const gender = genderOf(args.gender);
    if (!gender) return { error: "gender must be man or woman." };
    patch.gender = gender;
  }
  if (args.interests !== undefined) {
    const interests = stringList(args.interests);
    if (!interests) return { error: "interests must be a list of strings." };
    patch.interests = interests;
  }
  if (args.niceToHaves !== undefined) {
    if (text(args.niceToHaves) === undefined) return { error: "niceToHaves must be a string." };
    patch.niceToHaves = text(args.niceToHaves);
  }
  if (args.dealbreakers !== undefined) {
    if (!Array.isArray(args.dealbreakers) || args.dealbreakers.some((item) => typeof item !== "string")) {
      return { error: "dealbreakers must be a list of short strings." };
    }
    const dealbreakers = normalizeDealbreakers(args.dealbreakers);
    if (!dealbreakers.ok) return { error: dealbreakers.error };
    patch.dealbreakers = dealbreakers.dealbreakers;
  }
  if (args.smokes !== undefined) {
    const smoking = bool(args.smokes);
    if (smoking === undefined) return { error: "smokes must be true or false." };
    patch.smoking = smoking;
  }
  const kids = args.kidsStance === undefined ? undefined : oneOf(args.kidsStance, ["wants", "open", "doesnt"] as const);
  if (args.kidsStance !== undefined && !kids) return { error: "kidsStance must be wants, open, or doesnt." };
  if (kids) patch.kids = kids as KidsStance;
  const intent = args.datingIntent === undefined ? undefined : oneOf(args.datingIntent, ["serious", "casual"] as const);
  if (args.datingIntent !== undefined && !intent) return { error: "datingIntent must be serious or casual." };
  if (intent) patch.intent = intent as Intent;
  if (args.ageMin !== undefined) {
    const ageMin = int(args.ageMin);
    if (ageMin === undefined) return { error: "ageMin must be a whole number." };
    patch.ageMin = ageMin;
  }
  if (args.ageMax !== undefined) {
    const ageMax = int(args.ageMax);
    if (ageMax === undefined) return { error: "ageMax must be a whole number." };
    patch.ageMax = ageMax;
  }
  if (args.cities !== undefined) {
    const cities = stringList(args.cities);
    if (!cities) return { error: "cities must be a list of strings." };
    patch.cities = cities;
  }
  const smoking = args.smoking === undefined ? undefined : oneOf(args.smoking, ["no", "any"] as const);
  if (args.smoking !== undefined && !smoking) return { error: "smoking must be no or any." };
  if (smoking) patch.smokingFilter = smoking as SmokingFilter;
  const kidsFilter = args.kids === undefined ? undefined : oneOf(args.kids, ["wants", "doesnt", "any"] as const);
  if (args.kids !== undefined && !kidsFilter) return { error: "kids must be wants, doesnt, or any." };
  if (kidsFilter) patch.kidsFilter = kidsFilter;
  const intentFilter = args.intent === undefined ? undefined : oneOf(args.intent, ["serious", "casual", "any"] as const);
  if (args.intent !== undefined && !intentFilter) return { error: "intent must be serious, casual, or any." };
  if (intentFilter) patch.intentFilter = intentFilter;
  if (args.seeking !== undefined) {
    if (typeof args.seeking !== "string") return { error: "seeking must be men, women, or either." };
    const seeking = parseSeeking(args.seeking);
    if (!seeking) return { error: "seeking must be men, women, or either." };
    patch.seeking = seeking as Seeking;
  }
  if (args.locked !== undefined) {
    const locked = bool(args.locked);
    if (locked === undefined) return { error: "locked must be true or false." };
    patch.locked = locked;
  }
  return patch;
}

function ownProfile(member: Member) {
  const guidance = onboardingGuidance(member);
  return {
    member: profileBody(member, true),
    profileComplete: guidance.profileComplete,
    next_step: guidance.next_step,
  };
}

export function callTool(ctx: BotDateDb, member: Member, name: string, args: Record<string, unknown>): AgentResponse | null {
  if (name === "get_my_profile") {
    return { status: 200, body: ownProfile(member) };
  }
  if (name === "update_my_profile" || name === "update_preferences") {
    const patch = profilePatch(args);
    if ("error" in patch) return { status: 400, body: { error: patch.error } };
    const result = applyBotProfile(ctx, member.id, patch);
    if (!result.ok) return { status: 400, body: { error: result.error } };
    const updated = getMember(ctx, member.id);
    return { status: 200, body: updated ? ownProfile(updated) : { member: null, profileComplete: false, next_step: "" } };
  }
  if (name === "browse_members" || name === "get_shortlist") {
    if (name === "get_shortlist") {
      const list = listShortlist(ctx, member.id);
      return {
        status: 200,
        body: {
          locked: list.locked,
          members: list.cards.map((card) => ({
            matchId: card.matchId,
            id: card.person.id,
            displayName: card.person.displayName,
            age: card.person.age,
            city: card.person.city,
            why: card.why,
            dateStatus: card.dateStatus,
            offerWaiting: card.offerWaiting,
          })),
        },
      };
    }
    const filters: BrowseFilters = {
      query: text(args.query),
      city: text(args.city),
      ageMin: int(args.ageMin),
      ageMax: int(args.ageMax),
      intent: text(args.intent),
      kids: text(args.kids),
      smoking: text(args.smoking),
      limit: int(args.limit),
    };
    return { status: 200, body: { members: browseMembers(ctx, member.id, filters) } };
  }
  if (name === "get_member") {
    const memberId = text(args.memberId) ?? "";
    const person = getMember(ctx, memberId);
    if (!person || person.id === member.id || subscriptionBlocks(person) || !isProfileComplete(person)) {
      return { status: 404, body: { error: "That member is not available." } };
    }
    return { status: 200, body: { member: profileBody(person, false) } };
  }
  if (name === "send_bot_message" || name === "send_desk_message") {
    const body = text(args.body);
    if (body === undefined) return { status: 400, body: { error: "Send a body." } };
    const matchId = text(args.matchId) || (text(args.memberId) ? matchIdFor(member.id, text(args.memberId) as string) : "");
    if (!matchId) return { status: 400, body: { error: "Send memberId or matchId, and body." } };
    const result = sendBotNote(ctx, member.id, matchId, body);
    if (!result.ok) return { status: 400, body: { error: result.error } };
    return { status: 201, body: { id: result.id, matchId, approval: "sent" } };
  }
  if (name === "list_bot_messages" || name === "inbox" || name === "get_desk_messages" || name === "list_desks") {
    if (name === "list_desks") {
      const inbox = listBotInbox(ctx, member.id);
      return {
        status: 200,
        body: { desks: inbox.map((row) => ({ matchId: row.matchId, displayName: row.displayName, messages: row.messages.length })) },
      };
    }
    const matchId = text(args.matchId) || (text(args.memberId) ? matchIdFor(member.id, text(args.memberId) as string) : undefined);
    return { status: 200, body: { inbox: listBotInbox(ctx, member.id, matchId) } };
  }
  if (name === "propose_date") {
    const matchId = text(args.matchId) || (text(args.memberId) ? matchIdFor(member.id, text(args.memberId) as string) : "");
    const local = text(args.local);
    const place = text(args.place);
    const note = text(args.note) ?? "";
    if (!matchId || !local || place === undefined) {
      return { status: 400, body: { error: "Send matchId, local (Pacific, YYYY-MM-DDTHH:mm), and place." } };
    }
    const result = proposeHeldDate(ctx, member.id, matchId, { local, place, note });
    if (!result.ok) return { status: 400, body: { error: result.error } };
    return {
      status: 201,
      body: {
        id: result.id,
        matchId,
        released: false,
        memberDecision: "pending",
        message: "Your member is pinged in BotDate with this date. It is not offered to the other person until they accept. Bot chat stays private.",
      },
    };
  }
  if (name === "respond_to_date") {
    const proposalId = text(args.proposalId) ?? "";
    const decision = text(args.decision);
    if (!proposalId || (decision !== "accept" && decision !== "decline" && decision !== "approved" && decision !== "passed")) {
      return { status: 400, body: { error: "Send proposalId and decision accept or decline." } };
    }
    const result = decision === "accept" || decision === "approved" ? approveOffer(ctx, member.id, proposalId) : passOffer(ctx, member.id, proposalId);
    if (!result.ok) return { status: 400, body: { error: result.error } };
    return { status: 200, body: { proposalId, decision: decision === "accept" || decision === "approved" ? "accept" : "decline" } };
  }
  return null;
}
