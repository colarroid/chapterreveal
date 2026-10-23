import { describe, expect, it } from "vitest";
import { parsePastedLyrics } from "./paste";

// Shaped like a copy from a lyrics site; the words are made up.
const FROM_SITE = `12 Contributors
Brother Sam - Morning Light Lyrics
[Verse 1]
When the morning light is breaking
And the shadows flee away
I will lift my eyes to heaven
I will sing a song today

[Chorus: Brother Sam]
Morning light (x2)
You are my morning light

[Verse 2]
When the evening comes upon me
You are near

[Chorus]

Bridge
Shine on me, shine on me
Shine on me, shine on me
Shine on me
You might also like
Written by: Sam Ade
Source: Musixmatch
3Embed`;

describe("pasted lyrics", () => {
  const r = parsePastedLyrics(FROM_SITE);

  it("finds the title and author, and drops the site text", () => {
    expect(r.title).toBe("Morning Light");
    expect(r.author).toBe("Brother Sam");
    expect(r.slides.map((s) => s.text).join(" ")).not.toMatch(/Contributors|Embed|You might|Musixmatch/);
  });

  it("labels parts and splits them into two-line slides", () => {
    expect(r.slides.slice(0, 2)).toEqual([
      { label: "Verse 1", text: "When the morning light is breaking\nAnd the shadows flee away" },
      { text: "I will lift my eyes to heaven\nI will sing a song today" },
    ]);
    // "(x2)" is gone.
    expect(r.slides[2]).toEqual({ label: "Chorus", text: "Morning light\nYou are my morning light" });
  });

  it("brings back a chorus that is only named", () => {
    const choruses = r.slides.filter((s) => s.label === "Chorus");
    expect(choruses).toHaveLength(2);
    expect(choruses[1].text).toBe(choruses[0].text);
  });

  it("doesn't leave one line alone on the last slide", () => {
    // Three lines: one slide of three, not two plus one.
    const bridge = r.slides.filter((s, i) => i >= r.slides.findIndex((x) => x.label === "Bridge"));
    expect(bridge.map((s) => s.text.split("\n").length)).toEqual([3]);
    const five = parsePastedLyrics("a\nb\nc\nd\ne").slides;
    expect(five.map((s) => s.text.split("\n").length)).toEqual([2, 3]);
  });

  it("handles 'Verse 2:', '(Chorus)' and 'Repeat chorus' headings", () => {
    const s = parsePastedLyrics("Verse 1:\nOne\nTwo\n\n(Chorus)\nThree\nFour\n\nVerse 2:\nFive\n\nRepeat chorus").slides;
    expect(s.map((x) => x.label ?? "")).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus"]);
    expect(s[3].text).toBe("Three\nFour");
  });

  it("keeps plain lyrics as they are, splitting on blank lines", () => {
    const s = parsePastedLyrics("Line one\nLine two\n\nLine three").slides;
    expect(s).toEqual([{ text: "Line one\nLine two" }, { text: "Line three" }]);
  });
});
