import type { CSSProperties } from "react";

// The public pages' background, after terms.so: a gradient painted at a fixed
// height behind the top of the page (not stretched to fit the content), in
// many small eased steps. It stays deep and dark through the headline, only
// gathers pace past the middle, peaks in ReedArk green at 74% (where the
// first cards rise out of it), then fades quickly into the page.

const DARK = [2, 24, 10]; // ReedArk green, almost black.
const GREEN = [30, 215, 96]; // #1ed760
const PEAK = 74;

const rgb = (t: number) => `rgb(${DARK.map((d, i) => Math.round(d + (GREEN[i] - d) * t)).join(", ")})`;
const at = (n: number) => `${n.toFixed(2)}%`;

// Dark to green: an ease-in (t³), so the top half barely changes.
const RISE = Array.from({ length: 24 }, (_, i) => {
  const t = i / 23;
  return `${rgb(t ** 3)} ${at(t * PEAK)}`;
});
// Green to the page: an ease-out, mixed with the page colour so it fades into
// white in light mode and into the dark page in dark mode.
const FADE = Array.from({ length: 8 }, (_, i) => {
  const t = (i + 1) / 8;
  const page = 1 - (1 - t) ** 2.5;
  return `color-mix(in srgb, var(--bg) ${(page * 100).toFixed(1)}%, #1ed760) ${at(PEAK + t * (100 - PEAK))}`;
});

export const HERO_GRADIENT = `linear-gradient(180deg, ${[...RISE, ...FADE].join(", ")})`;

/**
 * The style for a public page's outer element. The gradient's height comes
 * from the --hero-h custom property, set per page and breakpoint with classes
 * like "[--hero-h:900px] sm:[--hero-h:840px]", so each page puts the green
 * peak just under its own headline.
 */
export const heroBackground: CSSProperties = {
  backgroundColor: "var(--bg)",
  backgroundImage: HERO_GRADIENT,
  backgroundSize: "100% var(--hero-h, 840px)",
  backgroundRepeat: "no-repeat",
};
