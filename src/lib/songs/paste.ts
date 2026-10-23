// Makes sense of lyrics pasted from Google or a lyrics site: drops the site
// furniture ("Embed", "You might also like", credits), turns headings like
// "[Chorus]", "Verse 1:" or "(Bridge)" into labels, removes "x2" and
// "repeat" marks, brings back a chorus that was only named ("Chorus"), and
// splits each part into slides of a few lines.

import type { SongSlide } from "./songs";

export interface PastedSong {
  title?: string;
  author?: string;
  slides: SongSlide[];
  /** Lines dropped as site text or credits, so the operator can see what went. */
  dropped: number;
}

const JUNK = [
  /^\d*\s*contributors?\b/i,
  /^\d*\s*embed$/i,
  /^you might also like$/i,
  /^see .+ live$/i,
  /^get tickets/i,
  /^translations?$/i,
  /^read more$/i,
  /^report a problem$/i,
  /^share$/i,
  /^source:/i,
  /^songwriters?:/i,
  /^lyrics? (?:provided|licensed|powered) by/i,
  /^.*\bmusixmatch\b.*$/i,
  /^.*\blyricfind\b.*$/i,
  /^album:/i,
  /^released?:/i,
  /^genre:/i,
  /^\d+ (?:views|likes)$/i,
  /^(?:copy|print|download) lyrics$/i,
  /^more lyrics/i,
];

const SECTION: [RegExp, string][] = [
  [/^(?:verse|v)\s*(\d+)?$/i, "Verse"],
  [/^(?:chorus|refrain|hook|ch)$/i, "Chorus"],
  [/^(?:pre[-\s]?chorus|pre)$/i, "Pre-chorus"],
  [/^bridge$/i, "Bridge"],
  [/^(?:tag|vamp|interlude|instrumental)$/i, "Tag"],
  [/^intro$/i, "Intro"],
  [/^(?:outro|ending|end|coda)$/i, "Ending"],
];

// "[Chorus: Artist]", "Verse 2:", "(Bridge)", "CHORUS x2", "Repeat chorus"
function heading(line: string): { label: string; repeatOf?: string } | null {
  let t = line.trim();
  const repeat = /^repeat\s+/i.test(t) || /\brepeat\)?\s*$/i.test(t);
  t = t
    .replace(/^repeat\s+/i, "")
    .replace(/^[[(]\s*|\s*[\])]$/g, "")
    .replace(/\s*[:\-–]\s*.*$/, (m) => (/^\s*[:\-–]\s*\d+\s*$/.test(m) ? m : "")) // drop ": Artist"
    .replace(/[:\-–]\s*$/, "")
    .replace(/\s*\(?\s*(?:x|×)\s*\d+\s*\)?$/i, "")
    .replace(/\s*\(?repeat\)?$/i, "")
    .trim();
  if (t.length > 24) return null;
  for (const [re, name] of SECTION) {
    const m = t.match(re);
    if (m) {
      const label = name === "Verse" && m[1] ? `Verse ${m[1]}` : name;
      return repeat ? { label, repeatOf: label } : { label };
    }
  }
  return null;
}

