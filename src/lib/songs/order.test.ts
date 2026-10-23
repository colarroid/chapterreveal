import { describe, expect, it } from "vitest";
import { BRIEF_MS, cleanOrder, isWritten, learnOrder, nextPosition, orderFromParts, partStarts, partsFromOrder, positionOf, sameWords, songParts, writtenOrder } from "./order";

describe("song order", () => {
  it("learns the order sung, chorus repeats and all", () => {
    // Verse 1, Chorus, Verse 2, Chorus, Bridge, Chorus: slides 0, 1, 2, 1, 3, 1.
    const at = (s: number) => s * 1000;
    const path = [0, 1, 2, 1, 3, 1].map((slide, i) => ({ slide, at: at(i * 20) }));
    expect(learnOrder(path, at(120))).toEqual([0, 1, 2, 1, 3, 1]);
  });

  it("drops slides up only for a moment (a slip, then corrected)", () => {
    const path = [
      { slide: 0, at: 0 },
      { slide: 3, at: 10_000 },
      { slide: 1, at: 10_000 + BRIEF_MS - 1 },
      { slide: 2, at: 30_000 },
    ];
    expect(learnOrder(path, 50_000)).toEqual([0, 1, 2]);
  });

  it("counts a slide put up twice in a row once", () => {
    const path = [0, 0, 1, 1, 2].map((slide, i) => ({ slide, at: i * 10_000 }));
    expect(learnOrder(path, 60_000)).toEqual([0, 1, 2]);
  });

  it("keeps nothing from too little singing", () => {
    expect(learnOrder([{ slide: 0, at: 0 }, { slide: 1, at: 10_000 }], 20_000)).toBeNull();
  });

  it("finds where a slide comes next in the order", () => {
    const order = [0, 1, 2, 1, 3, 1];
    expect(positionOf(order, 1, 0)).toBe(1);
    expect(positionOf(order, 1, 2)).toBe(3);
    expect(positionOf(order, 1, 4)).toBe(5);
    // Past the last chorus: back to the first.
    expect(positionOf(order, 1, 5)).toBe(1);
    expect(positionOf(order, 9, 0)).toBe(-1);
  });

  it("drops slides an edited song no longer has", () => {
    expect(cleanOrder([0, 1, 5, 1], 3)).toEqual([0, 1, 1]);
    expect(cleanOrder([7], 3)).toBeNull();
    expect(cleanOrder("nope", 3)).toBeNull();
  });

  it("knows the written order", () => {
    expect(writtenOrder(3)).toEqual([0, 1, 2]);
    expect(isWritten([0, 1, 2], 3)).toBe(true);
    expect(isWritten([0, 1, 1, 2], 3)).toBe(false);
  });
});

describe("song parts", () => {
  // Like a songbook song: no labels, the chorus written out each time.
  const C = ["Bless the Lord oh my soul", "Worship His holy name", "Sing like never before"];
  const songbook = [
    ...C,
    "The sun comes up", "It's a new day dawning",
    ...C,
    "You're rich in love", "And You're slow to anger",
    ...C,
    "Bless the Lord",
  ].map((text) => ({ text }));

  it("finds the chorus and verses of a song without labels", () => {
    const { parts, written } = songParts(songbook);
    expect(parts.map((p) => [p.name, p.slides.length, p.firstLine])).toEqual([
      ["Chorus", 3, "Bless the Lord oh my soul"],
      ["Verse 1", 2, "The sun comes up"],
      ["Verse 2", 2, "You're rich in love"],
      ["Verse 3", 1, "Bless the Lord"],
    ]);
    expect(written).toEqual([0, 1, 0, 2, 0, 3]);
  });

  it("splits a chorus sung twice in a row into two", () => {
    const { written } = songParts([...C, ...C, "A verse line"].map((text) => ({ text })));
    expect(written).toEqual([0, 0, 1]);
  });

  it("uses labels when the song has them", () => {
    const { parts, written } = songParts([
      { label: "Verse 1", text: "a" },
      { text: "b" },
      { label: "Chorus", text: "c" },
      { label: "Verse 2", text: "d" },
      { label: "Chorus", text: "c" },
    ]);
    expect(parts.map((p) => [p.name, p.slides])).toEqual([
      ["Verse 1", [0, 1]],
      ["Chorus", [2]],
      ["Verse 2", [3]],
    ]);
    expect(written).toEqual([0, 1, 2, 1]);
  });

  it("turns parts into slides and back", () => {
    const { parts } = songParts(songbook);
    const order = orderFromParts(parts, [0, 1, 0, 0, 3]);
    expect(order).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 0, 1, 2, 13]);
    expect(partsFromOrder(parts, order, songbook)).toEqual([0, 1, 0, 0, 3]);
    // The order as written, chorus copies and all, reads as parts too.
    expect(partsFromOrder(parts, songbook.map((_, i) => i), songbook)).toEqual([0, 1, 0, 2, 0, 3]);
    // Not made of whole parts (a slide on its own): can't be read as parts.
    expect(partsFromOrder(parts, [0, 3], songbook)).toBeNull();
  });
});

describe("a chorus sung once more", () => {
  const C = ["Bless the Lord oh my soul", "Worship His holy name", "Sing like never before"];
  const song = [...C, "Verse one a", "Verse one b", ...C, "Verse two a", "Verse two b", ...C].map((text) => ({ text }));
  const order = song.map((_, i) => i);

  it("stays in the same chorus, so the verse after it still comes next", () => {
    const starts = partStarts(song, order);
    // On the chorus's last slide (position 2), its first slide again: back to 0, not on to 5.
    expect(nextPosition(order, 0, 2, starts)).toBe(0);
    // Moving on as normal still goes forward.
    expect(nextPosition(order, 3, 2, starts)).toBe(3);
    // From the second chorus (positions 5 to 7), the chorus again stays there.
    expect(nextPosition(order, 5, 7, starts)).toBe(5);
    // …even when detection names the copy of that slide in another chorus.
    expect(nextPosition(order, 10, 7, starts, sameWords(song))).toBe(5);
  });
});
