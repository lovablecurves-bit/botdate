import type { Member } from "../types";
import { upcomingSaturdayLocal } from "../time";
import { evaluateHardFilters, softRank } from "./filters";

function cap(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function article(value: string): string {
  return /^[aeiou]/i.test(value) ? "an" : "a";
}

/**
 * Deterministic stand-in for the Grok matchmaker.
 * No network calls. Sample scripts cover the seeded desks; everything else
 * is a heuristic written from the profile both people already consented to share.
 */
export class MatchmakerBotService {
  explainFit(viewer: Member, candidate: Member): { score: number; why: string[]; rankNotes: string[] } {
    const why = evaluateHardFilters(viewer.prefs, candidate.profile)
      .filter((check) => check.pass)
      .map((check) => check.detail);
    why.push("Clears their dealbreakers too");
    const soft = softRank(viewer, candidate);
    return { score: soft.score, why, rankNotes: soft.notes };
  }

  composeOpening(member: Member): string {
    const voice = member.profile.voice;
    const subject = cap(voice.subject);
    const they = voice.subject === "they";
    const be = they ? "are" : "is";
    const work = they ? "work" : "works";
    const job = member.profile.occupation.slice(0, 1).toLowerCase() + member.profile.occupation.slice(1);
    const interests = member.profile.interests.slice(0, 3).join(", ");
    return [
      `This is ${member.displayName}'s matchmaker.`,
      `${member.displayName.split(" ")[0]} asked me to lead with the non-negotiables.`,
      `${subject} ${be} ${member.profile.age}, in ${member.profile.city}, and ${work} as ${article(job)} ${job}.`,
      this.intentSentence(member),
      this.smokingSentence(member),
      this.kidsSentence(member),
      interests ? `Notes on file: ${interests}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  composeReply(from: Member, to: Member, variant: number): string {
    const voice = from.profile.voice;
    const subject = cap(voice.subject);
    const they = voice.subject === "they";
    const share = they ? "share" : "shares";
    const does = they ? "do" : "does";
    const overlaps = from.profile.interests.filter((interest) => to.profile.interests.includes(interest));
    const first = to.displayName.split(" ")[0];
    const overlapLine = overlaps.length
      ? `${subject} ${share} ${overlaps.join(" and ")} with ${first}.`
      : `${subject} ${does} not have a shared interest on file, and that is not a problem.`;
    const prompts = [
      `The question worth carrying is what an ordinary Sunday looks like for ${to.profile.voice.object}.`,
      "The useful next detail is logistics: which evenings are actually free.",
      "A first meeting only makes sense if the non-negotiables still hold in a direct conversation.",
      `${subject} would rather a quiet table than a performance.`,
    ];
    const prompt = prompts[Math.abs(variant) % prompts.length] ?? prompts[0];
    return `This is ${from.displayName}'s matchmaker. ${subject} read the latest note. ${overlapLine} ${prompt}`;
  }

  suggestDate(viewer: Member, other: Member, now = new Date()): { local: string; place: string; note: string } {
    const shared = viewer.profile.interests.filter((interest) => other.profile.interests.includes(interest));
    let place = "Sightglass Coffee";
    let note = "An hour, somewhere quiet enough to talk.";
    if (shared.includes("cooking")) {
      place = "Tartine Manufactory";
      note = "A table, late morning, no agenda beyond an hour.";
    } else if (shared.includes("walking") || shared.includes("hiking")) {
      place = "Ferry Building";
      note = "Meet outside and walk if the weather is kind. An hour is enough.";
    }
    return { local: upcomingSaturdayLocal(now), place, note };
  }

  private intentSentence(member: Member): string {
    const subject = cap(member.profile.voice.subject);
    const be = member.profile.voice.subject === "they" ? "are" : "is";
    if (member.profile.intent === "serious") return `${subject} ${be} dating seriously.`;
    return `${subject} ${be} explicit about wanting something casual.`;
  }

  private smokingSentence(member: Member): string {
    const subject = cap(member.profile.voice.subject);
    const they = member.profile.voice.subject === "they";
    if (member.profile.smoking) return `${subject} ${they ? "smoke" : "smokes"}.`;
    return `${subject} ${they ? "do" : "does"} not smoke.`;
  }

  private kidsSentence(member: Member): string {
    const subject = cap(member.profile.voice.subject);
    const they = member.profile.voice.subject === "they";
    const be = they ? "are" : "is";
    const want = they ? "want" : "wants";
    const does = they ? "do" : "does";
    if (member.profile.kids === "open") return `${subject} ${be} open to kids.`;
    if (member.profile.kids === "wants") return `${subject} ${want} kids.`;
    return `${subject} ${does} not want kids.`;
  }
}

export const matchmaker = new MatchmakerBotService();
