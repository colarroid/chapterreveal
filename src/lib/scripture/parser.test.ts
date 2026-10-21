import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSlides, shapeOf, stepVerse, type Translation } from "./bible";
import { detect, detectWithCarry, formatRef, parseSearch, unfinishedTail, type BibleShape, type ParseContext } from "./parser";
import { tokenize } from "./tokenize";

const kjv: Translation = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../public/bibles/kjv.json"), "utf8"));
const bible = shapeOf(kjv);

/** Formatted references found in text. */
const refs = (text: string, ctx?: ParseContext) => detect(text, bible, ctx).detections.map((d) => formatRef(d.ref));

describe("tokenize", () => {
  it("folds spoken numbers", () => {
    const nums = (s: string) => tokenize(s).filter((t) => t.num !== undefined).map((t) => t.num);
    expect(nums("three sixteen")).toEqual([3, 16]);
    expect(nums("twenty three")).toEqual([23]);
    expect(nums("twenty-one")).toEqual([21]);
    expect(nums("one hundred and nineteen")).toEqual([119]);
    expect(nums("one hundred and five and six")).toEqual([105, 6]);
    expect(nums("a hundred")).toEqual([100]);
  });
});

describe("explicit references", () => {
  it.each([
    ["Turn with me to John 3:16.", "John 3:16"],
    ["John chapter three verse sixteen", "John 3:16"],
    ["John three sixteen", "John 3:16"],
    ["John chapter 3 and verse 16", "John 3:16"],
    ["Romans 8:28", "Romans 8:28"],
    ["Romans eight twenty eight", "Romans 8:28"],
    ["Psalm twenty three", "Psalm 23"],
    ["Psalms 23 verse 1", "Psalm 23:1"],
    ["Psalm one hundred and nineteen verse one hundred and five", "Psalm 119:105"],
    ["Psalm one nineteen", "Psalm 119"],
    ["first Corinthians thirteen verse four", "1 Corinthians 13:4"],
    ["1st Corinthians 13:4", "1 Corinthians 13:4"],
    ["second Timothy one seven", "2 Timothy 1:7"],
    ["first John one nine", "1 John 1:9"],
    ["third John verse two", "3 John 1:2"],
    ["Song of Solomon chapter two verse four", "Song of Solomon 2:4"],
    ["Jude 24", "Jude 1:24"],
    ["Philemon verse six", "Philemon 1:6"],
    ["Acts of the Apostles 2:38", "Acts 2:38"],
    ["Revelations 21 4", "Revelation 21:4"],
    ["Saint John 14 6", "John 14:6"],
    ["the book of Isaiah chapter 40 verse 31", "Isaiah 40:31"],
    ["Mathew 6:33", "Matthew 6:33"],
    ["John 316", "John 3:16"],
  ])("%s", (text, want) => {
    expect(refs(text)).toEqual([want]);
  });

  it("reads ranges", () => {
    expect(refs("John 3 verses 16 to 18")).toEqual(["John 3:16-18"]);
    expect(refs("John 3:16-18")).toEqual(["John 3:16-18"]);
    expect(refs("Matthew 5 verse 3 to verse 12")).toEqual(["Matthew 5:3-12"]);
    expect(refs("Isaiah 53 verses 4 through 6")).toEqual(["Isaiah 53:4-6"]);
  });

  it("reads lists", () => {
    expect(refs("Proverbs 3, 5 and 6")).toEqual(["Proverbs 3:5-6"]);
    expect(refs("Romans 8 verses 1 and 28")).toEqual(["Romans 8:1", "Romans 8:28"]);
  });

  it("finds several references in one sentence", () => {
    expect(refs("Look at Romans 8:28 and also 2 Corinthians 5:17")).toEqual(["Romans 8:28", "2 Corinthians 5:17"]);
    expect(refs("Romans 8, 2 Corinthians 5")).toEqual(["Romans 8", "2 Corinthians 5"]);
  });

  it("ignores book names used as ordinary words", () => {
    expect(refs("Mark my words, this is the job of every believer")).toEqual([]);
    expect(refs("John said we should go")).toEqual([]);
    expect(refs("these acts of kindness")).toEqual([]);
  });

  it("drops chapters and verses that do not exist", () => {
    expect(refs("Jude 3 chapter")).toEqual(["Jude 1:3"]);
    expect(refs("Revelation 23")).toEqual([]);
    // Digits the transcriber glued together are split when only that reading exists.
    expect(refs("Psalm 151")).toEqual(["Psalm 15:1"]);
    expect(refs("Romans 99")).toEqual([]);
    // John 3 has 36 verses: keep the chapter, drop the impossible verse.
    expect(refs("John 3:40")).toEqual(["John 3"]);
  });

  it("scores clear citations above loose ones", () => {
    const c = (t: string) => detect(t, bible).detections[0].confidence;
    expect(c("John 3:16")).toBeGreaterThan(c("John 3 16"));
    expect(c("Romans 8 28")).toBeGreaterThan(c("John 3"));
    expect(c("Numbers 6 24")).toBeLessThan(c("John 3 16"));
    expect(c("Romans 8:28")).toBeGreaterThan(c("Romans 8"));
  });

  it("reports where the reference sits in the text", () => {
    const text = "Turn with me to Romans 8:28 please";
    const d = detect(text, bible).detections[0];
    expect(text.slice(d.start, d.end)).toBe("Romans 8:28");
  });
});

