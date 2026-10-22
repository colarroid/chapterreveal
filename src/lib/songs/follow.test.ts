import { describe, expect, it } from "vitest";
import { EARLY_HOLD_MS, Follower, RELEASE_MS, SWITCH_MS, type Pick } from "./follow";

const pick = (id: string, slide: number, confident = true): Pick => ({ id, slide, score: 2, confident });

describe("Follower", () => {
  it("passes the library's match through when nothing is locked", () => {
    expect(new Follower().choose(null, pick("a", 1))).toEqual(pick("a", 1));
  });

  it("follows the locked song, and only suggests another one at first", () => {
    const f = new Follower();
    f.lockTo("a", false, 0);
    expect(f.choose(pick("a", 2), pick("b", 0), 1000)).toEqual(pick("a", 2));
    // The locked song isn't heard, another is: a suggestion, not a switch.
    expect(f.choose(null, pick("b", 0), 2000)).toEqual(pick("b", 0, false));
    expect(f.lock?.id).toBe("a");
  });

  it("moves to another song once it's clearly being sung", () => {
    const f = new Follower();
    f.lockTo("a", false, 0);
    f.choose(null, pick("b", 0), 1000);
    expect(f.choose(null, pick("b", 1), 1000 + SWITCH_MS)).toEqual(pick("b", 1));
    expect(f.lock).toBeNull();
  });

  it("never switches past a lock the operator set", () => {
    const f = new Follower();
    f.lockTo("a", true, 0);
    f.choose(null, pick("b", 0), 1000);
    expect(f.choose(null, pick("b", 1), 1000 + SWITCH_MS * 3)?.confident).toBe(false);
    expect(f.choose(null, null, RELEASE_MS * 3)).toBeNull();
    expect(f.lock).toEqual({ id: "a", manual: true });
  });

  it("stays quiet about weak guesses while a song is locked", () => {
    const f = new Follower();
    f.lockTo("a", false, 0);
    expect(f.choose(null, pick("b", 0, false), 1000)).toBeNull();
  });

  it("lets go after a long stretch without the locked song", () => {
    const f = new Follower();
    f.lockTo("a", false, 0);
    expect(f.choose(null, pick("b", 0, false), RELEASE_MS + 1)).toEqual(pick("b", 0, false));
    expect(f.lock).toBeNull();
  });

  it("doesn't go back to the slide it left early, for a few seconds", () => {
    const f = new Follower();
    f.wentEarly("a", 3, 0);
    expect(f.holdsBack("a", 3, 1000)).toBe(true);
    expect(f.holdsBack("a", 4, 1000)).toBe(false);
    expect(f.holdsBack("a", 3, EARLY_HOLD_MS + 1)).toBe(false);
  });

  it("keeps the operator's lock when the song is followed automatically", () => {
    const f = new Follower();
    f.lockTo("a", true, 0);
    f.lockTo("a", false, 10);
    expect(f.lock).toEqual({ id: "a", manual: true });
  });
});
