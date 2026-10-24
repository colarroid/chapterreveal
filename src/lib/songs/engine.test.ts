import { describe, expect, it } from "vitest";
import { FollowEngine, type Heard } from "./engine";
import { SongIndex } from "./matcher";

// Made-up lyrics.
const library = new SongIndex([
  {
    id: "river",
    title: "River of Mercy",
    slides: [
      { text: "Down by the river of mercy\nI lay my burdens down" },
      { text: "Every morning brand new\nYour kindness follows me" },
      { label: "Chorus", text: "I love you Lord\nI lift my voice to you" },
    ],
  },
  {
    id: "mountain",
    title: "Mountain Song",
    slides: [
      { text: "High on the mountain of glory\nThe trumpets sound for you" },
      { label: "Chorus", text: "I love you Lord\nI lift my voice to you" },
    ],
  },
  {
    // Starts with River of Mercy's first line, then goes its own way.
    id: "valley",
    title: "Valley Song",
    slides: [{ text: "Down by the river of mercy\nThe willows bend and sway" }, { text: "Silver water singing\nAll along the way" }],
  },
]);

function engine() {
  const e = new FollowEngine();
  e.library = library;
  return e;
}
const heard = (recent: string, more: Partial<Heard> = {}): Heard => ({ recent, final: true, current: null, follow: true, now: 0, ...more });

describe("FollowEngine", () => {
  it("puts a song up once two of its lines have been sung", () => {
    const e = engine();
    const one = e.hear(heard("i lay my burdens down every morning brand new", { now: 0 }));
    expect(one.show).toBeNull();
    expect(one.suggestions[0]?.id).toBe("river");
    const two = e.hear(heard("i lay my burdens down every morning brand new your kindness follows me", { now: 3000 }));
    expect(two).toMatchObject({ decision: "auto", show: { id: "river", slide: 1, how: "auto" } });
  });

  it("never puts a song up from a line another song shares", () => {
    const e = engine();
    // Sung twice, even: it's in River of Mercy and Valley Song alike.
    e.hear(heard("down by the river of mercy", { now: 0 }));
    const o = e.hear(heard("down by the river of mercy down by the river of mercy", { now: 3000 }));
    expect(o.show).toBeNull();
    expect(o.suggestions.map((s) => s.id).sort()).toEqual(["river", "valley"]);
  });

  it("only suggests while Follow is off", () => {
    const o = engine().hear(heard("down by the river of mercy i lay my burdens down", { follow: false }));
    expect(o.show).toBeNull();
    expect(o.decision).toBe("suggest");
    expect(o.suggestions[0]).toMatchObject({ id: "river", slide: 0 });
  });

  it("offers the songs a shared chorus could be, instead of guessing", () => {
    const o = engine().hear(heard("i love you lord i lift my voice to you"));
    expect(o.show).toBeNull();
    expect(o.suggestions.map((s) => s.id).sort()).toEqual(["mountain", "river"]);
  });

  it("stays on the locked song through a chorus another song shares", () => {
    const e = engine();
    e.shown("mountain", null, 0);
    const o = e.hear(heard("i love you lord i lift my voice to you", { current: { id: "mountain", slide: 0 }, now: 1000 }));
    expect(o.show).toEqual({ id: "mountain", slide: 1, how: "auto" });
  });

  it("goes to the next slide at the last line, and doesn't come back for it", () => {
    const e = engine();
    e.shown("river", null, 0);
    const at = { current: { id: "river", slide: 1 }, now: 1000 };
    const early = e.hear(heard("every morning brand new your kindness follows me", at));
    expect(early).toMatchObject({ decision: "early", show: { id: "river", slide: 2, how: "early" } });
    // The singer is still finishing slide 2's line: the screen stays ahead.
    const after = e.hear(heard("your kindness follows me", { current: { id: "river", slide: 2 }, now: 2000 }));
    expect(after.show).toBeNull();
  });

  it("within a song, waits for a half-heard phrase to settle before moving", () => {
    const e = engine();
    e.shown("river", null, 0);
    const at = { current: { id: "river", slide: 0 }, final: false, now: 1000 };
    expect(e.hear(heard("every morning brand new your", at)).show).toBeNull();
    expect(e.hear(heard("every morning brand new your kindness", { ...at, now: 1200 })).show).toMatchObject({ id: "river", slide: 1 });
  });

  it("puts a playlist song up after one line, where a library song needs two", () => {
    const line = "i lay my burdens down every morning brand new";
    const open = engine().hear(heard(line));
    expect(open.show).toBeNull();
    const e = engine();
    e.playlist = new SongIndex([library.songs[0], library.songs[1]]);
    const o = e.hear(heard(line));
    expect(o).toMatchObject({ decision: "auto", show: { id: "river", how: "auto" } });
    // Still never from a single line two songs share.
    const f = engine();
    f.playlist = new SongIndex([library.songs[0], library.songs[2]]);
    expect(f.hear(heard("down by the river of mercy")).show).toBeNull();
  });

  it("keeps songs outside the playlist to suggestions", () => {
    const e = engine();
    e.playlist = new SongIndex([library.songs[1]]);
    const o = e.hear(heard("down by the river of mercy i lay my burdens down"));
    expect(o.show).toBeNull();
    expect(o.suggestions[0]?.id).toBe("river");
  });
});

describe("FollowEngine, a wrong song", () => {
  it("is let go of, and not put up or suggested again for a while", () => {
    const e = new FollowEngine();
    e.library = library;
    e.shown("river", null, 0);
    e.reject("river", 1000);
    expect(e.follower.lock).toBeNull();
    const line = "i lay my burdens down every morning brand new your kindness follows me";
    for (const now of [2000, 5000, 8000]) {
      const o = e.hear({ recent: line, final: true, current: null, follow: true, now });
      expect(o.show).toBeNull();
      expect(o.suggestions.some((s) => s.id === "river")).toBe(false);
    }
  });

  it("comes back if the operator picks it after all", () => {
    const e = new FollowEngine();
    e.library = library;
    e.reject("river", 0);
    e.shown("river", null, 1000);
    expect(e.follower.lock?.id).toBe("river");
  });
});

describe("FollowEngine, one line sung over and over", () => {
  it("doesn't put a song up from a single line, however often it's sung", () => {
    const e = new FollowEngine();
    e.library = library;
    let t = 0;
    for (const recent of ["i lay my burdens down", "i lay my burdens down i lay my burdens down", "i lay my burdens down i lay my burdens down"]) {
      t += 3000;
      expect(e.hear({ recent, final: true, current: null, follow: true, now: t }).show).toBeNull();
    }
  });
});

describe("FollowEngine, a song's sung order", () => {
  it("goes early to the next slide in the order sung, not as written", () => {
    const e = new FollowEngine();
    e.library = library;
    e.shown("river", null, 0);
    // River is sung verse 1, chorus, verse 2: after slide 0 comes slide 2.
    const o = e.hear({ recent: "down by the river of mercy i lay my burdens down", final: true, current: { id: "river", slide: 0, next: 2 }, follow: true, now: 1000 });
    expect(o).toMatchObject({ decision: "early", show: { id: "river", slide: 2 } });
  });
});
