/** Browser chrome and the installed app's theme. */
export const PWA_THEME = "#E8173A";

/** Splash and icon field. Matches the page background. */
export const PWA_BACKGROUND = "#fff0f8";

export const INSTALL_HINT = "Add BotDate to your Home Screen";

export const INSTALL_DISMISS_KEY = "botdate-install-dismissed";

export type InstallPlatform = "ios" | "android";

/**
 * Home-screen hint for iOS Safari and Android only.
 * Hidden once the app is already installed, or after the member dismisses it.
 * iOS Chrome and other iOS browsers cannot add a home-screen icon the Safari way, so they stay quiet.
 */
export function installHintPlatform(input: {
  userAgent: string;
  standalone: boolean;
  dismissed: boolean;
  platform?: string;
  maxTouchPoints?: number;
}): InstallPlatform | null {
  if (input.standalone || input.dismissed) return null;
  const ua = input.userAgent;
  if (/Android/i.test(ua)) return "android";
  const iOSDevice = /iPhone|iPad|iPod/i.test(ua);
  const iPadOs = input.platform === "MacIntel" && (input.maxTouchPoints ?? 0) > 1;
  if (!iOSDevice && !iPadOs) return null;
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return null;
  return "ios";
}