describe("follow-ups", () => {
  const afterJohn3 = detect("John 3:16", bible).context;

  it("never gives a named book's impossible numbers to the book before it", () => {
    // 2 Peter has three chapters. Heard in a real service after Mark 13:4.
    const afterMark = detect("Mark chapter thirteen verse four", bible).context;
    expect(refs("second Peter chapter four verse three and KJV", afterMark)).toEqual([]);
    expect(refs("2 Peter 4:3", afterMark)).toEqual([]);
  });

  it("still follows on after a book is only mentioned in passing", () => {
    expect(refs("as John said, verse 17", afterJohn3)).toEqual(["John 3:17"]);
  });

  it("resolves verse-only follow-ups to the current chapter", () => {
    expect(refs("verse 17", afterJohn3)).toEqual(["John 3:17"]);
    expect(refs("go down to verse 20", afterJohn3)).toEqual(["John 3:20"]);
    expect(refs("the same chapter, verse 20", afterJohn3)).toEqual(["John 3:20"]);
    expect(refs("verses 17 to 19", afterJohn3)).toEqual(["John 3:17-19"]);
  });

  it("resolves chapter follow-ups to the current book", () => {
    expect(refs("chapter 4 verse 2", afterJohn3)).toEqual(["John 4:2"]);
  });

  it("follows within one piece of text", () => {
    expect(refs("Romans 12 verse 1. Now verse 2 says")).toEqual(["Romans 12:1", "Romans 12:2"]);
  });

  it("needs a reference first", () => {
    expect(refs("verse 17")).toEqual([]);
  });

  it("joins a book at the end of one segment to numbers at the start of the next", () => {
    const first = detect("Please turn with me to Romans", bible);
    expect(first.detections).toEqual([]);
    expect(first.context.pendingBook).toBe(43 + 1);
    expect(refs("chapter eight verse twenty eight", first.context)).toEqual(["Romans 8:28"]);
    expect(refs("8:28", first.context)).toEqual(["Romans 8:28"]);
  });
});

describe("manual search", () => {
  const s = (q: string) => {
    const r = parseSearch(q, bible);
    return r ? formatRef(r) : null;
  };
  it.each([
    ["Jn 3 16", "John 3:16"],
    ["jn3:16", "John 3:16"],
    ["1 cor 13:4-7", "1 Corinthians 13:4-7"],
    ["1cor 13 4", "1 Corinthians 13:4"],
    ["ps 23", "Psalm 23"],
    ["gen 1 1", "Genesis 1:1"],
    ["Prov 3:5, 6", "Proverbs 3:5-6"],
    ["rev 22 21", "Revelation 22:21"],
    ["ii kings 2 11", "2 Kings 2:11"],
    ["romans", "Romans 1"],
  ])("%s", (q, want) => {
    expect(s(q)).toBe(want);
  });
  it("returns null for nonsense", () => {
    expect(s("hello")).toBeNull();
  });
});

