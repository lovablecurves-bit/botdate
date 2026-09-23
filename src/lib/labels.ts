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

export function truncate(text: string, max = 140): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
