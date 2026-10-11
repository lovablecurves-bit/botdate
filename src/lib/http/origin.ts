export function appOrigin(headerStore: { get(name: string): string | null }): string {
  const proto = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const host = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim() || headerStore.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}
