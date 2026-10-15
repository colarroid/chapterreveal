// Worship mode: from the words being sung, find the song and the slide.
//
// Every slide is indexed by its word triples ("great is thy", "is thy
// faithfulness"), and pairs for short lines. The last few words heard are
// scored against the index: rare phrases count for more than common ones
// ("i love you" is in hundreds of songs), and the song already being sung
// is preferred, so a chorus shared by two songs stays on the right one.
// Singing transcribes less cleanly than speech, so it never needs every
// word: two or three matching phrases are enough.

import type { SongSlide } from "./songs";

export interface IndexedSong {
  id: string;
  title: string;
  slides: SongSlide[];
}

export interface SongMatch {
  song: number;
  slide: number;
  score: number;
  /** Safe to put on screen without the operator. */
  confident: boolean;
}

export function words(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    // Held notes: "ekeleeeee" and "ekele" are the same word.
    .replace(/(\p{L})\1{2,}/gu, "$1")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * A rough "sounds like" key, so a misheard word still counts: "breed" and
 * "breathe" both become "prt". Vowels after the first letter go, voiced
 * consonants become their unvoiced pair, and common spellings of one sound
 * are made the same.
 */
export function soundKey(word: string): string {
  const w = word
    .replace(/^kn|^wr/, (m) => m[1])
    .replace(/ph/g, "f")
    .replace(/gh/g, "")
    .replace(/ck/g, "k")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/[cq]/g, "k")
    .replace(/x/g, "ks")
    .replace(/[td]h/g, "t")
    .replace(/wh/g, "w")
    .replace(/d/g, "t")
    .replace(/b/g, "p")
    .replace(/g/g, "k")
    .replace(/v/g, "f")
    .replace(/z/g, "s");
  const head = w[0] ?? "";
  const rest = w.slice(1).replace(/[aeiouyhw]/g, "");
  return (head + rest).replace(/(.)\1+/g, "$1");
}

type Posting = number; // song << 12 | slide

const pack = (song: number, slide: number): Posting => song * 4096 + slide;
const unpack = (p: Posting) => ({ song: Math.floor(p / 4096), slide: p % 4096 });

export class SongIndex {
  readonly songs: IndexedSong[];
  private grams = new Map<string, Posting[]>();

  constructor(songs: IndexedSong[]) {
    this.songs = songs;
    songs.forEach((song, si) => {
      let carry: string[] = [];
      song.slides.slice(0, 4096).forEach((slide, li) => {
        const w = words(slide.text);
        // The last words of the slide before join this one's first, so a
        // phrase sung across the change still points at the new slide.
        const seq = [...carry, ...w];
        const seen = new Set<string>();
        for (let i = 0; i + 2 < seq.length; i++) seen.add(`${seq[i]} ${seq[i + 1]} ${seq[i + 2]}`);
        // Pairs too, marked apart, for slides of one or two short lines.
        for (let i = 0; i + 1 < w.length; i++) seen.add(`2:${w[i]} ${w[i + 1]}`);
        // And by sound, for words the transcriber heard slightly wrong.
        const k = seq.map(soundKey);
        for (let i = 0; i + 2 < k.length; i++) seen.add(`s:${k[i]} ${k[i + 1]} ${k[i + 2]}`);
        for (const g of seen) {
          let list = this.grams.get(g);
          if (!list) this.grams.set(g, (list = []));
          list.push(pack(si, li));
        }
        carry = w.slice(-2);
      });
    });
  }

  /**
   * The slide that best matches what was just sung. `heard` is the recent
   * transcript (the last dozen words are used); `current` is what is on
   * screen now, if anything.
   */
  match(heard: string, current?: { song: number; slide: number } | null): SongMatch | null {
    const w = words(heard).slice(-12);
    if (w.length < 3) return null;

    const scores = new Map<Posting, number>();
    const add = (g: string, weight: number) => {
      const list = this.grams.get(g);
      if (!list) return;
      // Rare phrases identify a song; common ones barely count.
      const idf = weight / Math.log2(2 + list.length);
      for (const p of list) scores.set(p, (scores.get(p) ?? 0) + idf);
    };
    for (let i = 0; i + 2 < w.length; i++) add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`, 1);
    for (let i = 0; i + 1 < w.length; i++) add(`2:${w[i]} ${w[i + 1]}`, 0.35);
    const k = w.map(soundKey);
    for (let i = 0; i + 2 < k.length; i++) add(`s:${k[i]} ${k[i + 1]} ${k[i + 2]}`, 0.6);
    if (!scores.size) return null;

    // Prefer the song being sung, and within it the slides just ahead.
    let best: { p: Posting; s: number } | null = null;
    let inCurrent: { p: Posting; s: number } | null = null;
    const bestBySong = new Map<number, number>();
    for (const [p, raw] of scores) {
      const { song, slide } = unpack(p);
      let s = raw;
      if (current && song === current.song) {
        s *= 1.5;
        const ahead = slide - current.slide;
        if (ahead === 0 || ahead === 1) s *= 1.25;
      }
      if (!best || s > best.s) best = { p, s };
      if (current && song === current.song && slide >= current.slide - 1 && slide <= current.slide + 3 && (!inCurrent || s > inCurrent.s)) {
        inCurrent = { p, s };
      }
      if (s > (bestBySong.get(song) ?? 0)) bestBySong.set(song, s);
    }
    if (!best) return null;
    const { song, slide } = unpack(best.p);

    // Confident: enough matching phrases, and clearly ahead of any other song.
    let runnerUp = 0;
    for (const [other, s] of bestBySong) if (other !== song && s > runnerUp) runnerUp = s;
    const confident = best.s >= 1.2 && best.s >= runnerUp * 1.4;
    if (confident) return { song, slide, score: Math.round(best.s * 100) / 100, confident };

    // Within the song on screen, a weaker match is enough to move to a
    // nearby slide: the song is already known, only the line is in question.
    if (inCurrent && inCurrent.s >= 0.6 && inCurrent.s >= best.s * 0.8) {
      const at = unpack(inCurrent.p);
      return { song: at.song, slide: at.slide, score: Math.round(inCurrent.s * 100) / 100, confident: true };
    }
    return { song, slide, score: Math.round(best.s * 100) / 100, confident: false };
  }
}
