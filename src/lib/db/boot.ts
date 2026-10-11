import { logColdStartNote } from "../x/config";
import { migrateLibsqlIfConfigured } from "./open";

/** Apply the libSQL schema when Turso is configured. A rejected token is logged and does not stop the server. */
export async function bootPersistence(): Promise<void> {
  logColdStartNote();
  try {
    await migrateLibsqlIfConfigured();
  } catch {
    // migrateLibsqlIfConfigured records the failure. The next request opens the in-memory database.
  }
}
