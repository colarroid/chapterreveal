import { describe, expect, it } from "vitest";
import { cleanSlides, needsCleaning } from "./cleanup";

describe("song cleanup", () => {
  it("splits a crammed slide at typed headings and into two-line slides", () => {
    const crammed = [
      "Lord You are(You are)",
      "The song that I sing",
      "bridge",
      "Ooooh",
      "(Echo line)",
      "Eh he-he-he",
      "chorus",
      "Sing it again (Sing it)",
      "Sing it again",
      "Sing it again",
    ].join("\n");
    expect(cleanSlides([{ text: crammed }])).toEqual([
      { text: "Lord You are(You are)\nThe song that I sing" },
      { label: "Bridge", text: "Ooooh\n(Echo line)\nEh he-he-he" },
      { label: "Chorus", text: "Sing it again (Sing it)\nSing it again\nSing it again" },
    ]);
  });

  it("keeps sensible slides exactly as they are", () => {
    const slides = [{ text: "You are\nThe air that I breathe" }, { label: "Chorus", text: "Light of my life\nAgam enye Gi ekeleeeee" }];
    expect(cleanSlides(slides)).toEqual(slides);
    expect(needsCleaning(slides)).toBe(false);
  });

  it("drops repeat marks and brings back a named part", () => {
    const r = cleanSlides([
      { text: "Chorus:\nHoly holy\nHoly is the Lord (x2)" },
      { text: "Verse 2\nNew words here" },
      { text: "Repeat chorus" },
      { text: "x2" },
    ]);
    expect(r).toEqual([
      { label: "Chorus", text: "Holy holy\nHoly is the Lord" },
      { label: "Verse 2", text: "New words here" },
      { label: "Chorus", text: "Holy holy\nHoly is the Lord" },
    ]);
  });

  it("splits five long lines without leaving one alone", () => {
    const r = cleanSlides([{ text: "a\nb\nc\nd\ne" }]);
    expect(r.map((s) => s.text.split("\n").length)).toEqual([2, 3]);
  });

  it("doesn't mistake lyrics that start with a section word for headings", () => {
    const slides = [{ text: "Chorus of angels singing\nBridge over troubled water" }];
    expect(cleanSlides(slides)).toEqual(slides);
  });
});
