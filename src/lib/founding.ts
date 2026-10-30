/** First 1,000 real X members, ordered by sign-up time, stay free. */
export const FOUNDING_MEMBER_LIMIT = 1000;

/** Marketing line on the sign-in screen, /join, and share metadata. */
export const FOUNDING_PITCH = "Free for the first 1,000 members";

/**
 * Public status under the pitch. Number-free on purpose: the live member
 * count and spots left stay on the server and never go on the site.
 */
export const FOUNDING_SPOTS_LINE = "Founding spots are filling";

/**
 * Permanent. Member numbers are assigned once, in sign-up order, and are not reused.
 * A number from 1 through 1,000 is founding status for good, even if a subscription later lapses.
 * This does not read the founder flag. That flag is the owner (member #1) only.
 */
export function isFoundingMember(member: { memberNumber: number | null }): boolean {
  const number = member.memberNumber;
  return typeof number === "number" && Number.isInteger(number) && number >= 1 && number <= FOUNDING_MEMBER_LIMIT;
}

/**
 * Spots left from a real member count. Internal only: pricing uses member
 * numbers, and public pages must not render this number.
 * Refuses a missing or negative count so a caller cannot substitute a full 1,000.
 */
export function foundingSpotsLeft(realMemberCount: number): number {
  if (!Number.isInteger(realMemberCount) || realMemberCount < 0) {
    throw new Error("Founding spots need a real member count.");
  }
  return Math.max(0, FOUNDING_MEMBER_LIMIT - realMemberCount);
}
