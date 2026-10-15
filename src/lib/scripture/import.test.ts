import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectFormat, importBible, resolveBook } from "./import";

const kjv = JSON.parse(readFileSync("public/bibles/kjv.json", "utf8")) as { books: string[][][] };
const shape = kjv.books.map((chs) => chs.map((vs) => vs.length));
const read = (name: string, text: string) => importBible([{ name, text }], shape);

const GEN = 0, PS = 18, JOHN = 42, JUDE = 64;

describe("book names", () => {
  it("reads names, codes and numbers", () => {
    expect(resolveBook("Genesis")).toBe(GEN);
    expect(resolveBook("JHN")).toBe(JOHN);
    expect(resolveBook("1Cor")).toBe(45);
    expect(resolveBook("1 Corinthians")).toBe(45);
    expect(resolveBook("I Corinthians")).toBe(45);
    expect(resolveBook("Psalm")).toBe(PS);
    expect(resolveBook("Song of Songs")).toBe(21);
    expect(resolveBook("66")).toBe(65);
    expect(resolveBook("Hebrews")).toBe(57);
    expect(resolveBook("Tobit")).toBeNull();
  });
});

describe("formats", () => {
  it("reads USFM, dropping footnotes, word markup and headings", () => {
    const usfm = String.raw`\id JHN Test
\c 3
\s1 Jesus and Nicodemus
\p
\v 16 For God so \w loved|strong="G25"\w* the world,\f + \fr 3:16 \ft Or only begotten\f* that he gave
\q1 his only Son.
\v 17 For God sent not his Son.`;
    const r = read("43JHN.usfm", usfm);
    expect(r.formats).toEqual(["usfm"]);
    expect(r.books[JOHN][2][15]).toBe("For God so loved the world, that he gave his only Son.");
    expect(r.books[JOHN][2][16]).toBe("For God sent not his Son.");
  });

  it("reads OSIS with contained and milestone verses", () => {
    const contained = `<osis><osisText><title>Test Bible</title><verse osisID="Gen.1.1">In the <note>a note</note>beginning.</verse></osisText></osis>`;
    const milestone = `<osis><osisText><verse sID="Gen.1.2" osisID="Gen.1.2"/>And the earth &amp; sea.<verse eID="Gen.1.2"/></osisText></osis>`;
    const r = importBible([{ name: "a.xml", text: contained }, { name: "b.xml", text: milestone }], shape);
    expect(r.books[GEN][0][0]).toBe("In the beginning.");
    expect(r.books[GEN][0][1]).toBe("And the earth & sea.");
    expect(r.title).toBe("Test Bible");
  });

  it("reads Zefania XML", () => {
    const xml = `<XMLBIBLE biblename="Bibeli Mimo"><BIBLEBOOK bnumber="19" bname="Psalms"><CHAPTER cnumber="23"><VERS vnumber="1">OLUWA ni oluso-agutan mi.</VERS></CHAPTER></BIBLEBOOK></XMLBIBLE>`;
    const r = read("yoruba.xml", xml);
    expect(r.formats).toEqual(["zefania"]);
    expect(r.books[PS][22][0]).toBe("OLUWA ni oluso-agutan mi.");
    expect(r.title).toBe("Bibeli Mimo");
  });

  it("reads CSV with quoted commas, with and without a header", () => {
    const withHeader = `Book,Chapter,Verse,Text\nJohn,3,16,"For God so loved the world, that he gave"\n`;
    expect(read("b.csv", withHeader).books[JOHN][2][15]).toBe("For God so loved the world, that he gave");
    const noHeader = `43,3,16,"For God so loved"\n`;
    expect(read("b.csv", noHeader).books[JOHN][2][15]).toBe("For God so loved");
  });

  it("reads TSV and one-verse-per-line text", () => {
    expect(read("b.tsv", "Jude\t1\t25\tTo the only wise God").books[JUDE][0][24]).toBe("To the only wise God");
    expect(read("b.txt", "1 John 4:8 God is love.\nGenesis 1:1 In the beginning.").books[61][3][7]).toBe("God is love.");
  });

  it("reads the app's own JSON and a flat verse list", () => {
    expect(read("k.json", JSON.stringify(kjv)).verses).toBeGreaterThan(31000);
    const flat = JSON.stringify([{ book: "Genesis", chapter: 1, verse: 1, text: "In the beginning" }]);
    expect(read("f.json", flat).books[GEN][0][0]).toBe("In the beginning");
  });

  it("detects formats from content", () => {
    expect(detectFormat("x.txt", "\\id GEN")).toBe("usfm");
    expect(detectFormat("x.xml", '<?xml version="1.0"?><osis>')).toBe("osis");
    expect(detectFormat("x.xml", "<XMLBIBLE>")).toBe("zefania");
  });
});

describe("shape", () => {
  it("keeps every KJV chapter and reports what is missing", () => {
    const r = read("b.txt", "John 3:16 For God so loved the world.");
    expect(r.books).toHaveLength(66);
    expect(r.books[GEN]).toHaveLength(50);
    expect(r.books[GEN][0]).toHaveLength(31);
    expect(r.booksFound).toBe(1);
    expect(r.missingBooks).toHaveLength(65);
    expect(r.gaps).toBe(31101);
  });

  it("round-trips the KJV with no gaps", () => {
    const r = read("k.json", JSON.stringify(kjv));
    expect(r.booksFound).toBe(66);
    expect(r.gaps).toBe(0);
    expect(r.books[JOHN][2][15]).toBe(kjv.books[JOHN][2][15]);
  });

  it("lists book names it could not match", () => {
    expect(read("b.csv", "Tobit,1,1,Text").unknownBooks).toEqual(["Tobit"]);
  });
});
