import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Translation } from "./bible";
import { VerseTextIndex } from "./verse-text";

const kjv: Translation = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/bibles/kjv.json"), "utf8"));
const PSALMS = 18;
let index: VerseTextIndex;
const ref = (h: { book: number; chapter: number; verse: number } | null) => (h ? `${h.book}:${h.chapter}:${h.verse}` : null);

beforeAll(async () => {
  const t0 = performance.now();
  index = await VerseTextIndex.build(kjv, Infinity);
  console.log(`built in ${Math.round(performance.now() - t0)} ms`);
});

describe("following a reading (Psalm 91 at a real service)", () => {
  // The congregation's lines as the transcriber heard them, mishearings and all.
  const LINES: [string, number][] = [
    ["Cause I dwell in the secret place of the most high. I shall abide under the shadow of the almighty.", 1],
    ["I will say of the Lord, he is my refuge and my fortress. My God in him will I trust.", 2],
    ["Surely he will deliver me from the snare of the fowler. And from the noise and pestilence.", 3],
    ["He will cover me with his feathers. And under his wings will I take", 4],
    ["I shall not be afraid of the terror by night. Nor of the arrow that flies by day", 5],
    ["For he shall give his angels charge over me. To keep me in all my ways.", 11],
    ["I shall tread upon the lion and the cobra. The young lion and the serpent, I will trample underfoot.", 13],
    // Personalised: "because I have set my love upon him" for "because he hath set his love upon me".
    ["Because I have set my love upon him. He will deliver me. He will set me on high.", 14],
    ["Because I have known his name. I will call upon him. And he will answer me. He will be with me in trouble.", 15],
  ];

  it.each(LINES)("%s -> verse %i", (line, verse) => {
    const hit = index.match(line, { book: PSALMS, chapter: 91 });
    expect(ref(hit)).toBe(`${PSALMS}:91:${verse}`);
    expect(hit?.confident).toBe(true);
  });
});

describe("scripture quoted without a reference (same service)", () => {
  const QUOTES: [string, string][] = [
    ["The Bible says the blood of Jesus speaketh better things than the blood of Abel", "57:12:24"], // Hebrews 12:24
    ["have not given you the spirit of fear. But the power of love and a sound mind.", "54:1:7"], // 2 Timothy 1:7
    ["Far above principalities and powers. Above every name that has been named not only in this world, but that is to come", "48:1:21"], // Ephesians 1:21
  ];
  it.each(QUOTES)("%s", (line, want) => {
    const hit = index.match(line);
    expect(ref(hit)).toBe(want);
  });

  it("finds nothing in ordinary preaching", () => {
    const hit = index.match("I want you to know that God has heard you and I want you to say father I thank you");
    expect(hit?.confident ?? false).toBe(false);
  });
});
