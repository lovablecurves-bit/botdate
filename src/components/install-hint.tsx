"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { INSTALL_DISMISS_KEY, INSTALL_HINT, installHintPlatform, type InstallPlatform } from "@/lib/pwa";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function standaloneNow(): boolean {
  const media = window.matchMedia("(display-mode: standalone)").matches;
  const ios = "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return media || ios;
}

export function InstallHint() {
  const pathname = usePathname();
  const [platform, setPlatform] = useState<InstallPlatform | null>(null);
  const [raised, setRaised] = useState(false);
  const [promptEvent, setPromptEvent] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === "1";
    } catch {
      dismissed = false;
    }
    const next = installHintPlatform({
      userAgent: navigator.userAgent,
      standalone: standaloneNow(),
      dismissed,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    });
    setPlatform(next);
    if (next !== "android") return;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    setRaised(Boolean(document.querySelector(".tabbar")));
  }, [pathname, platform]);

  if (!platform) return null;

  function dismiss() {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    } catch {
      // Private mode can block storage. Hiding for this visit is enough.
    }
    setPlatform(null);
  }

  async function add() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === "accepted") dismiss();
  }

  const how =
    platform === "ios"
      ? "In Safari, tap Share, then Add to Home Screen."
      : "Open the browser menu, then Add to Home Screen.";

  return (
    <aside className={raised ? "install-hint raised" : "install-hint"} data-testid="install-hint" data-platform={platform}>
      <div>
        <strong>{INSTALL_HINT}</strong>
        <p>{how}</p>
      </div>
      {platform === "android" && promptEvent ? (
        <button type="button" className="btn primary" data-testid="install-add" onClick={() => void add()}>
          Add
        </button>
      ) : null}
      <button type="button" className="btn ghost" data-testid="dismiss-install-hint" onClick={dismiss}>
        Not now
      </button>
    </aside>
  );
}
