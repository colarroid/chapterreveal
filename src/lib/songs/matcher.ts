// Worship mode: from the words being sung, find the song and the slide.
//
// Every slide is indexed by its word triples ("great is thy", "is thy
// faithfulness"), and pairs for short lines. The last few words heard are
// scored against the index: rare phrases count for more than common ones
// ("i love you" is in hundreds of songs), and the song already being sung
// is preferred, so a chorus shared by two songs stays on the right one.
// Singing transcribes less cleanly than speech, so it never needs every
// word: two or three matching phrases are enough.
//
// Order counts too. Two songs can share a line, but rarely several lines in
// the same order, so phrases are strung into runs that move forward through
// a song (same slide, or on by one or two), and a song scores by its best
// run. The run's last phrase says where the singer is now.

import type { SongSlide } from "./songs";

export interface IndexedSong {
  id: string;
  title: string;
  slides: SongSlide[];
}

/** A song that could be the one being sung, at the slide it's up to. */
export interface Candidate {
  song: number;
  slide: number;
  score: number;
  /**
   * How many of the words heard the song accounts for, in order. A line
   * the song shares with others reaches a few; two of its lines, more.
   */
  reach: number;
}

export interface SongMatch extends Candidate {
  /** Safe to put on screen without the operator. */
  confident: boolean;
  /** The best few songs, best first (one each), for the operator to pick from. */
  candidates: Candidate[];
}

export interface MatchOptions {
  /** Only this song (a locked song): the question is which line, not which song. */
  only?: number;
  /**
   * A small nudge per song, about 1 to 1.35: songs sung widely across
   * churches, or recently here. Breaks near-ties; never decides on its own.
   */
  prior?: (song: number) => number;
}

/** How many of the latest words are compared: a couple of lines. */
const WINDOW = 20;

/**
 * When a song is clear enough to go up on its own: its score, and how far
 * ahead of the next song it must be. Tuned on a real songbook with
 * simulated mishearing (see the replay on the History page for services).
 */