describe("slides and stepping", () => {
  it("keeps a short verse on one slide", () => {
    const slides = buildSlides(kjv, { book: 42, chapter: 3, verseStart: 16, verseEnd: 16 });
    expect(slides).toHaveLength(1);
    expect(slides[0].label).toBe("John 3:16");
  });

  it("splits a long verse into labelled parts", () => {
    // Esther 8:9 is the longest verse in the Bible.
    const slides = buildSlides(kjv, { book: 16, chapter: 8, verseStart: 9, verseEnd: 9 });
    expect(slides.length).toBeGreaterThan(1);
    expect(slides[0].label).toBe(`Esther 8:9 (1/${slides.length})`);
    expect(slides.map((s) => s.lines[0].text).join(" ")).toBe(kjv.books[16][7][8]);
  });

  it("groups a range into slides that each name their verses", () => {
    const slides = buildSlides(kjv, { book: 18, chapter: 23, verseStart: 1, verseEnd: 6 });
    expect(slides.length).toBeGreaterThan(1);
    expect(slides[0].label.startsWith("Psalm 23:1")).toBe(true);
    expect(slides.flatMap((s) => s.lines.map((l) => l.verse))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("steps across chapter ends", () => {
    expect(stepVerse(kjv, 42, 3, 36, 1)).toEqual({ book: 42, chapter: 4, verseStart: 1, verseEnd: 1 });
    expect(stepVerse(kjv, 42, 4, 1, -1)).toEqual({ book: 42, chapter: 3, verseStart: 36, verseEnd: 36 });
    expect(stepVerse(kjv, 0, 1, 1, -1)).toBeNull();
  });
});

describe("references split across two stretches of speech", () => {
  // Reads stretches one after another, as the live console does.
  const stream = (...stretches: string[]) => {
    let ctx: ParseContext = {};
    let carry: string | null = null;
    return stretches.map((text) => {
      const res = detectWithCarry(text, bible, ctx, carry);
      ctx = res.context;
      carry = unfinishedTail(carry ? `${carry} ${text}` : text);
      return res.detections.map((d) => formatRef(d.ref));
    });
  };

  it("joins a number cut at a pause (from a real service)", () => {
    const [first, second] = stream("We'll be declaring the word of God ehm in Psalm ninety", "one our psalm of protection");
    expect(first).toEqual(["Psalm 90"]);
    expect(second).toEqual(["Psalm 91"]);
  });

  it("joins a chapter and verse cut after 'verse'", () => {
    expect(stream("turn with me to John chapter three verse", "sixteen for God so loved")[1]).toEqual(["John 3:16"]);
  });

  it("joins a verse said after the chapter, at a pause (from a real service)", () => {
    expect(stream("Isaiah forty two", "nine.")[1]).toEqual(["Isaiah 42:9"]);
  });

  it("joins a reference cut twice (from a demo)", () => {
    expect(stream("Turn with me to the book of second", "Peter chapter three verse", "seven.")[2]).toEqual(["2 Peter 3:7"]);
  });

  it("leaves a stretch that ended cleanly alone", () => {
    expect(unfinishedTail("Read Romans eight.")).toBeNull();
    expect(unfinishedTail("God is good all the time")).toBeNull();
    expect(stream("Romans eight twenty eight.", "one more thing")[1]).toEqual([]);
  });

  it("doesn't report the same reference again from the carried words", () => {
    expect(stream("open to Genesis one verse one and", "let's pray")[1]).toEqual([]);
  });
});

describe("references not in the Bible", () => {
  const missing = (text: string) => detect(text, bible).missing.map((m) => [formatRef({ book: m.book, chapter: m.chapter, verseStart: m.verse }), m.note]);

  it("says when the chapter doesn't exist", () => {
    expect(missing("Turn with me to the book of second Peter chapter four verse seven.")).toEqual([["2 Peter 4:7", "2 Peter has 3 chapters."]]);
    expect(missing("Jude chapter two")).toEqual([["Jude 2", "Jude has 1 chapter."]]);
    expect(refs("second Peter chapter four verse seven")).toEqual([]);
  });

  it("says when the verse doesn't exist", () => {
    expect(missing("John chapter three verse forty")).toEqual([["John 3:40", "John 3 has 36 verses."]]);
  });

  it("is quiet for real references", () => {
    expect(missing("second Peter chapter three verse seven")).toEqual([]);
    expect(missing("John 3:16 and Psalm 119")).toEqual([]);
  });

  it("follows the reference across pauses, as in the demo", () => {
    let ctx: ParseContext = {};
    let carry: string | null = null;
    const found: string[] = [];
    for (const text of ["Hello, congregation. Turn with me to the book of second", "Peter chapter four verse", "seven."]) {
      const res = detectWithCarry(text, bible, ctx, carry);
      found.push(...res.missing.map((m) => formatRef({ book: m.book, chapter: m.chapter, verseStart: m.verse })));
      ctx = res.context;
      carry = unfinishedTail(carry ? `${carry} ${text}` : text);
    }
    expect(found.at(-1)).toBe("2 Peter 4:7");
  });
});

describe("Deuterocanonical books", () => {
  // The KJV's 66 books, then 14 Deuterocanonical ones of 60 verses a chapter (Sirach has 51 chapters).
  const withDeutero: BibleShape = {
    chapters: (b) => (b < 66 ? bible.chapters(b) : b === 70 ? 51 : b < 80 ? 16 : 0),
    verses: (b, c) => (b < 66 ? bible.verses(b, c) : 60),
  };
  const found = (text: string, shape: BibleShape) => detect(text, shape).detections.map((d) => formatRef(d.ref));

  it("are heard with a Bible that has them", () => {
    expect(found("turn to Sirach chapter three verse four", withDeutero)).toEqual(["Sirach 3:4"]);
    expect(found("Ecclesiasticus 2:1", withDeutero)).toEqual(["Sirach 2:1"]);
    expect(found("first Maccabees chapter two verse one", withDeutero)).toEqual(["1 Maccabees 2:1"]);
    expect(found("the book of Tobit chapter four verse fifteen", withDeutero)).toEqual(["Tobit 4:15"]);
    expect(found("Wisdom of Solomon chapter three verse one", withDeutero)).toEqual(["Wisdom of Solomon 3:1"]);
  });

  it("are just words with a 66-book Bible: nothing heard, no note", () => {
    for (const text of ["turn to Sirach chapter three verse four", "Judith chapter 3 verse 2", "wisdom chapter one verse five"]) {
      const res = detect(text, bible);
      expect(res.detections).toEqual([]);
      expect(res.missing).toEqual([]);
    }
  });

  it("leave the 66 books as they were", () => {
    expect(found("Esther 4:14", withDeutero)).toEqual(["Esther 4:14"]);
    expect(found("first Kings 3:5", withDeutero)).toEqual(["1 Kings 3:5"]);
    expect(found("Song of Songs 2:4", withDeutero)).toEqual(["Song of Solomon 2:4"]);
  });
});
