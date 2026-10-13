import { isAllowedMemberAge, isProfileComplete, MAX_MEMBER_AGE, MIN_MEMBER_AGE, type Member } from "../types";

/** One sentence the member pastes into Grok after sign-in. */
export function grokConnectMessage(mcpUrl: string): string {
  return `Be my BotDate matchmaker. Connect to ${mcpUrl}, then interview me and set up my profile.`;
}

/** Intimate answers stay in the bot's own chat. They are not profile fields. */
export const PRIVATE_INTIMATE =
  "Anything intimate stays private with the member's own bot and never goes on the profile. Do not write intimate details into bio, occupation, interests, niceToHaves, or any other profile field.";

/** What a fresh bot does when get_my_profile says the profile is not ready. */
export const INTERVIEW_DIRECTIVE =
  "Interview this member right away, one question at a time and briefly, in this order: age (18+) and city first; then their gender (man or woman) and who they're seeking (men, women, or either); then the age range and areas they'd date in; then what they want (Love, Casual, or Friends); then kids and smoking; last, nice-to-haves and dealbreakers. Save each answer with update_my_profile. Age is a whole number from 18 to 99. City is free text. Gender is man or woman. Seeking is men, women, or either. Age range is ageMin and ageMax. Areas they'd date in go in cities. What they want: Love is datingIntent serious, Casual is datingIntent casual, and Friends goes in niceToHaves. Kids is kidsStance wants, open, or doesnt, and the kids filter is kids wants, doesnt, or any. Smoking is smokes true or false, and the smoking filter is smoking no or any. Nice-to-haves go in niceToHaves. Set locked to true when dealbreakers are saved. Ask for up to 6 photos if supported. This server does not store photos. " +
  PRIVATE_INTIMATE +
  " Then call get_my_profile, confirm the profile is complete, and start screening matches. Only ping the human when a date is ready to offer. Keep profiles private.";

/** Returned on MCP initialize so a bot that just connected starts onboarding. */
export const MCP_SERVER_INSTRUCTIONS = `You are this member's BotDate matchmaker. Call get_my_profile first, before any other tool. If profileComplete is false, follow next_step immediately. ${INTERVIEW_DIRECTIVE}`;

const READY =
  "The profile is complete. Start screening matches. Only ping the human when a date is ready to offer. Keep profiles private. " + PRIVATE_INTIMATE;

const LOCK_DEALBREAKERS =
  "Save nice-to-haves and dealbreakers with update_my_profile and set locked to true. Then call get_my_profile, confirm the profile is complete, and start screening matches. Only ping the human when a date is ready to offer. Keep profiles private. " +
  PRIVATE_INTIMATE;

/** Fields the interview still has to collect before matching can start. */
export function missingOnboarding(member: Member): string[] {
  const missing: string[] = [];
  if (!isAllowedMemberAge(member.profile.age)) missing.push("age (18+)");
  if (typeof member.profile.city !== "string" || member.profile.city.trim().length < 2) missing.push("city or location");
  if (member.profile.gender !== "man" && member.profile.gender !== "woman") missing.push("gender (man or woman)");
  if (member.prefs.seeking !== "men" && member.prefs.seeking !== "women" && member.prefs.seeking !== "either") {
    missing.push("who they're seeking (men, women, or either)");
  }
  const { ageMin, ageMax } = member.prefs;
  const ageRange =
    typeof ageMin === "number" &&
    Number.isInteger(ageMin) &&
    typeof ageMax === "number" &&
    Number.isInteger(ageMax) &&
    ageMin >= MIN_MEMBER_AGE &&
    ageMax <= MAX_MEMBER_AGE &&
    ageMin <= ageMax;
  if (!ageRange) missing.push("preferred age range");
  if (!Array.isArray(member.prefs.cities) || member.prefs.cities.length === 0) missing.push("areas they'd date in");
  if (!member.prefs.locked) missing.push("nice-to-haves and dealbreakers (set locked true)");
  return missing;
}

/**
 * profileComplete means the member can be screened: required fields are set and dealbreakers are locked.
 * next_step is the bot's next action. Incomplete profiles get the interview. A finished profile starts screening.
 */
export function onboardingGuidance(member: Member): { profileComplete: boolean; next_step: string } {
  const fieldsReady = isProfileComplete(member);
  if (fieldsReady && member.prefs.locked) return { profileComplete: true, next_step: READY };
  if (fieldsReady) return { profileComplete: false, next_step: LOCK_DEALBREAKERS };
  const missing = missingOnboarding(member);
  const tail = missing.length > 0 ? ` Still missing: ${missing.join(", ")}.` : "";
  return { profileComplete: false, next_step: `${INTERVIEW_DIRECTIVE}${tail}` };
}
