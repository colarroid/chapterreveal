"use client";

import { RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isListening } from "./(consoles)/dashboard/use-live-service";

// After a deploy, a tab that's already open keeps running the code it loaded
// (moving between consoles and settings never downloads new code). This
// checks /api/version every few minutes and when the tab comes back into
// view, and offers a reload. It never reloads by itself, and waits while a
// service is live so nothing is cut off mid-sermon.

const LOADED = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const CHECK_MS = 5 * 60_000;

export function UpdateNotice() {
  const [newer, setNewer] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (LOADED === "dev") return;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { build } = (await res.json()) as { build?: string };
        if (!stopped && build && build !== "dev" && build !== LOADED) setNewer(build);
      } catch {
        // Offline or a blip: try again next time.
      }
    };
    void check();
    const timer = setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  // While a service is live the notice waits; look again every half minute.
  const waiting = !!newer && isListening();
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [waiting]);

  if (!newer || newer === dismissed || waiting) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-3 rounded-full bg-ink py-2 pr-2 pl-5 text-sm text-bg shadow-pop">
        <span>ReedArk has been updated. Reload to get the latest.</span>
        <button
          type="button"
          onClick={() => location.reload()}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-fill px-3.5 font-bold text-on-accent transition hover:brightness-105"
        >
          <RefreshCw size={14} /> Reload
        </button>
        <button type="button" onClick={() => setDismissed(newer)} aria-label="Not now" className="grid h-8 w-8 place-items-center rounded-full text-bg/70 hover:text-bg">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
