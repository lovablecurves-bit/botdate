import { logColdStartNote } from "../x/config";
import { migrateLibsqlIfConfigured } from "./open";

/** Apply the libSQL schema when Turso is configured. Failures are logged so sign-in can still use the signed cookie. */
export async function bootPersistence(): Promise<void> {
  logColdStartNote();
  try {
    await migrateLibsqlIfConfigured();
  } catch (error) {
    console.error("libSQL schema migration did not finish.", error);
  }
}
