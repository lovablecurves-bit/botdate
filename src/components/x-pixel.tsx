"use client";

import { useEffect } from "react";
import {
  X_SIGN_IN_PIXEL_PARAM,
  X_SIGN_IN_PIXEL_VALUE,
  X_SIGN_UP_PIXEL_PARAM,
  X_SIGN_UP_PIXEL_VALUE,
  ensureXPixel,
  fireXPixelEvent,
  xPixelId,
  type XPixelEvent,
} from "@/lib/x/pixel";

/** Base tag. Renders nothing, and does not load X, when NEXT_PUBLIC_X_PIXEL_ID is unset. */
export function XPixel() {
  useEffect(() => {
    const pixelId = xPixelId();
    if (pixelId) ensureXPixel(pixelId);
  }, []);
  return null;
}

/** One conversion, once per dedupe key for this tab. No-op when that event id is unset. */
export function XPixelConversion({ event, dedupe }: { event: XPixelEvent; dedupe: string }) {
  useEffect(() => {
    fireXPixelEvent(event, dedupe);
  }, [event, dedupe]);
  return null;
}

/** signed_in_with_x after every X callback, and signed_up only when that callback created the account. */
export function XPixelSignIn() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    if (params.get(X_SIGN_UP_PIXEL_PARAM) === X_SIGN_UP_PIXEL_VALUE) {
      fireXPixelEvent("signed_up", X_SIGN_UP_PIXEL_VALUE);
      params.delete(X_SIGN_UP_PIXEL_PARAM);
      changed = true;
    }
    if (params.get(X_SIGN_IN_PIXEL_PARAM) === X_SIGN_IN_PIXEL_VALUE) {
      fireXPixelEvent("signed_in_with_x", X_SIGN_IN_PIXEL_VALUE);
      params.delete(X_SIGN_IN_PIXEL_PARAM);
      changed = true;
    }
    if (!changed) return;
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);
  }, []);
  return null;
}
