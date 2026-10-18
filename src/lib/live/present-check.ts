import { confirmDialog } from "@/components/confirm";

/**
 * Before Present while Live is off: the projector would open blank, which
 * looks like a fault. Resolves true to go live first, false to present blank.
 */
export function askToGoLive(what: "verses" | "lyrics" | "slides"): Promise<boolean> {
  return confirmDialog({
    title: "You're not live",
    body: `The projector will open with a blank screen. Selected ${what} only show on it once you go live (the Live switch, or press L).`,
    confirmLabel: "Go live and present",
    cancelLabel: "Present blank",
  });
}
