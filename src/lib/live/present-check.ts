import { confirmDialog } from "@/components/confirm";
import type { ScreenSender } from "./screen";

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

/**
 * Before going live: when another computer (or browser tab) has something on
 * the screen, asks whether to project from here instead. Resolves true to go
 * ahead. Nothing on screen, or only a stale leftover: true without asking, so
 * a laptop that died never holds anyone up.
 */
export function mayProjectHere(sender: ScreenSender | null | undefined): Promise<boolean> {
  const other = sender?.otherOnScreen();
  if (!other) return Promise.resolve(true);
  const what =
    other.kind === "song" ? "Song lyrics are" : other.kind === "image" || other.kind === "video" || other.kind === "text" ? "A slide is" : `${other.label} is`;
  return confirmDialog({
    title: "Another computer is projecting",
    body: `${what} on the screen from another computer or browser tab. Project from here instead? It stops projecting there.`,
    confirmLabel: "Project from here",
    cancelLabel: "Cancel",
  });
}
