import { describe, expect, it } from "vitest";
import { SongIndex, soundKey, words } from "./matcher";

// Made-up lyrics: the matcher cares about word patterns, not real songs.
const LIBRARY = new SongIndex([
  {
    id: "a",
    title: "River of Mercy",
    slides: [
      { text: "Down by the river of mercy\nI lay my burdens down" },
      { text: "Every morning brand new\nYour kindness follows me" },
      { label: "Chorus", text: "I love you Lord\nI lift my voice to you" },
    ],
  },
  {
    id: "b",
    title: "Mountain Song",
    slides: [
      { text: "High on the mountain of glory\nThe trumpets sound for you" },
      { label: "Chorus", text: "I love you Lord\nI lift my voice to you" },
    ],
  },
  { id: "c", title: "Oluwa", slides: [{ text: "Olúwa ṣeun o\nỌba mi ṣeun o" }] },
]);

describe("song matching", () => {
  it("normalises words: accents, case, apostrophes", () => {
    expect(words("Olúwa ṣeun, F'Olorun!")).toEqual(["oluwa", "seun", "folorun"]);
  });

  it("finds the song and slide from a sung line, even with a wrong word", () => {
    const m = LIBRARY.match("every morning brand new your kindest follows me");
    expect(m).toMatchObject({ song: 0, slide: 1, confident: true });
  });

  it("matches Yoruba sung without the accents", () => {
    expect(LIBRARY.match("oluwa seun o oba mi seun o")).toMatchObject({ song: 2, slide: 0 });
  });

  it("keeps a shared chorus on the song being sung", () => {
    const m = LIBRARY.match("i love you lord i lift my voice to you", { song: 1, slide: 0 });
    expect(m).toMatchObject({ song: 1, slide: 1 });
  });

  it("isn't confident about a chorus two songs share, with nothing on screen", () => {
    expect(LIBRARY.match("i love you lord i lift my voice to you")?.confident).toBe(false);
  });

  it("folds held notes", () => {
    expect(words("Ekeleeeee Lorddd")).toEqual(["ekele", "lord"]);
  });

  it("gives sound-alike words the same key", () => {
    expect(soundKey("breed")).toBe(soundKey("breathe"));
    expect(soundKey("kindness")).toBe(soundKey("kindnes"));
    expect(soundKey("mercy")).not.toBe(soundKey("morning"));
  });

  it("finds a line sung with several words misheard", () => {
    // "brand new" -> "bran knew", "follows" -> "fallows"
    expect(LIBRARY.match("every morning bran knew your kindness fallows me")).toMatchObject({ song: 0, slide: 1 });
  });

  it("follows the song on screen from a fragment two songs share", () => {
    // Ambiguous on its own (both choruses), so not confident without context…
    expect(LIBRARY.match("lift my voice")?.confident).toBe(false);
    // …but with Mountain Song on screen, it moves to its chorus.
    expect(LIBRARY.match("lift my voice", { song: 1, slide: 0 })).toMatchObject({ song: 1, slide: 1, confident: true });
  });

  it("tells songs apart by the order their lines are sung in", () => {
    // The same two lines in both songs, in opposite orders.
    const twoWays = new SongIndex([
      {
        id: "p",
        title: "P",
        slides: [{ text: "morning star arise and shine" }, { text: "rivers of living water flow" }, { text: "carry me across the jordan valley tonight" }],
      },
      {
        id: "q",
        title: "Q",
        slides: [{ text: "rivers of living water flow" }, { text: "morning star arise and shine" }, { text: "seven golden lamps are burning by the throne" }],
      },
    ]);
    const m = twoWays.match("morning star arise and shine rivers of living water flow");
    expect(m).toMatchObject({ song: 0, slide: 1, confident: true });
    expect(m?.candidates.map((c) => c.song)).toEqual([0, 1]);
  });

  it("puts a repeated chorus on the copy just ahead, not back at the first", () => {
    const repeats = new SongIndex([
      {
        id: "r",
        title: "R",
        slides: [
          { text: "verse one about the morning light" },
          { label: "Chorus", text: "we lift your name on high forever" },
          { text: "verse two about the evening shade" },
          { label: "Chorus", text: "we lift your name on high forever" },
        ],
      },
    ]);
    expect(repeats.match("we lift your name on high forever", { song: 0, slide: 2 })).toMatchObject({ slide: 3 });
    expect(repeats.match("we lift your name on high forever", { song: 0, slide: 0 })).toMatchObject({ slide: 1 });
  });

  it("follows a locked song through a chorus other songs share", () => {
    expect(LIBRARY.match("i love you lord i lift my voice to you", null, { only: 0 })).toMatchObject({ song: 0, slide: 2, confident: true });
  });

  it("lets usage break a tie, without deciding on its own", () => {
    const m = LIBRARY.match("i love you lord i lift my voice to you", null, { prior: (s) => (s === 1 ? 1.3 : 1) });
    expect(m).toMatchObject({ song: 1, confident: false });
  });

  it("knows when the last line of a slide is being sung", () => {
    expect(LIBRARY.atLastLine(0, 1, "every morning brand new your kindness follows me")).toBe(true);
    expect(LIBRARY.atLastLine(0, 1, "every morning brand new")).toBe(false);
    expect(LIBRARY.atLastLine(2, 0, "oba mi seun o")).toBe(true);
    // One-line slides never count: going early would skip the line itself.
    const single = new SongIndex([{ id: "s", title: "S", slides: [{ text: "holy holy holy is the lamb" }] }]);
    expect(single.atLastLine(0, 0, "holy is the lamb")).toBe(false);
  });

  it("ignores speech that matches nothing", () => {
    expect(LIBRARY.match("please be seated and turn to your neighbour")).toBeNull();
  });
});
