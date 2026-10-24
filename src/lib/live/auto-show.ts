// Auto mode: deciding, word by word, when a heard reference is safe to put
// straight on screen.
//
// Live transcripts grow a word at a time, so "Romans eight twenty eight"
// passes through "Romans eight twenty" on the way. Showing 8:20 for a moment
// would be a wrong verse on the big screen. A reference fires the moment it
// can no longer grow, and waits briefly when its last word still might.

import { refKey, type BibleShape, type Detection, type VerseRef } from "@/lib/scripture/parser";

/** Only clear citations go up without a click. */
export const AUTO_MIN_CONFIDENCE = 0.85;

/** A reference auto-shown once is not brought back by auto mode for this long. */
export const AUTO_REPEAT_MS = 20_000;

/** How long to wait for the next word when a reference might still grow. */
export const HOLD_MS = 250;

/**
 * After "twenty", "thirty"… the rest of the number often comes after a
 * breath ("Luke chapter nine verse twenty… three"), sometimes in the next
 * stretch of transcript. A real service showed Luke 9:20 and 14:20 for a
 * moment that way; a second covers the pause.
 */
export const HOLD_NUMBER_MS = 1000;
const TENS = new Set(["twenty", "thirty", "forty", "fourty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred"]);

const lastWord = (text: string, d: Detection) => (text.slice(d.start, d.end).toLowerCase().match(/[a-z]+|\d+|[-,]/g) ?? []).pop() ?? "";

/** How long to hold a reference that readiness() said might still grow. */
export function holdMs(text: string, d: Detection): number {
  return TENS.has(lastWord(text, d)) && !text.slice(d.end).trim() ? HOLD_NUMBER_MS : HOLD_MS;
}

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
  const after = text.slice(d.end).trim();
  // A stretch that ended on "twenty": the next stretch may finish the number
  // (it carries these words over), so even a final waits for it briefly.
  if (final) return !after && TENS.has(lastWord(text, d)) ? "hold" : "now";

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

// ---------------------------------------------------------------------------
// The decision itself, kept out of the console so it can be tested on the
// sequences of partial transcripts a real service produces.

/** What the console has on the screen now, if anything. */
export interface OnScreen {
  key: string;
  ref: VerseRef;
}

export interface AutoShowOptions {
  /** What is on screen now, as the console knows it (by any route). */
  current: () => OnScreen | null;
  /** Put a heard reference on the screen. `heardAt` is performance.now() when the words arrived. */
  show: (d: Detection, lagMs: number, heardAt: number) => void;
  now?: () => number;
}

/**
 * Takes every detection as it is heard and decides which go to the screen
 * without a click: only clear citations, once they can no longer grow, not
 * what is already up, and not what the operator just cleared or stepped
 * past (unless the preacher widens it: "John 3:16" then "to 18").
 */
export class AutoShow {
  private hold: ReturnType<typeof setTimeout> | null = null;
  /** When each reference last went up by itself. */
  private recent = new Map<string, number>();
  private now: () => number;

  constructor(
    private bible: BibleShape,
    private opts: AutoShowOptions,
  ) {
    this.now = opts.now ?? Date.now;
  }

  /** The newest detections from one piece of transcript, partial or final. */
  heard(dets: Detection[], text: string, final: boolean, lagMs: number, heardAt: number): void {
    // Newer words replace any reference we were waiting on.
    this.cancel();
    const candidates = dets.filter(eligible);
    const d = candidates[candidates.length - 1];
    if (!d) return;
    const r = readiness(text, d, this.bible, final);
    if (r === "now") this.fire(d, lagMs, heardAt);
    else if (r === "hold") this.hold = setTimeout(() => this.fire(d, lagMs, heardAt), holdMs(text, d));
  }

  /** Forgets a reference waiting on its next word (Auto switched off, the service ended). */
  cancel(): void {
    if (this.hold) clearTimeout(this.hold);
    this.hold = null;
  }

  private fire(d: Detection, lagMs: number, heardAt: number) {
    this.hold = null;
    const key = refKey(d.ref);
    const cur = this.opts.current();
    if (cur?.key === key) return;
    // "John 3:16" then "to 18": widen what is already up.
    const widens =
      !!cur &&
      cur.ref.book === d.ref.book &&
      cur.ref.chapter === d.ref.chapter &&
      cur.ref.verseStart === d.ref.verseStart &&
      (d.ref.verseEnd ?? 0) > (cur.ref.verseEnd ?? cur.ref.verseStart ?? 0);
    // Don't bring back something the operator just cleared or stepped past.
    const last = this.recent.get(key);
    if (!widens && last !== undefined && this.now() - last < AUTO_REPEAT_MS) return;
    this.recent.set(key, this.now());
    this.opts.show(d, lagMs, heardAt);
  }
}
