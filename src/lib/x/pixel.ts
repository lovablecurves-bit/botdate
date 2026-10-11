/** X Pixel (universal website tag). Loaded only when NEXT_PUBLIC_X_PIXEL_ID is set. */

export const X_PIXEL_SRC = "https://static.ads-twitter.com/uwt.js";
export const X_PIXEL_SCRIPT_ID = "x-pixel-base";
export const X_SIGN_IN_PIXEL_PARAM = "xp";
export const X_SIGN_IN_PIXEL_VALUE = "signed_in";
export const X_SIGN_UP_PIXEL_PARAM = "xu";
export const X_SIGN_UP_PIXEL_VALUE = "signed_up";

export const X_PIXEL_EVENT = {
  signed_up: "signed_up",
  signed_in_with_x: "signed_in_with_x",
} as const;

export type XPixelEvent = keyof typeof X_PIXEL_EVENT;

const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** Blank, missing, or unsafe ids are ignored so the tag cannot be injected. */
export function readXPixelId(raw: string | undefined): string | null {
  const id = raw?.trim() ?? "";
  return SAFE_ID.test(id) ? id : null;
}

export function readXPixelEventId(pixelRaw: string | undefined, eventRaw: string | undefined): string | null {
  if (!readXPixelId(pixelRaw)) return null;
  const id = eventRaw?.trim() ?? "";
  return SAFE_ID.test(id) ? id : null;
}

export function xPixelId(): string | null {
  return readXPixelId(process.env.NEXT_PUBLIC_X_PIXEL_ID);
}

export function xPixelEventId(event: XPixelEvent): string | null {
  const eventRaw = event === "signed_up" ? process.env.NEXT_PUBLIC_X_EVT_SIGNUP : process.env.NEXT_PUBLIC_X_EVT_SIGNIN;
  return readXPixelEventId(process.env.NEXT_PUBLIC_X_PIXEL_ID, eventRaw);
}

/** Official X Pixel base code, with the pixel id in twq('config', …). */
export function xPixelBaseSource(pixelId: string): string | null {
  if (!readXPixelId(pixelId)) return null;
  return `!function(e,t,n,s,u,a){e.twq||(s=e.twq=function(){s.exe?s.exe.apply(s,arguments):s.queue.push(arguments);
},s.version='1.1',s.queue=[],u=t.createElement(n),u.async=!0,u.src='${X_PIXEL_SRC}',
a=t.getElementsByTagName(n)[0],a.parentNode.insertBefore(u,a))}(window,document,'script');
twq('config','${pixelId}');`;
}

type PixelWindow = Window & { twq?: (...args: unknown[]) => void };

function view(): PixelWindow | null {
  if (typeof globalThis.window === "undefined") return null;
  return globalThis.window as PixelWindow;
}

/** Insert the base tag once. No-op when the pixel id is missing or the tag is already on the page. */
export function ensureXPixel(pixelId: string): void {
  const source = xPixelBaseSource(pixelId);
  const page = view();
  if (!source || !page || typeof document === "undefined") return;
  if (document.getElementById(X_PIXEL_SCRIPT_ID) || typeof page.twq === "function") return;
  const script = document.createElement("script");
  script.id = X_PIXEL_SCRIPT_ID;
  script.text = source;
  document.head.appendChild(script);
}

const STORAGE_PREFIX = "botdate-x-pixel";

/** Fire one conversion. No-op when the pixel id or that event's id is unset. */
export function fireXPixelEvent(event: XPixelEvent, dedupe: string): boolean {
  const pixelId = xPixelId();
  const eventId = xPixelEventId(event);
  const page = view();
  if (!pixelId || !eventId || !page) return false;
  const key = `${STORAGE_PREFIX}:${event}:${dedupe}`;
  try {
    if (page.sessionStorage.getItem(key) === "1") return false;
    page.sessionStorage.setItem(key, "1");
  } catch {
    // Private mode can block storage. Still send this one event.
  }
  ensureXPixel(pixelId);
  page.twq?.("event", eventId);
  return true;
}
