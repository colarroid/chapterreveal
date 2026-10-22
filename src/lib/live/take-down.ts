// Taking a verse off the screen on its own, so John 3:16 doesn't sit on the
// projector for the next twenty minutes of the sermon.
//
// "When the preacher moves on": the verse stays up while it is being read
// (the words heard match the words on screen), and comes off a set time
// after the reading stops. Reading it again, or the next verse, starts the
// wait again. Silence counts as moving on. "After a set time" ignores the
// reading. Either way only the words go; the background stays (Esc).

import { phrasesOf } from "@/lib/scripture/verse-text";

export type TakeDownMode = "moves_on" | "time" | "manual";

export interface TakeDown {
  mode: TakeDownMode;
  /** How long after the reading (or the showing) the words come off. */
  seconds: number;
}

export const DEFAULT_TAKE_DOWN: TakeDown = { mode: "moves_on", seconds: 45 };
export const TAKE_DOWN_MIN = 10;
export const TAKE_DOWN_MAX = 600;

export const TAKE_DOWN_MODES: { value: TakeDownMode; label: string; hint: string }[] = [
  { value: "moves_on", label: "When the preacher moves on", hint: "Stays up while it's read" },
  { value: "time", label: "After a set time", hint: "From when it goes up" },
  { value: "manual", label: "Only when the operator clears it", hint: "Esc" },
];

/** The church's choice from its settings, with anything missing or odd set to the default. */
export function cleanTakeDown(settings: { take_down?: unknown; take_down_seconds?: unknown } | null | undefined): TakeDown {
  const mode = TAKE_DOWN_MODES.some((m) => m.value === settings?.take_down) ? (settings!.take_down as TakeDownMode) : DEFAULT_TAKE_DOWN.mode;
  const n = Number(settings?.take_down_seconds);
  const seconds = Number.isFinite(n) && n > 0 ? Math.round(Math.min(TAKE_DOWN_MAX, Math.max(TAKE_DOWN_MIN, n))) : DEFAULT_TAKE_DOWN.seconds;
  return { mode, seconds };
}

/** How many of the latest words are compared with the verse. */
const RECENT_WORDS = 30;
/**
 * Phrases in common before it counts as reading. One shared phrase can be
 * chance ("of the lord", "and he said"); two in the last few seconds of
 * speech is the verse being read.
 */
const READING_PHRASES = 2;

/** The verse's phrases, built once when it goes up. */
export const versePhrases = (lines: { text: string }[]): Set<number> => new Set(phrasesOf(lines.map((l) => l.text).join(" ")));

/** Whether the latest words heard are the verse on screen being read. */
export function isReading(verse: Set<number>, heard: string): boolean {
  if (!verse.size) return false;
  const recent = heard.trim().split(/\s+/).slice(-RECENT_WORDS).join(" ");
  let shared = 0;
  for (const p of new Set(phrasesOf(recent))) if (verse.has(p) && ++shared >= READING_PHRASES) return true;
  return false;
}
