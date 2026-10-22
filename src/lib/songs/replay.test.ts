import { describe, expect, it } from "vitest";
import { SongIndex } from "./matcher";
import { replay, type LoggedEvent } from "./replay";

const library = new SongIndex([
  {
    id: "river",
    title: "River of Mercy",
    slides: [{ text: "Down by the river of mercy\nI lay my burdens down" }, { text: "Every morning brand new\nYour kindness follows me" }],
  },
  {
    id: "mountain",
    title: "Mountain Song",
    slides: [{ text: "High on the mountain of glory\nThe trumpets sound for you" }, { text: "Glory glory to the king of kings\nForever and ever" }],
  },
]);

const at = (s: number) => new Date(Date.UTC(2026, 9, 25, 10, 0, s)).toISOString();
// Each logged line carries the last couple of lines heard, as the console logs it.
const line = (s: number, heard: string): LoggedEvent => ({ at: at(s), kind: "heard", heard, decision: null, song_id: null, slide: null });
const shown = (s: number, id: string, slide: number, decision = "operator"): LoggedEvent => ({ at: at(s), kind: "shown", heard: null, decision, song_id: id, slide });

const RIVER_1 = "down by the river of mercy i lay my burdens down";
const RIVER_2 = "i lay my burdens down every morning brand new your kindness follows me";
const MOUNTAIN_1 = "high on the mountain of glory the trumpets sound for you";
const MOUNTAIN_2 = "the trumpets sound for you glory glory to the king of kings";

describe("replay", () => {
  it("scores a service where detection follows the team", () => {
    const r = replay(library, [
      shown(0, "river", 0),
      line(2, RIVER_1),
      line(6, RIVER_2),
      shown(7, "river", 1),
      shown(20, "mountain", 0),
      line(21, MOUNTAIN_1),
      line(25, MOUNTAIN_2),
    ]);
    // A new song goes up from its second line, never its first.
    expect(r).toMatchObject({ lines: 4, checked: 4, sameSong: 2, wrongShows: 0 });
    expect(r.found).toEqual([
      { song_id: "river", seconds: 4 },
      { song_id: "mountain", seconds: 4 },
    ]);
  });

  it("counts a song put up that the team didn't have", () => {
    const r = replay(library, [shown(0, "mountain", 0), line(2, RIVER_1), line(6, RIVER_2)]);
    expect(r).toMatchObject({ autoShows: 1, wrongShows: 1, sameSong: 0 });
  });

  it("trusts the operator's correction over the automatic slide it replaced", () => {
    const r = replay(library, [shown(0, "river", 0, "auto"), shown(3, "mountain", 0, "operator"), line(4, MOUNTAIN_1), line(8, MOUNTAIN_2)]);
    expect(r).toMatchObject({ checked: 2, sameSong: 1, wrongShows: 0 });
  });

  it("lets the team be a few seconds behind the singer", () => {
    const r = replay(library, [line(1, RIVER_1), line(4, RIVER_2), shown(6, "river", 0)]);
    expect(r).toMatchObject({ checked: 2, sameSong: 1 });
  });
});

describe("replay, a song marked wrong", () => {
  it("doesn't count the automatic slide the operator marked wrong as what was meant", () => {
    const r = replay(library, [shown(0, "mountain", 0, "auto"), shown(30, "mountain", 0, "rejected"), line(31, RIVER_1), line(35, RIVER_2)]);
    // Nothing was meant to be up: these lines can't be checked.
    expect(r).toMatchObject({ checked: 0 });
  });
});
