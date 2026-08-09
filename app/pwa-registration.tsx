"use client";

import { useEffect } from "react";

/**
 * Registers the optional browser shell without adding an offline cache. The
 * service worker is deliberately a network pass-through until cached physics
 * assets and update semantics have independent validation.
 */
export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Installation is an enhancement; a failed registration must not block the workbench.
    });
  }, []);
  return null;
}
