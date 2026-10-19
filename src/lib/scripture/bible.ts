import { BOOKS } from "./books";
import { formatRef, type BibleShape, type VerseRef } from "./parser";
import type { DisplayTheme } from "@/lib/display/theme";
import type { TranslationInfo } from "./translations";
import { decryptBible } from "./bible-crypto";

/** A whole translation, indexed [book][chapter - 1][verse - 1]. */
export interface Translation {
  id: string;
  name: string;
  books: string[][][];
  /** Shown next to the reference; the id in capitals when not set. */
  short?: string;
  /** Credit line the licence asks for, shown under the verse. */
  copyright?: string;
}

const shortOf = (t: Translation) => t.short ?? t.id.toUpperCase();

export interface Verse {
  book: number;
  chapter: number;
  verse: number;
  text: string;
}

export function shapeOf(t: Translation): BibleShape {
  return {
    chapters: (b) => t.books[b]?.length ?? 0,
    verses: (b, c) => t.books[b]?.[c - 1]?.length ?? 0,
  };
}

/** The verses a reference covers. A chapter-only reference opens at verse 1. */
export function versesFor(t: Translation, r: VerseRef): Verse[] {
  const chapter = t.books[r.book]?.[r.chapter - 1];
  if (!chapter) return [];
  const s = r.verseStart ?? 1;
  const e = Math.min(r.verseEnd ?? s, chapter.length);
  const out: Verse[] = [];
  for (let v = s; v <= e; v++) {
    // Modern translations leave out a few verses the KJV has (Acts 8:37,
    // John 5:4...). Say so rather than showing nothing.
    const text = chapter[v - 1] || `This verse is not included in the ${shortOf(t)}.`;
    out.push({ book: r.book, chapter: r.chapter, verse: v, text });
  }
  return out;
}

/** The verse after (step 1) or before (step -1) a verse, across chapter and book ends. */
export function stepVerse(t: Translation, book: number, chapter: number, verse: number, step: 1 | -1): VerseRef | null {
  let b = book, c = chapter, v = verse + step;
  if (v < 1) {
    c -= 1;
    if (c < 1) {
      b -= 1;
      if (b < 0) return null;
      c = t.books[b].length;
    }
    v = t.books[b][c - 1].length;
  } else if (v > t.books[b][c - 1].length) {
    c += 1;
    v = 1;
    if (c > t.books[b].length) {
      b += 1;
      c = 1;
      if (b >= t.books.length) return null;
    }
  }
  return { book: b, chapter: c, verseStart: v, verseEnd: v };
}

// ---------------------------------------------------------------------------
// Slides

export interface Slide {
  /** "John 3:16" or "John 3:16-18", with "(1/2)" when a verse spans slides. */
  label: string;
  /** Verse numbers and their text on this slide. */
  lines: { verse: number; text: string }[];
  translation: string;
  copyright?: string;
  /**
   * What it is; scripture when unset. "song": lyrics, lines as written.
   * "text": a text slide (announcement), lines as written. "image" and
   * "video": a picture or video slide, `image` filling the screen.
   */
  kind?: "song" | "text" | "image" | "video";
  /** Picture and video slides: the file (this app's own storage only). */
  image?: string;
  /** Picture slides with several pictures, side by side (the first is `image`). */
  images?: string[];
  /** How the output draws it; added by the console as it sends the slide. */
  theme?: DisplayTheme;
}

/** Roughly what stays readable at projector size on a 16:9 screen. */
export const SLIDE_CHARS = 280;

// Breaks a long verse into pieces at the best punctuation near the limit.
function splitText(text: string, max: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = -1;
    for (const re of [/[.;:?!]\s/g, /,\s/g, /\s/g]) {
      let m: RegExpExecArray | null;
      let best = -1;
      while ((m = re.exec(window))) if (m.index > max * 0.4) best = m.index + 1;
      if (best > 0) {
        cut = best;
        break;
      }
    }
    if (cut < 0) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Lays a selection out as slides: short verses share a slide, a long verse
 * gets several. Each slide names exactly the verses it shows.
 */
export function buildSlides(t: Translation, r: VerseRef, max = SLIDE_CHARS): Slide[] {
  const verses = versesFor(t, r);
  const slides: Slide[] = [];
  let lines: { verse: number; text: string }[] = [];
  let len = 0;

  const label = (ls: { verse: number }[], part?: string) =>
    formatRef({ book: r.book, chapter: r.chapter, verseStart: ls[0].verse, verseEnd: ls[ls.length - 1].verse }) +
    (part ? ` (${part})` : "");

  const flush = () => {
    if (lines.length) slides.push({ label: label(lines), lines, translation: shortOf(t), copyright: t.copyright });
    lines = [];
    len = 0;
  };

  for (const v of verses) {
    if (v.text.length > max) {
      flush();
      const parts = splitText(v.text, max);
      parts.forEach((p, i) =>
        slides.push({
          label: label([v], `${i + 1}/${parts.length}`),
          lines: [{ verse: v.verse, text: p }],
          translation: shortOf(t),
          copyright: t.copyright,
        }),
      );
      continue;
    }
    if (len + v.text.length > max) flush();
    lines.push({ verse: v.verse, text: v.text });
    len += v.text.length;
  }
  flush();
  return slides;
}

export function bookName(b: number): string {
  return BOOKS[b]?.name ?? "";
}

// ---------------------------------------------------------------------------
// Loading, in the browser

const cache = new Map<string, Promise<Translation>>();

/**
 * Licensed Bibles used to come straight from a public bucket and were kept
 * here as plain text. Those copies go: the encrypted ones replace them.
 */
let forgotPlain = false;
async function forgetPlainLicensedCopies() {
  if (forgotPlain || typeof caches === "undefined") return;
  forgotPlain = true;
  try {
    const store = await caches.open(BIBLE_CACHE);
    for (const req of await store.keys()) if (req.url.includes("/storage/v1/object/public/bibles/")) await store.delete(req);
  } catch {}
}

/** The browser's offline store for Bibles. Same name as BIBLES in public/sw.js. */
export const BIBLE_CACHE = "scripture-bibles";

/**
 * The file from the network, kept in the offline store; or, when the network
 * fails, the stored copy. (Once the service worker runs, it answers from the
 * store first and this fetch never waits on the network.)
 */
async function fetchBible(url: string): Promise<Response> {
  const store = typeof caches === "undefined" ? null : await caches.open(BIBLE_CACHE).catch(() => null);
  try {
    const res = await fetch(url);
    if (res.ok && store) void store.put(url, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const hit = await store?.match(url);
    if (hit) return hit;
    throw e;
  }
}

/**
 * Fetches a translation once per page load, and keeps it for offline use.
 * Its name and credit line come from the list, so editing them on the admin site
 * doesn't need a new upload.
 */
export function loadTranslation(info: TranslationInfo): Promise<Translation> {
  let p = cache.get(info.url);
  if (!p) {
    void forgetPlainLicensedCopies();
    p = fetchBible(info.url)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Could not load ${info.id}`);
        // Licensed text arrives (and is kept offline) encrypted for this church.
        if (info.encrypted) return JSON.parse(await decryptBible(await r.arrayBuffer())) as Translation;
        return r.json() as Promise<Translation>;
      })
      .then((t) => ({ ...t, id: info.id, short: info.short, copyright: info.copyright }));
    p.catch(() => cache.delete(info.url));
    cache.set(info.url, p);
  }
  return p;
}
