const PACIFIC = "America/Los_Angeles";

function partsOf(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const raw = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  let hour = raw.hour ?? "00";
  if (hour === "24") hour = "00";
  return {
    year: raw.year ?? "1970",
    month: raw.month ?? "01",
    day: raw.day ?? "01",
    weekday: raw.weekday ?? "Mon",
    hour,
    minute: raw.minute ?? "00",
  };
}

/** Convert a Pacific wall-clock `YYYY-MM-DDTHH:mm` into a UTC ISO string. */
export function pacificLocalToIso(local: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    throw new Error("Use a date and time.");
  }
  const desired = Date.parse(`${local}:00Z`);
  let utc = desired;
  for (let i = 0; i < 4; i += 1) {
    const shownParts = partsOf(new Date(utc), PACIFIC);
    const shown = Date.parse(
      `${shownParts.year}-${shownParts.month}-${shownParts.day}T${shownParts.hour}:${shownParts.minute}:00Z`,
    );
    const delta = desired - shown;
    if (delta === 0) break;
    utc += delta;
  }
  return new Date(utc).toISOString();
}

/** Pacific wall-clock `YYYY-MM-DDTHH:mm` for a stored UTC instant. */
export function isoToPacificLocal(iso: string): string {
  const parts = partsOf(new Date(iso), PACIFIC);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function formatPacific(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function upcomingSaturdayLocal(now = new Date()): string {
  const parts = partsOf(now, PACIFIC);
  const order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = order.indexOf(parts.weekday);
  const from = day === -1 ? 0 : day;
  let add = (6 - from + 7) % 7;
  if (add === 0) add = 7;
  const stamp = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  stamp.setUTCDate(stamp.getUTCDate() + add);
  const y = stamp.getUTCFullYear();
  const m = String(stamp.getUTCMonth() + 1).padStart(2, "0");
  const d = String(stamp.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}T11:00`;
}

export function isFutureIso(iso: string, now = new Date()): boolean {
  return new Date(iso).getTime() > now.getTime() + 60_000;
}
