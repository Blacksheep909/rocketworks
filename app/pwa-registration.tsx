"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

/**
 * Registers the optional browser shell without adding an offline cache. The
 * service worker is deliberately a network pass-through until cached physics
 * assets and update semantics have independent validation.
 */
export function PwaRegistration() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandaloneDisplayMode);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Installation is an enhancement; a failed registration must not block the workbench.
      });
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const requestInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      // The browser owns this prompt; a cancelled or unsupported prompt must not surface as an app error.
    } finally {
      setInstallPrompt(null);
    }
  };

  if (installed || dismissed || !installPrompt) return null;

  return (
    <aside className="pwa-install-card" role="region" aria-labelledby="pwa-install-title">
      <div className="pwa-install-copy">
        <span className="pwa-install-kicker">DESKTOP HANDOFF</span>
        <h2 id="pwa-install-title">Install RocketWorks</h2>
        <p>Open the workbench in its own window for a focused mission-console workflow.</p>
      </div>
      <div className="pwa-install-actions">
        <button className="quiet-button" type="button" onClick={() => setDismissed(true)}>Not now</button>
        <button className="primary-button" type="button" onClick={() => { void requestInstall(); }}>Install app</button>
      </div>
    </aside>
  );
}