// "(x2)", "x3", "[Repeat]" at the end of a lyric line.
export const cleanLyric = (l: string) =>
  l
    .replace(/\s*[[(]?\s*(?:x|×)\s*\d+\s*[\])]?\s*$/i, "")
    .replace(/\s*[[(]\s*repeat\s*[\])]\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

/** Splits a part's lines into slides of `perSlide` lines, never leaving one line alone at the end. */
export function chunk(lines: string[], perSlide: number): string[][] {
  if (lines.length <= perSlide) return [lines];
  const out: string[][] = [];
  for (let i = 0; i < lines.length; i += perSlide) out.push(lines.slice(i, i + perSlide));
  const last = out[out.length - 1];
  if (last.length === 1 && out.length > 1) out[out.length - 2].push(...out.pop()!);
  return out;
}

export function parsePastedLyrics(raw: string, perSlide = 2): PastedSong {
  const lines = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[​-‍﻿]/g, "")
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.trim());

  let title: string | undefined;
  let author: string | undefined;
  let dropped = 0;

  // A title line from lyrics sites: "Song Name Lyrics" or "Artist - Song Name Lyrics".
  // Site text like "12 Contributors" can come before it.
  const firstIdx = lines.findIndex((l) => l && !JUNK.some((re) => re.test(l)));
  if (firstIdx >= 0 && /\blyrics$/i.test(lines[firstIdx])) {
    const t = lines[firstIdx].replace(/\s*lyrics$/i, "").trim();
    const parts = t.split(/\s+[-–]\s+/);
    if (parts.length === 2) {
      author = parts[0];
      title = parts[1];
    } else title = t;
    lines[firstIdx] = "";
    dropped++;
  }

  // Parts: a heading starts one, and so does a blank line.
  const parts: { label?: string; lines: string[] }[] = [];
  let cur: { label?: string; lines: string[] } | null = null;
  const known = new Map<string, string[]>();
  for (const line of lines) {
    if (!line) {
      cur = null;
      continue;
    }
    const by = line.match(/^(?:written by|writers?|words and music by|composed by)\s*:?\s*(.+)$/i);
    if (by) {
      author ??= by[1].trim();
      dropped++;
      continue;
    }
    if (JUNK.some((re) => re.test(line))) {
      dropped++;
      continue;
    }
    const h = heading(line);
    if (h) {
      cur = { label: h.label, lines: [] };
      parts.push(cur);
      continue;
    }
    const lyric = cleanLyric(line);
    if (!lyric) continue;
    if (!cur) {
      cur = { lines: [] };
      parts.push(cur);
    }
    cur.lines.push(lyric);
  }

  // One unbroken block, no headings (many sites copy like that): find the
  // parts from what comes back.
  const unbroken = parts.length === 1 && !parts[0].label && parts[0].lines.length >= 10;

  // A heading with no lines under it means "sing that part again".
  const slides: SongSlide[] = [];
  for (const p of unbroken ? splitByRepeats(parts[0].lines) : parts) {
    let body = p.lines;
    if (p.label) {
      const base = p.label.replace(/\s+\d+$/, "");
      if (!body.length) body = known.get(p.label) ?? known.get(base) ?? [];
      else {
        known.set(p.label, body);
        known.set(base, known.get(base) ?? body);
      }
    }
    if (!body.length) continue;
    chunk(body, perSlide).forEach((ls, i) => {
      const text = ls.join("\n");
      // The label goes on the first slide of the part.
      slides.push(i === 0 && p.label ? { label: p.label, text } : { text });
    });
  }

  return { title, author, slides, dropped };
}


const sameLine = (l: string) =>
  l
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Lyrics pasted as one block, the chorus written out every time it's sung:
 * the longest run of lines (three or more) that comes back is the chorus,
 * and the song splits around it. Between choruses are verses; a short
 * repeat of the chorus's last lines is a tag; what follows the last chorus,
 * if it isn't that, is the ending. Each part then splits into slides on its
 * own, so a chorus is the same slides every time it comes.
 */
export function splitByRepeats(lines: string[]): { label?: string; lines: string[] }[] {
  const k = lines.map(sameLine);
  const n = k.length;
  // How often a run comes back, not overlapping itself.
  const times = (at: number, len: number) => {
    let c = 0;
    for (let p = 0; p + len <= n; ) {
      if (k.slice(p, p + len).every((x, i) => x === k[at + i])) {
        c++;
        p += len;
      } else p++;
    }
    return c;
  };
  let chorus = { at: -1, len: 0, times: 0 };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let len = 0;
      while (j + len < n && i + len < j && k[i + len] === k[j + len]) len++;
      if (len < 3 || len < chorus.len) continue;
      const c = times(i, len);
      if (len > chorus.len || c > chorus.times) chorus = { at: i, len, times: c };
    }
  }
  if (chorus.len < 3) return [{ lines }];
  const ck = k.slice(chorus.at, chorus.at + chorus.len);

  const out: { label?: string; lines: string[] }[] = [];
  let gap: string[] = [];
  let verse = 0;
  // The chorus's last lines sung again (two or more) at the start of a stretch: a tag.
  const tagLength = (g: string[]) => {
    for (let len = Math.min(g.length, ck.length - 1); len >= 2; len--) {
      if (g.slice(0, len).every((x, i) => x === ck[ck.length - len + i])) return len;
    }
    return 0;
  };
  const flush = (atEnd: boolean) => {
    if (!gap.length) return;
    const tag = tagLength(gap.map(sameLine));
    if (tag) out.push({ label: "Tag", lines: gap.slice(0, tag) });
    const rest = gap.slice(tag);
    if (rest.length) out.push({ label: atEnd && out.length ? "Ending" : `Verse ${++verse}`, lines: rest });
    gap = [];
  };
  for (let p = 0; p < n; ) {
    if (p + ck.length <= n && ck.every((x, i) => x === k[p + i])) {
      flush(false);
      out.push({ label: "Chorus", lines: lines.slice(p, p + ck.length) });
      p += ck.length;
    } else gap.push(lines[p++]);
  }
  flush(true);
  return out;
}
