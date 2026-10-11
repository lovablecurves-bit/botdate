import type { BotDateDb } from "../db/open";
import {
  getDate,
  getDesk,
  listDesk,
  listShortlist,
  memberToInput,
  proposeHeldDate,
  saveMember,
  sendBotNote,
} from "../domain";
import { PRONOUNS, type Intent, type IntentFilter, type KidsFilter, type KidsStance, type SmokingFilter } from "../types";
import { memberForAgentToken } from "./tokens";

export type AgentResponse = { status: number; body: unknown };

function bearer(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

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
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return value;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function dispatchAgent(input: {
  ctx: BotDateDb;
  authorization: string | null;
  method: string;
  pathname: string;
  body: unknown;
}): AgentResponse {
  const token = bearer(input.authorization);
  if (!token) return { status: 401, body: { error: "Send the agent token as Authorization: Bearer." } };
  const member = memberForAgentToken(input.ctx, token);
  if (!member) return { status: 401, body: { error: "That agent token is not active." } };

  const path = input.pathname.replace(/\/+$/, "") || "/";
  const method = input.method.toUpperCase();
  const prefix = "/api/agent/v1";
  const rest = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  const parts = rest.split("/").filter(Boolean);

  if (method === "GET" && parts.length === 0) {
    return {
      status: 200,
      body: {
        service: "BotDate agent",
        memberId: member.id,
        endpoints: {
          me: `${prefix}/me`,
          preferences: `${prefix}/preferences`,
          shortlist: `${prefix}/shortlist`,
          desks: `${prefix}/desks`,
          messages: `${prefix}/desks/{matchId}/messages`,
          dates: `${prefix}/dates`,
        },
      },
    };
  }

  if (method === "GET" && parts.length === 1 && parts[0] === "me") {
    return {
      status: 200,
      body: {
        member: {
          id: member.id,
          displayName: member.displayName,
          handle: member.xAccount?.handle ?? null,
          avatarUrl: member.xAccount?.avatarUrl || null,
          paused: member.botPaused,
          profile: {
            age: member.profile.age,
            city: member.profile.city,
            occupation: member.profile.occupation,
            bio: member.profile.bio,
            pronouns: member.profile.pronouns,
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
            niceToHaves: member.prefs.niceToHaves,
            locked: member.prefs.locked,
          },
        },
      },
    };
  }

  if (method === "PATCH" && parts.length === 1 && parts[0] === "preferences") {
    if (!input.body || typeof input.body !== "object" || Array.isArray(input.body)) {
      return { status: 400, body: { error: "Send a JSON object of preference fields." } };
    }
    const patch = input.body as Record<string, unknown>;
    const current = memberToInput(member);
    const smoking = patch.smoking === undefined ? undefined : oneOf(patch.smoking, ["no", "any"] as const);
    const kids = patch.kids === undefined ? undefined : oneOf(patch.kids, ["wants", "doesnt", "any"] as const);
    const intent = patch.intent === undefined ? undefined : oneOf(patch.intent, ["serious", "casual", "any"] as const);
    if (patch.smoking !== undefined && !smoking) return { status: 400, body: { error: "smoking must be no or any." } };
    if (patch.kids !== undefined && !kids) return { status: 400, body: { error: "kids must be wants, doesnt, or any." } };
    if (patch.intent !== undefined && !intent) return { status: 400, body: { error: "intent must be serious, casual, or any." } };
    if (patch.cities !== undefined && !stringList(patch.cities)) return { status: 400, body: { error: "cities must be a list of strings." } };
    if (patch.ageMin !== undefined && int(patch.ageMin) === undefined) return { status: 400, body: { error: "ageMin must be a whole number." } };
    if (patch.ageMax !== undefined && int(patch.ageMax) === undefined) return { status: 400, body: { error: "ageMax must be a whole number." } };
    if (patch.locked !== undefined && bool(patch.locked) === undefined) return { status: 400, body: { error: "locked must be true or false." } };
    if (patch.niceToHaves !== undefined && text(patch.niceToHaves) === undefined) {
      return { status: 400, body: { error: "niceToHaves must be a string." } };
    }
    const pronouns = patch.pronouns === undefined ? undefined : oneOf(patch.pronouns, PRONOUNS);
    const kidsStance = patch.kidsStance === undefined ? undefined : oneOf(patch.kidsStance, ["wants", "open", "doesnt"] as const);
    const datingIntent = patch.datingIntent === undefined ? undefined : oneOf(patch.datingIntent, ["serious", "casual"] as const);
    if (patch.pronouns !== undefined && !pronouns) return { status: 400, body: { error: "pronouns must be she/her, he/him, or they/them." } };
    if (patch.age !== undefined && int(patch.age) === undefined) return { status: 400, body: { error: "age must be a whole number." } };
    if (patch.city !== undefined && text(patch.city) === undefined) return { status: 400, body: { error: "city must be a string." } };
    if (patch.occupation !== undefined && text(patch.occupation) === undefined) return { status: 400, body: { error: "occupation must be a string." } };
    if (patch.bio !== undefined && text(patch.bio) === undefined) return { status: 400, body: { error: "bio must be a string." } };
    if (patch.displayName !== undefined && text(patch.displayName) === undefined) return { status: 400, body: { error: "displayName must be a string." } };
    if (patch.smokes !== undefined && bool(patch.smokes) === undefined) return { status: 400, body: { error: "smokes must be true or false." } };
    if (patch.kidsStance !== undefined && !kidsStance) return { status: 400, body: { error: "kidsStance must be wants, open, or doesnt." } };
    if (patch.datingIntent !== undefined && !datingIntent) return { status: 400, body: { error: "datingIntent must be serious or casual." } };
    if (patch.interests !== undefined && !stringList(patch.interests)) return { status: 400, body: { error: "interests must be a list of strings." } };
    const result = saveMember(input.ctx, member.id, {
      ...current,
      displayName: text(patch.displayName) ?? current.displayName,
      pronouns: pronouns ?? current.pronouns,
      age: int(patch.age) ?? current.age,
      city: text(patch.city) ?? current.city,
      occupation: text(patch.occupation) ?? current.occupation,
      bio: text(patch.bio) ?? current.bio,
      smoking: bool(patch.smokes) ?? current.smoking,
      kids: (kidsStance ?? current.kids) as KidsStance,
      intent: (datingIntent ?? current.intent) as Intent,
      interests: stringList(patch.interests) ?? current.interests,
      ageMin: int(patch.ageMin) ?? current.ageMin,
      ageMax: int(patch.ageMax) ?? current.ageMax,
      cities: stringList(patch.cities) ?? current.cities,
      smokingFilter: (smoking ?? current.smokingFilter) as SmokingFilter,
      kidsFilter: (kids ?? current.kidsFilter) as KidsFilter,
      intentFilter: (intent ?? current.intentFilter) as IntentFilter,
      niceToHaves: text(patch.niceToHaves) ?? current.niceToHaves,
      locked: bool(patch.locked) ?? current.locked,
    });
    if (!result.ok) return { status: 400, body: { error: result.error } };
    const updated = memberForAgentToken(input.ctx, token);
    return {
      status: 200,
      body: {
        preferences: updated && {
          ageMin: updated.prefs.ageMin,
          ageMax: updated.prefs.ageMax,
          cities: updated.prefs.cities,
          smoking: updated.prefs.smoking,
          kids: updated.prefs.kids,
          intent: updated.prefs.intent,
          niceToHaves: updated.prefs.niceToHaves,
          locked: updated.prefs.locked,
        },
      },
    };
  }

  if (method === "GET" && parts.length === 1 && parts[0] === "shortlist") {
    const list = listShortlist(input.ctx, member.id);
    return {
      status: 200,
      body: {
        locked: list.locked,
        niceToHaves: list.niceToHaves,
        cards: list.cards.map((card) => ({
          matchId: card.matchId,
          displayName: card.person.displayName,
          age: card.person.age,
          city: card.person.city,
          occupation: card.person.occupation,
          bio: card.person.bio,
          interests: card.person.interests,
          why: card.why,
          dateStatus: card.dateStatus,
          offerWaiting: card.offerWaiting,
          offer: card.offer
            ? { id: card.offer.id, whenLabel: card.offer.whenLabel, local: card.offer.local, place: card.offer.place, note: card.offer.note }
            : null,
        })),
      },
    };
  }

  if (method === "GET" && parts.length === 1 && parts[0] === "desks") {
    const desks = listDesk(input.ctx, member.id);
    return {
      status: 200,
      body: {
        desks: desks.map((desk) => ({
          matchId: desk.matchId,
          displayName: desk.person.displayName,
          preview: desk.preview,
          at: desk.at,
        })),
      },
    };
  }

  if (parts.length === 3 && parts[0] === "desks" && parts[2] === "messages") {
    const matchId = decodeURIComponent(parts[1] ?? "");
    if (method === "GET") {
      const desk = getDesk(input.ctx, member.id, matchId);
      if (!desk) return { status: 404, body: { error: "That desk is not on your shortlist." } };
      return {
        status: 200,
        body: {
          matchId,
          displayName: desk.person.displayName,
          messages: desk.items.map((item) => ({
            id: item.id,
            body: item.body,
            authorName: item.authorName,
            mine: item.mine,
            kind: item.kind,
            at: item.at,
          })),
        },
      };
    }
    if (method === "POST") {
      const message = input.body && typeof input.body === "object" ? text((input.body as { body?: unknown }).body) : undefined;
      if (message === undefined) return { status: 400, body: { error: "Send { \"body\": \"...\" }." } };
      const result = sendBotNote(input.ctx, member.id, matchId, message);
      if (!result.ok) return { status: 400, body: { error: result.error } };
      return { status: 201, body: { id: result.id, matchId, approval: "sent" } };
    }
  }

  if (method === "POST" && parts.length === 1 && parts[0] === "dates") {
    if (!input.body || typeof input.body !== "object") return { status: 400, body: { error: "Send a JSON object." } };
    const row = input.body as Record<string, unknown>;
    const matchId = text(row.matchId);
    const local = text(row.local);
    const place = text(row.place);
    const note = text(row.note) ?? "";
    if (!matchId || !local || place === undefined) {
      return { status: 400, body: { error: "Send matchId, local (Pacific, YYYY-MM-DDTHH:mm), and place." } };
    }
    const result = proposeHeldDate(input.ctx, member.id, matchId, { local, place, note });
    if (!result.ok) return { status: 400, body: { error: result.error } };
    const date = getDate(input.ctx, member.id, matchId);
    const offer = date?.proposals.find((item) => item.id === result.id);
    return {
      status: 201,
      body: {
        id: result.id,
        status: offer?.status ?? "proposed",
        released: false,
        memberDecision: "pending",
        message: "The offer stays with your member until they approve it. It is not sent to the other person before that.",
      },
    };
  }

  return { status: 404, body: { error: "No agent route matches that path." } };
}
