// Auto mode: deciding, word by word, when a heard reference is safe to put
// straight on screen.
//
// Live transcripts grow a word at a time, so "Romans eight twenty eight"
// passes through "Romans eight twenty" on the way. Showing 8:20 for a moment
// would be a wrong verse on the big screen. A reference fires the moment it
// can no longer grow, and waits briefly when its last word still might.

import type { BibleShape, Detection } from "@/lib/scripture/parser";

/** Only clear citations go up without a click. */
export const AUTO_MIN_CONFIDENCE = 0.85;

/** A reference auto-shown once is not brought back by auto mode for this long. */
export const AUTO_REPEAT_MS = 20_000;

/** How long to wait for the next word when a reference might still grow. */
export const HOLD_MS = 250;

// Words after which the number is probably not finished: "twenty" (eight),
// "one hundred" (and nineteen), "verses 16 to" (18).
const GROWING = new Set([
  "twenty", "thirty", "forty", "fourty", "fifty", "sixty", "seventy", "eighty", "ninety",
  "hundred", "and", "to", "through", "thru", "till", "until", "verse", "verses", "chapter", "-", ",",
]);
const UNITS = new Set(["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]);

export type Readiness = "now" | "hold" | "never";

/** Whether a detection may be shown without the operator. */
export function eligible(d: Detection): boolean {
  return d.ref.verseStart !== undefined && d.confidence >= AUTO_MIN_CONFIDENCE;
}

/**
 * "now" when the reference is complete, "hold" when its last word could
 * still be extended by the next one, "never" when it is not auto material.
 * `text` is the transcript the detection came from; `final` is true when the
 * transcriber will not add to it.
 */
export function readiness(text: string, d: Detection, bible: BibleShape, final: boolean): Readiness {
  if (!eligible(d)) return "never";
  if (final) return "now";

  const after = text.slice(d.end).trim();
  // Something else was said after it, so the reference stopped growing.
  // ("and", "to" or a comma right after it can still start a range or list.)
  if (after && !/^(?:(?:and|to|through|thru|till|until)\b|[-,–—])/i.test(after)) return "now";

  const words = text.slice(d.start, d.end).toLowerCase().match(/[a-z]+|\d+|[-,]/g) ?? [];
  const last = words[words.length - 1] ?? "";
  if (GROWING.has(last) || after) return "hold";

  // "verse one" might be "verse one hundred and five", but only where a
  // chapter has that many verses (Psalm 119).
  const v = d.ref.verseEnd ?? d.ref.verseStart!;
  if (UNITS.has(last) && v < 10 && bible.verses(d.ref.book, d.ref.chapter) >= 100) return "hold";

  // Digits from the transcriber ("3:16") arrive whole.
  return "now";
}
