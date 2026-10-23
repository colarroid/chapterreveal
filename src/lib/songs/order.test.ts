import { describe, expect, it } from "vitest";
import { BRIEF_MS, cleanOrder, isWritten, learnOrder, positionOf, writtenOrder } from "./order";

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
