"use client";

import { useEffect } from "react";

/**
 * While `active`, refreshing or closing the tab asks "Leave site?" first, so
 * a slip of the finger doesn't cut off an upload or a live service. Browsers
 * show their own wording; a page can't change it.
 */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older Chrome and Edge only ask when returnValue is set.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}
