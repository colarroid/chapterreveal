"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

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

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Whether the browser says it's online. True on the server. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/** The header's notice while the connection is down. */
export function OfflineChip({ scripture }: { scripture: boolean }) {
  const online = useOnline();
  if (online) return null;
  return (
    <span
      role="status"
      title={
        scripture
          ? "No internet connection. Typing and clicking references still works, and the projector on this computer still updates. Hearing the preacher resumes when the connection is back."
          : "No internet connection. What's already loaded still works, and the projector on this computer still updates. Hearing resumes when the connection is back."
      }
      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-warning/15 px-3 text-xs font-bold text-warning"
    >
      <WifiOff size={14} />
      <span className="hidden sm:inline">{scripture ? "Offline · scripture still available" : "Offline"}</span>
    </span>
  );
}
