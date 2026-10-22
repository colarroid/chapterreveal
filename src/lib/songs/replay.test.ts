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
    slides: [{ text: "High on the mountain of glory\nThe trumpets sound for you" }, { text: "Glory glory to the king of kings" }],
  },
]);

const at = (s: number) => new Date(Date.UTC(2026, 9, 25, 10, 0, s)).toISOString();
const line = (s: number, heard: string): LoggedEvent => ({ at: at(s), kind: "heard", heard, decision: null, song_id: null, slide: null });
const shown = (s: number, id: string, slide: number, decision = "operator"): LoggedEvent => ({ at: at(s), kind: "shown", heard: null, decision, song_id: id, slide });

describe("replay", () => {
  it("scores a service where detection follows the team", () => {
    const r = replay(library, [
      shown(0, "river", 0),
      line(2, "down by the river of mercy i lay my burdens down"),
      shown(8, "river", 1),
      line(9, "every morning brand new your kindness follows me"),
      shown(20, "mountain", 0),
      line(21, "high on the mountain of glory the trumpets sound for you"),
      line(26, "glory glory to the king of kings"),
    ]);
    // From one song to the next it waits for the new one to be clear (a
    // line or two), so the first mountain line still has the river up.
    expect(r).toMatchObject({ lines: 4, checked: 4, sameSong: 3, wrongShows: 0 });
    expect(r.found).toEqual([
      { song_id: "river", seconds: 0 },
      { song_id: "mountain", seconds: 5 },
    ]);
  });

  it("counts a song put up that the team didn't have", () => {
    const r = replay(library, [shown(0, "mountain", 0), line(2, "down by the river of mercy i lay my burdens down")]);
    expect(r).toMatchObject({ autoShows: 1, wrongShows: 1, sameSong: 0 });
  });

  it("trusts the operator's correction over the automatic slide it replaced", () => {
    const r = replay(library, [
      shown(0, "river", 0, "auto"),
      shown(3, "mountain", 0, "operator"),
      line(4, "high on the mountain of glory the trumpets sound for you"),
    ]);
    expect(r).toMatchObject({ checked: 1, sameSong: 1, wrongShows: 0 });
  });

  it("lets the team be a few seconds behind the singer", () => {
    const r = replay(library, [line(1, "down by the river of mercy i lay my burdens down"), shown(6, "river", 0)]);
    expect(r).toMatchObject({ checked: 1, sameSong: 1 });
  });
});
