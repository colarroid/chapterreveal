// The Song Lyrics console's decisions, in one place: from the words being
// sung, what goes on screen, what's offered to the operator, and what's
// logged. The console runs it live; the service check on the History page
// replays a service's log through it, so both always decide the same way.

import { Follower } from "./follow";
import type { SongIndex } from "./matcher";

/** Finished lines in a row that must point at a new song before it goes up on its own. */
export const NEW_SONG_LINES = 2;
/**
 * …and how many of the words heard must be the song's, in its order: more
 * than one line's worth. Songs often share a line (a chorus, "hallelujah,
 * you are worthy"); two different lines of one song rarely belong to another.
 */
export const NEW_SONG_REACH = 10;
/** A song the operator said was wrong isn't put up or suggested again for this long. */
export const REJECT_MS = 2 * 60_000;

/** A song detection thinks it could be, at the slide it's up to. */
export interface Suggested {
  id: string;
  slide: number;
  score: number;
}

export interface Heard {
  /** The latest couple of lines heard. */
  recent: string;
  /** A finished line (the transcriber won't change it). */
  final: boolean;
  /** What's on screen now. */
  current: { id: string; slide: number } | null;
  /** Follow is on: confident matches go up without the operator. */
  follow: boolean;
  now: number;
}

export type Decision = "auto" | "early" | "suggest" | "hold" | "stay" | "none";

export interface Outcome {
  /** Put this up: a new slide (auto), or the next one ahead of the singer (early). */
  show: { id: string; slide: number; how: "auto" | "early" } | null;
  /** For the operator to pick from, best first; empty to clear. */
  suggestions: Suggested[];
  decision: Decision;
  /** For the detection log. */
  candidates: Suggested[];
  chosen: { id: string; slide: number } | null;
  locked: boolean;
  playlist: boolean;
}

export class FollowEngine {
  readonly follower = new Follower();
  /** Every song the church can see. */
  library: SongIndex | null = null;
  /** The chosen playlist's songs, listened for first. */
  playlist: SongIndex | null = null;
  /** Song id to a small lift (1 to 1.35) for songs sung widely or recently here. */
  usage = new Map<string, number>();
  private lastKey = "";
  private newSong = { id: "", lines: 0 };
  /** Songs the operator said were wrong, until when. */
  private rejected = new Map<string, number>();
  private positions = new WeakMap<SongIndex, Map<string, number>>();

  private pos(idx: SongIndex, id: string): number {
    let m = this.positions.get(idx);
    if (!m) this.positions.set(idx, (m = new Map(idx.songs.map((s, i) => [s.id, i]))));
    return m.get(id) ?? -1;
  }

  /**
   * The operator says the song on screen is the wrong one: stop following
   * it, and don't put it up or suggest it again for a while (unless they
   * pick it themselves).
   */
  reject(id: string, now = Date.now()) {
    this.rejected.set(id, now + REJECT_MS);
    if (this.follower.lock?.id === id) this.follower.unlock();
    this.newSong = { id: "", lines: 0 };
  }

  /** A slide went on screen (by any route): a new song is followed from now on. */
  shown(id: string, before: { id: string } | null, now = Date.now()) {
    // Picked by hand after all: the operator knows best.
    this.rejected.delete(id);
    if (before?.id !== id) this.follower.lockTo(id, false, now);
  }

