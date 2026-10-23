// The order a song is sung in, as opposed to the order it's written in.
//
// Lyrics list each part once (Verse 1, Chorus, Verse 2, Bridge); a church
// sings them V1, Chorus, V2, Chorus, Bridge, Chorus, Chorus. A song's order
// is a list of its slide numbers (0-based), parts repeated where they come
// back. It's learned from what went on screen in a service, or arranged by
// hand, and a church's own order wins over the one most churches use.

/** Slide numbers, in the order they're sung. */
export type Order = number[];

export type OrderSource = "sung" | "arranged" | "common" | "written";

/** Shorter than this on screen, a slide was a slip or a correction, not part of the song. */
export const BRIEF_MS = 3000;

/** The written order: every slide once. */
export const writtenOrder = (slides: number): Order => Array.from({ length: slides }, (_, i) => i);

/** An order that still fits the song (it may have been edited since): slides that exist, at least one. */
export function cleanOrder(order: unknown, slides: number): Order | null {
  if (!Array.isArray(order)) return null;
  const out = order.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < slides);
  return out.length ? out.slice(0, 200) : null;
}

/** Whether an order is just the written one. */
export const isWritten = (order: Order, slides: number) => order.length === slides && order.every((n, i) => n === i);

/**
 * The order a song was sung in, from the slides that went on screen during
 * it (and when). Slides up only briefly are dropped, and a slide shown
 * twice in a row counts once. Null when there's too little to go on.
 */
export function learnOrder(path: { slide: number; at: number }[], endedAt: number): Order | null {
  const kept: number[] = [];
  path.forEach((p, i) => {
    const until = path[i + 1]?.at ?? endedAt;
    if (until - p.at < BRIEF_MS) return;
    if (kept[kept.length - 1] !== p.slide) kept.push(p.slide);
  });
  // A couple of slides isn't an order worth keeping.
  return new Set(kept).size >= 2 && kept.length >= 3 ? kept.slice(0, 200) : null;
}

/**
 * Where in the order a slide comes next, going on from `from` (the position
 * on screen now): the first place after it, else the first place at all.
 * -1 when the order doesn't have the slide.
 */
export function positionOf(order: Order, slide: number, from = -1): number {
  for (let p = from + 1; p < order.length; p++) if (order[p] === slide) return p;
  return order.indexOf(slide);
}
