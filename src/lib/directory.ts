import type { BotDateDb } from "./db/open";
import { getMember, listMembers } from "./domain";
import { mutualPass, softRank } from "./matchmaker/filters";
import { matchmaker } from "./matchmaker/service";
import type { Member } from "./types";
import { ensureRealMemberNumbers } from "./x/account";

export type DirectoryEntry = {
  id: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  accent: string;
  bio: string;
  city: string;
  founder: boolean;
  memberNumber: number;
};

export type MemberProfileView = DirectoryEntry & {
  summary: string;
  cues: string[];
  self: boolean;
};

/** Render a stored avatar URL. Https only, or a root-relative path already on this app. */
export function displayAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\") && !url.includes("..")) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function title(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

/** Cues from the two profiles already stored here. Nothing is loaded from X. */
export function matchingCues(viewer: Member, person: Member): string[] {
  if (viewer.id === person.id) {
    const notes = person.profile.interests.slice(0, 4).map(title);
    return [notes.length ? `Notes on file: ${notes.join(", ")}` : person.profile.city, "This is your profile."].filter(Boolean);
  }
  const cues = [...softRank(viewer, person).notes];
  if (viewer.profile.intent === person.profile.intent) {
    cues.push(person.profile.intent === "serious" ? "Same intent: dating seriously" : "Same intent: something casual");
  }
  if (viewer.prefs.locked && person.prefs.locked && mutualPass(viewer, person)) {
    cues.push("Clears both sets of dealbreakers");
  }
  if (cues.length === 0) {
    const interests = person.profile.interests.slice(0, 3);
    if (interests.length) cues.push(`Into ${interests.join(", ")}`);
    if (person.profile.city) cues.push(person.profile.city);
  }
  return cues;
}

function toEntry(member: Member): DirectoryEntry | null {
  if (!member.xAccount || member.memberNumber == null) return null;
  return {
    id: member.id,
    displayName: member.displayName,
    handle: member.xAccount.handle,
    avatarUrl: member.xAccount.avatarUrl,
    accent: member.profile.accent,
    bio: member.profile.bio,
    city: member.profile.city,
    founder: member.founder,
    memberNumber: member.memberNumber,
  };
}

/** Real X members only, founder first. Demo roster rows are left out. */
export function listDirectory(ctx: BotDateDb): DirectoryEntry[] {
  ensureRealMemberNumbers(ctx);
  return listMembers(ctx)
    .map(toEntry)
    .filter((entry): entry is DirectoryEntry => entry !== null)
    .sort(byMemberNumber);
}

function byMemberNumber(a: DirectoryEntry, b: DirectoryEntry): number {
  return a.memberNumber - b.memberNumber || a.displayName.localeCompare(b.displayName);
}

/** Keep the signed-in member visible when this instance has not stored their row yet. */
export function includeViewer(people: DirectoryEntry[], member: Member): DirectoryEntry[] {
  const self = toEntry(member);
  if (!self || people.some((person) => person.id === self.id)) return people;
  return [...people, self].sort(byMemberNumber);
}

export function profileView(viewer: Member, person: Member): MemberProfileView | null {
  const entry = toEntry(person);
  if (!entry) return null;
  return {
    ...entry,
    summary: matchmaker.summarize(person),
    cues: matchingCues(viewer, person),
    self: viewer.id === person.id,
  };
}

/**
 * Profile fields saved at sign-in, plus a matchmaker summary and cues.
 * Reads BotDate's database only. Callers must not fetch the X profile again.
 */
export function memberProfile(ctx: BotDateDb, viewerId: string, memberId: string): MemberProfileView | null {
  ensureRealMemberNumbers(ctx);
  const viewer = getMember(ctx, viewerId);
  const person = getMember(ctx, memberId);
  if (!viewer || !person) return null;
  return profileView(viewer, person);
}
