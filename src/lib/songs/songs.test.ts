import { existsSync, readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { pairSingleLines, slidesToText, textToSlides } from "./songs";
import { LockedSongbookError, parseRelaxedJson, readSongbookFile, readSongbookJson } from "./videopsalm";

const SONGBOOK = `﻿{Songs:[{Guid:"a",Verses:[{
Text:"First line"},{ID:2,
Text:"Second <s769>(Might)</s> line"},{Tag:1,ID:0,
Text:"Chorus one
Chorus two"}],
Text:" My Song
"},{Guid:"b",Verses:[{
Text:"First line"},{ID:2,
Text:"Second <s769>(Might)</s> line"},{Tag:1,ID:0,
Text:"Chorus one
Chorus two"}],
Text:" My Song
"},{Guid:"c",Verses:[{Text:"  "}],Text:"Empty"},{Guid:"d",Verses:[{Text:"Only words"}]}],Text:"Test book"}`;

describe("VideoPsalm songbooks", () => {
  it("reads the relaxed JSON", () => {
    expect(parseRelaxedJson('{a:"x\ny",b:[{c:1}]}')).toEqual({ a: "x\ny", b: [{ c: 1 }] });
  });

  it("reads songs, labels parts, strips styling, drops empties and duplicates", () => {
    const r = readSongbookJson(SONGBOOK, "test.json");
    expect(r.name).toBe("Test book");
    expect(r.empty).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.songs).toHaveLength(2);
    expect(r.songs[0].title).toBe("My Song");
    expect(r.songs[0].slides).toEqual([
      { text: "First line" },
      { text: "Second (Might) line" },
      { label: "Chorus", text: "Chorus one\nChorus two" },
    ]);
    // No title: the first line stands in.
    expect(r.songs[1].title).toBe("Only words");
  });

  it("opens a .vpc zip and refuses an encrypted one", async () => {
    const json = Buffer.from(SONGBOOK, "utf8");
    const data = deflateRawSync(json);
    const name = Buffer.from("Test.json");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(json.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(json.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42);
    const cdStart = local.length + name.length + data.length;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length + name.length, 12);
    end.writeUInt32LE(cdStart, 16);
    const zip = Buffer.concat([local, name, data, central, name, end]);
    expect((await readSongbookFile("Test.vpc", new Uint8Array(zip))).songs).toHaveLength(2);

    const locked = Buffer.from(zip);
    locked.writeUInt16LE(1, cdStart + 8); // the "encrypted" flag
    await expect(readSongbookFile("Locked.vpc", new Uint8Array(locked))).rejects.toBeInstanceOf(LockedSongbookError);
  });
});

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

  it("pairs one-line slides without crossing into a new part", () => {
    expect(pairSingleLines([{ text: "a" }, { text: "b" }, { text: "c" }, { label: "Chorus", text: "d" }, { text: "e" }])).toEqual([
      { text: "a\nb" },
      { text: "c" },
      { label: "Chorus", text: "d\ne" },
    ]);
  });
});

// The user's own VideoPsalm folder, when it's on this computer (never committed).
const DIR = "VIDEOPSALM 1/SongBooks";
describe.skipIf(!existsSync(DIR))("real VideoPsalm files", () => {
  const read = (f: string) => readSongbookFile(f, new Uint8Array(readFileSync(`${DIR}/${f}`)));

  it("reads the CLC songbook", async () => {
    const r = await read("CLC 1.json");
    expect(r.songs.length).toBeGreaterThan(2000);
    expect(r.songs.every((s) => s.title && s.slides.length)).toBe(true);
  });

  it("opens unlocked .vpc songbooks and refuses the locked one", async () => {
    expect((await read("CONFESSION.vpc")).songs.length).toBeGreaterThan(0);
    await expect(read("English - Worship.vpc")).rejects.toBeInstanceOf(LockedSongbookError);
  });
});