  hear({ recent, final, current, follow, now }: Heard): Outcome {
    const f = this.follower;
    const pick = (idx: SongIndex | null, only?: string) => {
      if (!idx) return null;
      const at = current ? this.pos(idx, current.id) : -1;
      const onlyAt = only ? this.pos(idx, only) : undefined;
      if (onlyAt === -1) return null;
      const r = idx.match(recent, current && at >= 0 ? { song: at, slide: current.slide } : null, {
        only: onlyAt,
        prior: (song) => this.usage.get(idx.songs[song].id) ?? 1,
      });
      return r ? { ...r, id: idx.songs[r.song].id, candidates: r.candidates.map((c) => ({ id: idx.songs[c.song].id, slide: c.slide, score: c.score })) } : null;
    };

    // The locked song alone: which line, not which song.
    const locked = f.lock ? pick(this.library, f.lock.id) : null;
    // The playlist first. The whole library only suggests while a playlist
    // is chosen: a song nobody planned never jumps onto the screen.
    const inSet = this.playlist;
    let m = pick(inSet);
    if (!m?.confident) {
      const all = pick(this.library);
      if (all && (!m || all.score > m.score)) m = inSet ? { ...all, confident: false } : all;
    }
    // Songs the operator turned down are out of the running for now.
    const turnedDown = (id: string) => (this.rejected.get(id) ?? 0) > now;
    if (m && turnedDown(m.id)) m = { ...m, confident: false };
    if (m) m = { ...m, candidates: m.candidates.filter((c) => !turnedDown(c.id)) };
    const chosen0 = f.choose(locked, m, now);
    const chosen = chosen0 && turnedDown(chosen0.id) ? null : chosen0;
    // Finished lines in a row that pointed at a song other than the one up,
    // counted from the first (even while it was only a suggestion).
    if (final) {
      const lead = m && m.id !== current?.id ? m.id : "";
      this.newSong = !lead ? { id: "", lines: 0 } : this.newSong.id === lead ? { id: lead, lines: this.newSong.lines + 1 } : { id: lead, lines: 1 };
    }
    const base = {
      candidates: m?.candidates ?? [],
      chosen: chosen ? { id: chosen.id, slide: chosen.slide } : null,
      locked: !!f.lock,
      playlist: !!inSet,
    };
    const out = (decision: Decision, suggestions: Suggested[], show: Outcome["show"] = null): Outcome => ({ ...base, decision, suggestions, show });

    // Other songs it could be, for the operator to pick from.
    const others = (m?.candidates ?? []).filter((c) => c.id !== chosen?.id || !chosen?.confident);
    // Nothing clear. Following a locked song, nothing to suggest either.
    if (!chosen) return out("none", f.lock ? [] : others);
    if (!chosen.confident || !follow) {
      return out("suggest", [{ id: chosen.id, slide: chosen.slide, score: chosen.score }, ...others.filter((c) => c.id !== chosen.id)].slice(0, 3));
    }
    // Still finishing the line the screen already moved on from.
    if (f.holdsBack(chosen.id, chosen.slide, now)) return out("hold", []);
    // Move only when the same slide wins twice in a row (or the line is
    // finished), so a half-heard phrase doesn't flick the screen.
    const key = `${chosen.id}:${chosen.slide}`;
    const settled = final || this.lastKey === key;
    this.lastKey = key;
    // A different song needs two finished lines in a row pointing at it,
    // covering more than one line of it, before it goes up on its own: a
    // line two songs share never decides, and a wrong song on the big
    // screen is worse than a line's wait.
    if (current?.id !== chosen.id) {
      const sure = this.newSong.id === chosen.id && this.newSong.lines >= NEW_SONG_LINES && (chosen.reach ?? 0) >= NEW_SONG_REACH;
      if (!sure) {
        return out("suggest", [{ id: chosen.id, slide: chosen.slide, score: chosen.score }, ...others.filter((c) => c.id !== chosen.id)].slice(0, 3));
      }
    }
    if (settled && (current?.id !== chosen.id || current.slide !== chosen.slide)) {
      this.newSong = { id: "", lines: 0 };
      return out("auto", [], { id: chosen.id, slide: chosen.slide, how: "auto" });
    }
    // On the slide being sung, at its last line: the next slide goes up
    // now, so people read the line before they sing it.
    const idx = this.library;
    const at = idx && current ? this.pos(idx, current.id) : -1;
    const song = at >= 0 ? idx!.songs[at] : null;
    if (song && current && current.id === chosen.id && current.slide === chosen.slide && current.slide + 1 < song.slides.length && idx!.atLastLine(at, current.slide, recent)) {
      f.wentEarly(current.id, current.slide, now);
      return out("early", [], { id: current.id, slide: current.slide + 1, how: "early" });
    }
    return out(settled ? "stay" : "hold", []);
  }
}

/**
 * From song_usage() (migration 0027): a small lift per song, 1 to 1.35.
 * Sung by more churches this year counts a little, by this church in the
 * last three months a little more.
 */
export function usageLift(rows: { song_id: string; churches: number; here_recently: boolean }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.song_id, 1 + Math.min(0.25, 0.08 * Math.log2(1 + r.churches)) + (r.here_recently ? 0.1 : 0));
  return m;
}
