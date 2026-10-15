"use client";

import { useCallback, useEffect, useState } from "react";

// "Present on projector": open the output page filling the second monitor.
//
// What Chrome allows (2026): the Window Management API (asks the operator
// once) tells us where the other screen is, so the window opens sized to it.
// Going fullscreen in the same click is only allowed in some Chrome setups,
// so we ask for it two ways and the output page falls back to "click once to
// fill the screen". The kiosk shortcut in Settings is the guaranteed route.

export const PROJECTOR_WINDOW = "scripture-projector";
export const PRESENT_MESSAGE = "scripture-present-fullscreen";

interface ScreenInfo {
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
  isPrimary?: boolean;
}
interface ScreenDetails {
  screens: ScreenInfo[];
  currentScreen: ScreenInfo;
}

/** The screen that isn't the one the console is on, when there is one. */
async function otherScreen(): Promise<ScreenInfo | null> {
  const w = window as unknown as { getScreenDetails?: () => Promise<ScreenDetails> };
  if (!w.getScreenDetails) return null;
  try {
    const details = await w.getScreenDetails();
    return details.screens.find((s) => s !== details.currentScreen) ?? null;
  } catch {
    // Permission refused: open on this screen instead.
    return null;
  }
}

export type PresentResult = "opened" | "blocked";

// The projector window this console opened. Lost on a console reload: the
// window carries on showing the output, and Present picks it up again.
let projector: Window | null = null;

export const isProjectorOpen = () => !!projector && !projector.closed;

/** Closes the projector window. */
export function closeProjector() {
  projector?.close();
  projector = null;
}

/**
 * Whether the projector window is open, kept up to date (the operator may
 * close it themselves). Call the returned function after opening or closing
 * it to update at once.
 */
export function useProjectorOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(false);
  const sync = useCallback(() => setOpen(isProjectorOpen()), []);
  useEffect(() => {
    const t = setInterval(sync, 1000);
    return () => clearInterval(t);
  }, [sync]);
  return [open, sync];
}

/**
 * Opens (or reuses) the projector window. Must be called from a click.
 * Returns "blocked" when the browser stopped the popup, so the caller can ask
 * the operator to allow pop-ups.
 */
export async function presentOnProjector(outputUrl: string): Promise<PresentResult> {
  const screen = await otherScreen();
  const features = screen
    ? `popup,fullscreen,left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}`
    : "popup,fullscreen";
  const url = `${outputUrl}${outputUrl.includes("?") ? "&" : "?"}present=1`;
  const win = window.open(url, PROJECTOR_WINDOW, features);
  if (!win) return "blocked";
  projector = win;

  // Second way to get fullscreen: hand this click's permission to the new
  // window (Chrome's capability delegation), once it says it's ready.
  const onReady = (e: MessageEvent) => {
    if (e.source !== win || e.origin !== location.origin || e.data !== `${PRESENT_MESSAGE}:ready`) return;
    window.removeEventListener("message", onReady);
    try {
      win.postMessage(PRESENT_MESSAGE, { targetOrigin: location.origin, delegate: "fullscreen" } as WindowPostMessageOptions);
    } catch {
      win.postMessage(PRESENT_MESSAGE, location.origin);
    }
  };
  window.addEventListener("message", onReady);
  setTimeout(() => window.removeEventListener("message", onReady), 10_000);
  win.focus();
  return "opened";
}
