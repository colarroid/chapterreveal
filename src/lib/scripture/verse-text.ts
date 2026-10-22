// Recognising scripture from its words, not its reference: a congregation
// reading Psalm 91 aloud, or a preacher quoting "the blood that speaketh
// better things than that of Abel" without saying where it is.
//
// Every verse is indexed by its word triples ("dwell in the", "in the secret",
// "the secret place"), like the song matcher, but packed into one sorted
// array of numbers: about 800,000 triples for a whole Bible in a few
// megabytes, which a media-desk PC can hold and search in a millisecond.
// Rare phrases count for more than common ones ("and the lord" is in
// hundreds of verses), and the passage on screen is preferred, so a reading
// is followed verse by verse.

import { words } from "@/lib/songs/matcher";
import type { Translation } from "./bible";

/** Verse ids fit in 15 bits (the Bible has 31,102 verses). */
const ID_SPACE = 32768;
/** Phrases found in more verses than this say nothing about which one. */
const TOO_COMMON = 300;

export interface VerseHit {
  book: number;
  chapter: number;
  verse: number;
  score: number;
  /** Matching phrases, not counting repeats. */
  phrases: number;
  /** Clearly this verse, and clearly not another one. */
  confident: boolean;
}

/** FNV-1a, 32-bit. Collisions only add a little noise to rare scores. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Declarations personalise scripture ("because I have set my love upon him"
// for "because he hath set his love upon me"), and people say "has" and
// "walks" where the KJV says "hath" and "walketh". Both sides are read with
// every pronoun the same and old verb endings smoothed, so the wording
// still lines up.
const PRONOUNS = new Set([
  "i", "me", "my", "mine", "myself", "he", "him", "his", "himself", "she", "her", "hers",
  "you", "your", "yours", "yourself", "thou", "thee", "thy", "thine", "ye", "we", "us", "our", "ours", "they", "them", "their",
]);
const OLD_FORMS: Record<string, string> = { hath: "has", hast: "has", doth: "does", dost: "does", shalt: "shall", wilt: "will", art: "are", saith: "says" };

function norm(w: string): string {
  if (PRONOUNS.has(w)) return "~";
  const old = OLD_FORMS[w];
  if (old) return norm(old);
  if (w.length > 5 && w.endsWith("eth")) return w.slice(0, -3);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

const verseWords = (text: string) => words(text).map(norm);

const triples = (w: string[]) => {
  const out: number[] = [];
  for (let i = 0; i + 2 < w.length; i++) out.push(hash(`${w[i]} ${w[i + 1]} ${w[i + 2]}`));
  return out;
};

/** The phrases (word triples) in a text, read the same way as the index reads verses. */
export const phrasesOf = (text: string): number[] => triples(verseWords(text));

export class VerseTextIndex {
  /** Sorted: phrase hash * ID_SPACE + verse id. */
  private entries: Float64Array;
  /** Verse id -> book, chapter, verse (8 bits each). */
  private refs: Uint32Array;

  private constructor(entries: Float64Array, refs: Uint32Array) {
    this.entries = entries;
    this.refs = refs;
  }

  /**
   * Builds the index for one translation. Yields to the browser every so
   * often, so building never freezes the console.
   */
  static async build(t: Translation, yieldEvery = 2000): Promise<VerseTextIndex> {
    const refs: number[] = [];
    const parts: number[] = [];
    let since = 0;
    for (let b = 0; b < t.books.length; b++) {
      const chapters = t.books[b] ?? [];
      for (let c = 0; c < chapters.length; c++) {
        let carry: string[] = [];
        const verses = chapters[c] ?? [];
        for (let v = 0; v < verses.length; v++) {
          if (!verses[v] || refs.length >= ID_SPACE) continue;
          const id = refs.length;
          refs.push((b << 16) | ((c + 1) << 8) | (v + 1));
          const w = verseWords(verses[v]);
          // The last words of the verse before join this one's first, so a
          // phrase read across the two still counts for the new verse.
          for (const h of new Set(triples([...carry, ...w]))) parts.push(h * ID_SPACE + id);
          carry = w.slice(-2);
          if (++since >= yieldEvery) {
            since = 0;
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      }
    }
    const entries = Float64Array.from(parts).sort();
    return new VerseTextIndex(entries, Uint32Array.from(refs));
  }

  /** Index of the first entry at or after `x`. */
  private lowerBound(x: number): number {
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.entries[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private ref(id: number) {
    const r = this.refs[id];
    return { book: r >>> 16, chapter: (r >>> 8) & 0xff, verse: r & 0xff };
  }

  /**
   * The verse that best matches what was just said (the last ~24 words are
   * used). `near` is the passage on screen or last named: verses in its
   * chapter are preferred, and the next verse of it most of all.
   */
  match(heard: string, near?: { book: number; chapter: number; verse?: number } | null): VerseHit | null {
    const w = verseWords(heard).slice(-24);
    if (w.length < 4) return null;

    const scores = new Map<number, number>();
    const phrases = new Map<number, number>();
    for (const h of new Set(triples(w))) {
      const from = this.lowerBound(h * ID_SPACE);
      const to = this.lowerBound((h + 1) * ID_SPACE);
      const n = to - from;
      if (!n || n > TOO_COMMON) continue;
      const weight = 1 / Math.log2(2 + n);
      for (let i = from; i < to; i++) {
        const id = this.entries[i] - h * ID_SPACE;
        scores.set(id, (scores.get(id) ?? 0) + weight);
        phrases.set(id, (phrases.get(id) ?? 0) + 1);
      }
    }
    if (!scores.size) return null;

    let best: { id: number; s: number } | null = null;
    for (const [id, raw] of scores) {
      let s = raw;
      if (near) {
        const r = this.ref(id);
        if (r.book === near.book && r.chapter === near.chapter) {
          s *= 1.6;
          if (near.verse !== undefined && (r.verse === near.verse || r.verse === near.verse + 1)) s *= 1.25;
        }
      }
      if (!best || s > best.s) best = { id, s };
    }
    if (!best) return null;
    const at = this.ref(best.id);

    // The strongest other candidate, not counting this verse's neighbours
    // (a phrase read across two verses matches both).
    let runnerUp = 0;
    for (const [id, s] of scores) {
      const r = this.ref(id);
      const neighbour = r.book === at.book && r.chapter === at.chapter && Math.abs(r.verse - at.verse) <= 1;
      if (!neighbour && s > runnerUp) runnerUp = s;
    }
    const count = phrases.get(best.id) ?? 0;
    const confident = count >= 3 && best.s >= 1.2 && best.s >= runnerUp * 1.5;
    return { ...at, score: Math.round(best.s * 100) / 100, phrases: count, confident };
  }
}
