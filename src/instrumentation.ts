export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootPersistence } = await import("./lib/db/boot");
    await bootPersistence();
  }
}
