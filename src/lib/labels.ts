import type { Intent, KidsStance } from "./types";

export function smokingLabel(smokes: boolean): string {
  return smokes ? "Smokes" : "Non-smoker";
}

export function kidsLabel(kids: KidsStance): string {
  if (kids === "wants") return "Wants kids";
  if (kids === "open") return "Open to kids";
  return "Doesn't want kids";
}

export function intentLabel(intent: Intent): string {
  return intent === "serious" ? "Serious" : "Casual";
}

export function titleWord(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Human-facing badge. Bot-to-bot chat is not shown; the bot stands in for the member. */
export function representedBy(displayName: string, self: boolean): string {
  if (self) return "Represented by your Grok bot";
  const first = displayName.split(" ")[0] || displayName;
  return `Represented by ${first}'s Grok bot`;
}

export function truncate(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
