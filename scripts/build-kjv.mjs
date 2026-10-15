// Builds public/bibles/kjv.json from the public-domain KJV in
// github.com/thiagobodruk/bible. Run once: npm run bible:kjv
// Output shape: { id, name, books: string[][][] } indexed [book][chapter][verse],
// books in canonical order (Genesis = 0). Book names live in src/lib/scripture/books.ts.
import fs from "node:fs";
import path from "node:path";

const SRC = "https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json";
const OUT = path.join(process.cwd(), "public", "bibles", "kjv.json");

const res = await fetch(SRC);
if (!res.ok) throw new Error(`Download failed: ${res.status}`);
const raw = (await res.text()).replace(/^﻿/, "");
const src = JSON.parse(raw);

if (src.length !== 66) throw new Error(`Expected 66 books, got ${src.length}`);

// The source marks translator-supplied words with {braces}; the printed KJV
// shows them in italics. On a projector we just show the words.
const clean = (s) => s.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();

const books = src.map((b) => b.chapters.map((ch) => ch.map(clean)));
const verses = books.flat(2).length;
if (verses !== 31102) throw new Error(`Expected 31102 verses, got ${verses}`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ id: "kjv", name: "King James Version", books }));
console.log(`Wrote ${OUT}: ${verses} verses, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`);
