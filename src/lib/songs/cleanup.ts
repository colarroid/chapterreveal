// Tidies a song that's already in slides (from VideoPsalm, or typed in):
//   - section words typed as lyric lines ("bridge", "Chorus:", "Verse 2")
//     become labels and start a new slide; a heading with nothing under it
//     ("Repeat chorus") brings that part back
//   - "x2", "(Repeat)" marks go
//   - slides crammed with lines are split into slides of two
// The sung words are never changed: spellings like "ekeleeeee" and echo
// lines in brackets stay as written. Slides of a sensible size keep the
// arrangement the church made.

import { chunk, cleanLyric, heading } from "./paste";
import type { SongSlide } from "./songs";

/** More lines than this on one slide is too many to read from the back. */
const MAX_LINES = 4;
/** Or this many characters, even in fewer lines. */
const MAX_CHARS = 180;
const PER_SLIDE = 2;

const REPEAT_ONLY = /^[[(]?\s*(?:x\s*\d+|\d+\s*x|repeat|rpt|2ce|twice|thrice)\s*[\])]?\.?$/i;

interface Block {
  label?: string;
  lines: string[];
}

export function cleanSlides(slides: SongSlide[]): SongSlide[] {
  // 1. Break slides at headings typed as lyrics, dropping repeat marks.
  const blocks: Block[] = [];
  for (const s of slides) {
    let cur: Block = { label: s.label, lines: [] };
    blocks.push(cur);
    for (const raw of s.text.split("\n")) {
      const line = raw.trim();
      if (!line || REPEAT_ONLY.test(line)) continue;
      const h = heading(line);
      if (h) {
        cur = { label: h.label, lines: [] };
        blocks.push(cur);
        continue;
      }
      const lyric = cleanLyric(line);
      if (lyric) cur.lines.push(lyric);
    }
  }

  // 2. A heading with no lines repeats that part; otherwise drop it.
  const known = new Map<string, string[]>();
  const out: SongSlide[] = [];
  for (const b of blocks) {
    let lines = b.lines;
    if (b.label) {
      const base = b.label.replace(/\s+\d+$/, "");
      if (!lines.length) lines = known.get(b.label) ?? known.get(base) ?? [];
      else if (!known.has(b.label)) {
        known.set(b.label, lines);
        if (!known.has(base)) known.set(base, lines);
      }
    }
    if (!lines.length) continue;

    // 3. Split only slides that are too full.
    const chars = lines.reduce((n, l) => n + l.length, 0);
    const pieces = lines.length > MAX_LINES || (lines.length > PER_SLIDE && chars > MAX_CHARS) ? chunk(lines, PER_SLIDE) : [lines];
    pieces.forEach((ls, i) => {
      const text = ls.join("\n");
      out.push(i === 0 && b.label ? { label: b.label, text } : { text });
    });
  }
  return out;
}

/** Whether cleaning changes anything. */
export function needsCleaning(slides: SongSlide[]): boolean {
  return JSON.stringify(cleanSlides(slides)) !== JSON.stringify(slides.map((s) => (s.label ? { label: s.label, text: s.text } : { text: s.text })));
}