export const CONFIDENT = { score: 2, lead: 1.5 };

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
  /** Per song, per slide: the slides with the same words (a chorus sung again). */
  private twins: number[][][];
  /** Each song's distinct words, to tell when two songs are copies of each other. */
  private phrases: Set<string>[];

  constructor(songs: IndexedSong[]) {
    this.songs = songs;
    // Each slide's words, worked out once (thousands of songs load at once).
    const slideWords = songs.map((song) => song.slides.map((sl) => words(sl.text)));
    // The same word sounds the same every time: work it out once too.
    const sounds = new Map<string, string>();
    const sound = (w: string) => {
      let k = sounds.get(w);
      if (k === undefined) sounds.set(w, (k = soundKey(w)));
      return k;
    };
    this.phrases = slideWords.map((slides) => {
      const w = slides.flat();
      const set = new Set<string>();
      for (let i = 0; i + 2 < w.length; i++) set.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
      return set;
    });
    this.twins = slideWords.map((slides) => {
      const byText = new Map<string, number[]>();
      const keys = slides.map((w, i) => {
        const key = w.join(" ");
        byText.set(key, [...(byText.get(key) ?? []), i]);
        return key;
      });
      return keys.map((k) => byText.get(k)!);
    });
    songs.forEach((song, si) => {
      let carry: string[] = [];
      song.slides.slice(0, 4096).forEach((_, li) => {
        const w = slideWords[si][li];
        // The last words of the slide before join this one's first, so a
        // phrase sung across the change still points at the new slide.
        const seq = [...carry, ...w];
        const seen = new Set<string>();
        for (let i = 0; i + 2 < seq.length; i++) seen.add(`${seq[i]} ${seq[i + 1]} ${seq[i + 2]}`);
        // Pairs too, marked apart, for slides of one or two short lines.
        for (let i = 0; i + 1 < w.length; i++) seen.add(`2:${w[i]} ${w[i + 1]}`);
        // And by sound, for words the transcriber heard slightly wrong.
        const k = seq.map(sound);
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
   * transcript (the last couple of lines are used); `current` is what is on
   * screen now, if anything.
   */
  match(heard: string, current?: { song: number; slide: number } | null, opts: MatchOptions = {}): SongMatch | null {
    const w = words(heard).slice(-WINDOW);
    if (w.length < 3) return null;

    // Every phrase heard that's in a song: where in the words it was heard,
    // which slide it's on, and how much it says (rare phrases say more).
    const hits = new Map<number, Hit[]>();
    const add = (g: string, weight: number, at: number) => {
      const list = this.grams.get(g);
      if (!list) return;
      const idf = weight / Math.log2(2 + list.length);
      for (const p of list) {
        const { song, slide } = unpack(p);
        if (opts.only !== undefined && song !== opts.only) continue;
        let h = hits.get(song);
        if (!h) hits.set(song, (h = []));
        h.push({ at, slide, weight: idf });
      }
    };
    for (let i = 0; i + 2 < w.length; i++) add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`, 1, i + 2);
    for (let i = 0; i + 1 < w.length; i++) add(`2:${w[i]} ${w[i + 1]}`, 0.35, i + 1);
    const k = w.map(soundKey);
    for (let i = 0; i + 2 < k.length; i++) add(`s:${k[i]} ${k[i + 1]} ${k[i + 2]}`, 0.6, i + 2);
    if (!hits.size) return null;

    const scored: Candidate[] = [];
    let inCurrent: Candidate | null = null;
    for (const [song, list] of hits) {
      const run = bestRun(list);
      let s = run.score;
      let slide = run.slide;
      // Prefer the song being sung, and within it the slides just ahead.
      if (current && song === current.song) {
        slide = this.nearest(song, slide, current.slide);
        s *= 1.5;
        const ahead = slide - current.slide;
        if (ahead === 0 || ahead === 1) s *= 1.25;
        // A weaker match is enough to move within the song on screen.
        if (slide >= current.slide - 1 && slide <= current.slide + 3) inCurrent = { song, slide, score: s, reach: run.reach };
      }
      s *= Math.min(1.35, Math.max(1, opts.prior?.(song) ?? 1));
      scored.push({ song, slide, score: s, reach: run.reach });
    }
    scored.sort((a, b) => b.score - a.score);
    const round = (c: Candidate): Candidate => ({ ...c, score: Math.round(c.score * 100) / 100 });
    // Libraries often hold the same song twice (a new title, a line split
    // differently). Copies count as one: offered once, and not as a rival
    // that keeps the song from ever being clear.
    const distinct: Candidate[] = [];
    for (const c of scored) {
      if (!distinct.some((d) => this.copies(d.song, c.song))) distinct.push(c);
      if (distinct.length === 3) break;
    }
    const candidates = distinct.slice(0, 3).map(round);
    const best = scored[0];
    const runnerUp = distinct[1]?.score ?? 0;

    // Confident: enough matching phrases, and clearly ahead of any other
    // song. With one song to choose from (locked), only the line is in
    // question, so less is needed.
    const locked = opts.only !== undefined;
    const confident = locked ? best.score >= 0.6 : best.score >= CONFIDENT.score && best.score >= runnerUp * CONFIDENT.lead;
    if (confident) return { ...round(best), confident, candidates };
    if (inCurrent && inCurrent.score >= 0.6 && inCurrent.score >= best.score * 0.8) {
      return { ...round(inCurrent), confident: true, candidates };
    }
    return { ...round(best), confident: false, candidates };
  }

  /**
   * Whether two songs are copies: most of the smaller one's phrases (three
   * words in a row) are in the other. Phrases, not words: worship songs
   * share most of their words ("Lord", "holy", "worthy"), and two different
   * songs with the same chorus must stay rivals, or one goes up as if sure.
   */
  private copies(a: number, b: number): boolean {
    if (a === b) return true;
    const [x, y] = [this.phrases[a], this.phrases[b]];
    if (!x?.size || !y?.size) return false;
    const [small, big] = x.size <= y.size ? [x, y] : [y, x];
    // Very different sizes: one is a medley or a fragment, not a copy.
    if (small.size < big.size * 0.5) return false;
    let both = 0;
    for (const w of small) if (big.has(w)) both++;
    return both / small.size >= 0.7;
  }

  /** Of a slide and its twins (the same words again), the one nearest ahead of `from`. */
  private nearest(song: number, slide: number, from: number): number {
    const twins = this.twins[song]?.[slide] ?? [slide];
    if (twins.length < 2) return slide;
    return twins.find((t) => t >= from) ?? twins[twins.length - 1];
  }

  /**
   * Whether the words just heard are the last line of this slide, so the
   * next slide can go up a moment early and people read ahead of the singer.
   * Only for slides of two lines or more, and only when the ending isn't
   * also sung earlier in the slide.
   */
  atLastLine(song: number, slide: number, heard: string): boolean {
    const lines = (this.songs[song]?.slides[slide]?.text ?? "")
      .split("\n")
      .map(words)
      .filter((l) => l.length);
    if (lines.length < 2) return false;
    const tail = words(heard).slice(-3);
    if (tail.length < 3) return false;
    const has = (line: string[], key: (x: string) => string) => {
      const t = tail.map(key).join(" ");
      for (let i = 0; i + 2 < line.length; i++) if (line.slice(i, i + 3).map(key).join(" ") === t) return true;
      return false;
    };
    const last = lines[lines.length - 1];
    const earlier = lines.slice(0, -1).flat();
    const same = (x: string) => x;
    if (has(last, same)) return !has(earlier, same);
    return has(last, soundKey) && !has(earlier, soundKey);
  }
}

type Hit = { at: number; slide: number; weight: number };

/**
 * The best run of phrases through one song: heard in order, each on the
 * same slide as the one before or a slide or two further on. Returns its
 * score and the slide it ends on (where the singer is now).
 */
function bestRun(list: Hit[]): { score: number; slide: number; reach: number } {
  const hits = [...list].sort((a, b) => a.at - b.at);
  const best = new Array<number>(hits.length);
  const prev = new Array<number>(hits.length).fill(-1);
  let top = { score: 0, slide: 0, at: -1, end: -1 };
  for (let i = 0; i < hits.length; i++) {
    let before = 0;
    for (let j = 0; j < i; j++) {
      const step = hits[i].slide - hits[j].slide;
      if (step >= 0 && step <= 2 && best[j] > before) {
        before = best[j];
        prev[i] = j;
      }
    }
    best[i] = hits[i].weight + before;
    // The highest run wins; between equal runs, the one heard last.
    if (best[i] > top.score + 1e-9 || (Math.abs(best[i] - top.score) < 1e-9 && hits[i].at >= top.at)) {
      top = { score: best[i], slide: hits[i].slide, at: hits[i].at, end: i };
    }
  }
  // The words the run covers: each phrase ends on a word heard; a triple
  // also vouches for the two words before it.
  const covered = new Set<number>();
  for (let i = top.end; i >= 0; i = prev[i]) for (let k = 0; k < 3; k++) if (hits[i].at - k >= 0) covered.add(hits[i].at - k);
  return { score: top.score, slide: top.slide, reach: covered.size };
}
