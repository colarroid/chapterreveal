"use client";

import { useEffect } from "react";

/**
 * Starts the offline worker (public/sw.js) so scripture keeps working through
 * network drops. Production only: in development the code changes on every
 * save, and a stored copy would hide the change.
 */
export function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

/** Signing out: the stored console pages hold the church's details. */
export function forgetOfflinePages() {
  navigator.serviceWorker?.controller?.postMessage("sign-out");
}

