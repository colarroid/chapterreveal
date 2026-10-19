"use client";

import { createContext, useContext } from "react";

// The three consoles (Scriptures, Song Lyrics, Slides) stay mounted once
// opened, and only one shows at a time (workspace.tsx). A hidden console
// keeps everything it had open but must not act: no keyboard shortcuts, no
// listening, no buttons in the header.

export const ConsoleActive = createContext(true);

/** Whether this console is the one on screen. */
export const useConsoleActive = () => useContext(ConsoleActive);

/** The console pages, by path. */
export const CONSOLE_PATHS = ["/dashboard", "/songs", "/slides"] as const;
export type ConsolePath = (typeof CONSOLE_PATHS)[number];
export const isConsolePath = (p: string): p is ConsolePath => (CONSOLE_PATHS as readonly string[]).includes(p);
