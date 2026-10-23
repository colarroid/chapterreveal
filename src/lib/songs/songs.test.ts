import { describe, expect, it } from "vitest";
import { slidesToText, textToSlides } from "./songs";

describe("editor text", () => {
  it("round-trips slides with labels", () => {
    const slides = [{ label: "Verse 1", text: "a\nb" }, { text: "c" }, { label: "Chorus", text: "d" }];
    expect(textToSlides(slidesToText(slides))).toEqual(slides);
  });

  it("splits on blank lines and ignores extra ones", () => {
    expect(textToSlides("one\ntwo\n\n\n\n[Chorus]\nthree\r\n\r\nfour  ")).toEqual([
      { text: "one\ntwo" },
      { label: "Chorus", text: "three" },
      { text: "four" },
    ]);
  });
});
