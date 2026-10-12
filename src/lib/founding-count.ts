import { withDb } from "./db/open";
import { foundingSpotsLeft } from "./founding";
import { countRealMembers } from "./x/account";

/**
 * Spots left from the live member count. Null when the database cannot be read,
 * so the page omits the line instead of showing a made-up 1,000.
 */
export async function loadFoundingSpotsLeft(): Promise<number | null> {
  try {
    const count = await withDb((db) => countRealMembers(db));
    return foundingSpotsLeft(count);
  } catch (error) {
    console.error("Could not count founding spots.", error);
    return null;
  }
}
