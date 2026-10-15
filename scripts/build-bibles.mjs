// Builds the public-domain translations into public/bibles/<id>.json, in the
// same shape as kjv.json: { id, name, books: string[][][] } indexed
// [book][chapter - 1][verse - 1]. Run once: npm run bible:all
//
// Source: github.com/scrollmapper/bible_databases (formats/json). Every verse
// is placed by its own number, not its position, because some translations
// leave verses out (most modern ones omit a few the KJV has). A missing verse
// becomes "" so every later verse keeps its number.
import fs from "node:fs";
import path from "node:path";

const SOURCES = [
  { id: "bsb", file: "BSB", name: "Berean Standard Bible" },
  { id: "nheb", file: "NHEB", name: "New Heart English Bible" },
  { id: "asv", file: "ASV", name: "American Standard Version" },
  { id: "bbe", file: "BBE", name: "Bible in Basic English" },
  // Added 2026-10-15. All public domain and complete (66 books). Not the
  // Geneva Bible: it numbers verses differently from the KJV in places (Job
  // 41, Daniel 4...), so a spoken reference would land on the wrong words.
  { id: "akjv", file: "AKJV", name: "American King James Version" },
  { id: "ukjv", file: "UKJV", name: "Updated King James Version" },
  { id: "dby", file: "Darby", name: "Darby Translation" },
  { id: "ylt", file: "YLT", name: "Young's Literal Translation" },
  { id: "wbt", file: "Webster", name: "Webster's Bible" },
  { id: "acv", file: "ACV", name: "A Conservative Version" },
];
// `node scripts/build-bibles.mjs ylt dby` builds just those.
const only = process.argv.slice(2);
const BASE = "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json";
const OUT_DIR = path.join(process.cwd(), "public", "bibles");

// The KJV build is the reference for how many chapters each book has.
const kjv = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "kjv.json"), "utf8"));

const clean = (s) => s.replace(/\s+/g, " ").trim();

for (const src of only.length ? SOURCES.filter((s) => only.includes(s.id)) : SOURCES) {
  const res = await fetch(`${BASE}/${src.file}.json`);
  if (!res.ok) throw new Error(`${src.file}: download failed ${res.status}`);
  const data = await res.json();
  if (data.books.length !== 66) throw new Error(`${src.file}: expected 66 books, got ${data.books.length}`);

  let verses = 0;
  let missing = 0;
  const books = data.books.map((book, b) => {
    const chapters = [];
    for (const ch of book.chapters) {
      const last = Math.max(...ch.verses.map((v) => v.verse));
      const row = Array.from({ length: last }, () => "");
      for (const v of ch.verses) row[v.verse - 1] = clean(v.text);
      missing += row.filter((t) => !t).length;
      verses += ch.verses.length;
      chapters[ch.chapter - 1] = row;
    }
    // Any chapter the source lacks entirely becomes empty, keeping numbering.
    for (let c = 0; c < kjv.books[b].length; c++) chapters[c] ??= [];
    if (chapters.length !== kjv.books[b].length) {
      throw new Error(`${src.file} ${book.name}: ${chapters.length} chapters, KJV has ${kjv.books[b].length}`);
    }
    return chapters;
  });

  const out = path.join(OUT_DIR, `${src.id}.json`);
  fs.writeFileSync(out, JSON.stringify({ id: src.id, name: src.name, books }));
  console.log(`${src.id}: ${verses} verses, ${missing} gaps, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
}
