"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

// The one thing worth telling the operator about the connection: that it's
// gone. Same pill as the update notice. The service record keeps saving to
// this computer meanwhile (lib/live/outbox.ts) and goes up when it's back,
// so there's nothing to do but know. A short drop doesn't flash it.

const SHOW_AFTER_MS = 3000;
const BACK_FOR_MS = 4000;

export function OfflineNotice() {
  const [state, setState] = useState<"online" | "offline" | "back">("online");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let shown = false;
    const offline = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        shown = true;
        setState("offline");
      }, SHOW_AFTER_MS);
    };
    const online = () => {
      clearTimeout(timer);
      if (!shown) return;
      shown = false;
      setState("back");
      timer = setTimeout(() => setState("online"), BACK_FOR_MS);
    };
    if (!navigator.onLine) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);

  if (state === "online") return null;
  const back = state === "back";
  return (
    <div role="status" className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="flex items-center gap-2.5 rounded-full bg-ink py-2 pr-5 pl-3 text-sm text-bg shadow-pop">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${back ? "bg-accent-fill text-on-accent" : "bg-bg/15"}`}>
          {back ? <Wifi size={15} /> : <WifiOff size={15} />}
        </span>
        <span>
          {back
            ? "Back online."
            : "You're offline. Listening pauses; search still works from the saved Bible. Everything saves when you're back."}
        </span>
      </div>
    </div>
  );
}
