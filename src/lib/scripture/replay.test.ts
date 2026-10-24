import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { shapeOf, type Translation } from "./bible";
import { replayScripture, replayTranscript, type ReplaySegment, type ShownVerse } from "./replay";

const kjv: Translation = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/bibles/kjv.json"), "utf8"));
const bible = shapeOf(kjv);

const T0 = Date.parse("2026-10-18T09:00:00Z");
const at = (ms: number) => new Date(T0 + ms).toISOString();
const seg = (seq: number, start: number, text: string): ReplaySegment => ({ seq, start_ms: start, end_ms: start + 4000, text });
const verse = (label: string, book: number, chapter: number, v: number, source: ShownVerse["source"], ms: number): ShownVerse => ({
  label, book, chapter, verse_start: v, verse_end: v, source, shown_at: at(ms),
});

const segments = [
  seg(1, 0, "Good morning church. Turn with me to John chapter three verse sixteen."),
  seg(2, 10_000, "For God so loved the world."),
  seg(3, 60_000, "Now Psalm ninety"),
  seg(4, 64_000, "one, our psalm of protection."),
  seg(5, 120_000, "And Paul says to the Philippians, rejoice."),
  seg(6, 200_000, "Look at Romans eight twenty eight as well."),
];

describe("scripture replay", () => {
  it("hears the transcript the way the console did, pauses included", () => {
    expect(replayTranscript(segments, bible).map((h) => `${h.seq}:${h.label}`)).toEqual(["1:John 3:16", "3:Psalm 90", "4:Psalm 91", "6:Romans 8:28"]);
  });

  it("scores what the team showed against what is heard today", () => {
    const shown = [
      verse("John 3:16", 42, 3, 16, "detected", 6000),
      verse("Psalm 91:1", 18, 91, 1, "detected", 70_000),
      // Found by hand: the parser hears nothing in "Paul says to the Philippians".
      verse("Philippians 4:4", 49, 4, 4, "search", 140_000),
      // Stepped on from John 3:16: neither a hit nor a miss.
      verse("John 3:17", 42, 3, 17, "step", 20_000),
    ];
    const r = replayScripture(segments, shown, at(0), bible);
    expect(r.heard).toBe(4);
    expect(r.shownFromHearing).toBe(2);
    expect(r.stillHeard).toBe(2);
    expect(r.lost).toEqual([]);
    expect(r.byHand).toHaveLength(1);
    expect(r.byHand[0]).toMatchObject({ label: "Philippians 4:4", heardNow: false });
    expect(r.byHand[0].heard).toContain("Paul says to the Philippians");
    // Romans 8:28 was heard and never shown.
    expect(r.unused.map((u) => u.label)).toEqual(["Romans 8:28"]);
  });

  it("reports a verse shown from hearing that today's parser no longer hears", () => {
    const shown = [verse("Hebrews 11:1", 57, 11, 1, "detected", 30_000)];
    const r = replayScripture(segments, shown, at(0), bible);
    expect(r.lost.map((l) => l.label)).toEqual(["Hebrews 11:1"]);
  });

  it("counts a verse shown by hand as heard now when the parser finds it", () => {
    const shown = [verse("Romans 8:28", 44, 8, 28, "search", 210_000)];
    const r = replayScripture(segments, shown, at(0), bible);
    expect(r.byHand[0].heardNow).toBe(true);
    // Only Romans was shown: John 3:16 was heard and never put up.
    expect(r.unused.map((u) => u.label)).toEqual(["John 3:16"]);
  });
});
