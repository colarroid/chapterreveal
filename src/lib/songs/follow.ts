// Following a song once it's known: identify once, then follow.
//
// When a song goes on screen it's locked: from then on the question is
// which line, not which song, so matching looks at that song alone and a
// line it shares with other songs can't pull the screen away. The lock
// lets go when the singing has clearly moved to another song (another song
// heard confidently for a few seconds while this one isn't) or when nothing
// of it has been heard for a while. A lock the operator set stays until
// they release it; other songs are only suggested meanwhile.
//
// It also remembers an early move (the next slide put up while the last
// line of this one was still being sung), so the screen doesn't go back
// while the singer finishes the line.

/** A match to act on: a song (by id), the slide it's up to, and whether it's safe to show. */
export interface Pick {
  id: string;
  slide: number;
  score: number;
  confident: boolean;
}

/** Another song heard this long (while the locked one isn't) and it takes over. */
export const SWITCH_MS = 4000;
/** Nothing of the locked song heard for this long, while singing goes on: let go. */
export const RELEASE_MS = 20_000;
/** After an early move, the slide just left doesn't come back for this long. */
export const EARLY_HOLD_MS = 6000;

export class Follower {
  lock: { id: string; manual: boolean } | null = null;
  private lastHit = 0;
  private other = { id: "", since: 0 };
  private early: { id: string; from: number; until: number } | null = null;

  lockTo(id: string, manual: boolean, now = Date.now()) {
    // Never weaken a lock the operator set on the same song.
    if (this.lock?.id === id && this.lock.manual && !manual) return;
    this.lock = { id, manual };
    this.lastHit = now;
    this.other = { id: "", since: 0 };
  }

  unlock() {
    this.lock = null;
    this.early = null;
  }

  /**
   * Which match to act on. `locked`: the locked song alone; `all`: the whole
   * library (or the playlist). Without a lock, the library's. With one, the
   * locked song's while it's heard; another song is a suggestion, and takes
   * over only when it's clearly what's being sung (never past a lock the
   * operator set).
   */
  choose(locked: Pick | null, all: Pick | null, now = Date.now()): Pick | null {
    const lock = this.lock;
    if (!lock) return all;
    if (locked?.confident) {
      this.lastHit = now;
      this.other = { id: "", since: 0 };
      return locked;
    }
    if (all?.confident && all.id !== lock.id) {
      if (this.other.id !== all.id) this.other = { id: all.id, since: now };
      const taken = now - this.other.since >= SWITCH_MS && now - this.lastHit >= SWITCH_MS;
      if (taken && !lock.manual) {
        this.unlock();
        return all;
      }
      return { ...all, confident: false };
    }
    // Nothing of the locked song for a long while: let go, and the library
    // decides again. Otherwise stay put: a weak guess at some other song
    // isn't worth interrupting the song being sung.
    if (!lock.manual && now - this.lastHit > RELEASE_MS) {
      this.unlock();
      return all;
    }
    return null;
  }

  /** The next slide went up early, while `from`'s last line was still being sung. */
  wentEarly(id: string, from: number, now = Date.now()) {
    this.early = { id, from, until: now + EARLY_HOLD_MS };
  }

  /** Whether a match is just the end of the slide that was left early: not worth going back for. */
  holdsBack(id: string, slide: number, now = Date.now()): boolean {
    const e = this.early;
    return !!e && now <= e.until && e.id === id && slide === e.from;
  }
}
