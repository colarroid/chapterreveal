import { describe, expect, it } from "vitest";
import { cleanTakeDown, isReading, versePhrases } from "./take-down";

const john316 = versePhrases([
  { text: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life." },
]);

describe("isReading", () => {
  it("hears the verse being read", () => {
    expect(isReading(john316, "turn with me, for God so loved the world that he gave")).toBe(true);
  });

  it("hears it read in today's words", () => {
    expect(isReading(john316, "that whosoever believes in him should not perish")).toBe(true);
  });

  it("only looks at the latest words", () => {
    const long = "for God so loved the world that he gave " + "and so church we need to understand grace today ".repeat(5);
    expect(isReading(john316, long)).toBe(false);
  });

  it("doesn't mistake preaching about it for reading it", () => {
    expect(isReading(john316, "God loves you, church. He gave everything so that you could live")).toBe(false);
    expect(isReading(john316, "the world will tell you otherwise")).toBe(false);
  });

  it("does nothing without a verse", () => {
    expect(isReading(new Set(), "for God so loved the world")).toBe(false);
  });
});

describe("cleanTakeDown", () => {
  it("defaults to when the preacher moves on, after 45 seconds", () => {
    expect(cleanTakeDown(undefined)).toEqual({ mode: "moves_on", seconds: 45 });
    expect(cleanTakeDown({ take_down: "sometimes", take_down_seconds: "x" })).toEqual({ mode: "moves_on", seconds: 45 });
  });

  it("keeps a valid choice and bounds the wait", () => {
    expect(cleanTakeDown({ take_down: "time", take_down_seconds: 90 })).toEqual({ mode: "time", seconds: 90 });
    expect(cleanTakeDown({ take_down: "manual", take_down_seconds: 2 })).toEqual({ mode: "manual", seconds: 10 });
    expect(cleanTakeDown({ take_down_seconds: 5000 }).seconds).toBe(600);
  });
});
