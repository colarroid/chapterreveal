// Turns a Bible file into the app's shape: books[book][chapter - 1][verse - 1].
// Used by the admin dashboard to add translations. Runs in the browser and
// in tests, so no DOM: the XML formats are read with patterns, which is
// enough for these well-formed, flat files.
//
// Formats:
//   USFM          \id GEN … \c 1 … \v 1 text (one file per book, or many)
//   OSIS XML      <verse osisID="Gen.1.1">…</verse> or milestone verses
//   Zefania XML   <BIBLEBOOK bnumber="1"><CHAPTER cnumber="1"><VERS vnumber="1">
//   JSON          { books: string[][][] }, scrollmapper's { books: [{ chapters: [{ verses }] }] },
//                 or a list of { book, chapter, verse, text }
//   CSV / TSV     book, chapter, verse, text (book as a name, code or 1–66)
//   Plain text    one verse per line: "Genesis 1:1 In the beginning…"

import { BOOKS } from "./books";

export const USFM_CODES = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH", "EST",
  "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM",
  "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHP", "COL",
  "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN", "JUD", "REV",
];

const OSIS_CODES = [
  "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr", "Ezra", "Neh",
  "Esth", "Job", "Ps", "Prov", "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel", "Amos", "Obad", "Jonah",
  "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal", "Matt", "Mark", "Luke", "John", "Acts", "Rom", "1Cor", "2Cor", "Gal",
  "Eph", "Phil", "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm", "Heb", "Jas", "1Pet", "2Pet", "1John", "2John",
  "3John", "Jude", "Rev",
];

const ALIASES: Record<string, number> = {
  psalm: 18, songofsongs: 21, canticles: 21, canticleofcanticles: 21, revelationofjohn: 65, revelations: 65,
  apocalypse: 65, qoheleth: 20,
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^(iii|third)\s+/, "3")
    .replace(/^(ii|second)\s+/, "2")
    .replace(/^(i|first)\s+/, "1")
    .replace(/[\s.\-_']/g, "");

// Most specific first, so a full name or code wins over a short abbreviation
// two books share ("hb").
const BOOK_INDEX: Map<string, number> = (() => {
  const m = new Map<string, number>();
  const add = (k: string, b: number) => {
    const key = norm(k);
    if (key && !m.has(key)) m.set(key, b);
  };
  BOOKS.forEach((d, b) => add(d.name, b));
  USFM_CODES.forEach((c, b) => add(c, b));
  OSIS_CODES.forEach((c, b) => add(c, b));
  for (const [k, b] of Object.entries(ALIASES)) add(k, b);
  BOOKS.forEach((d, b) => add(d.short, b));
  BOOKS.forEach((d, b) => d.abbr.forEach((a) => add(d.ordinal ? `${d.ordinal}${a}` : a, b)));
  return m;
})();

/** A book from a name, code or number (1–66). Null when unknown. */
export function resolveBook(raw: string | number): number | null {
  const s = String(raw).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n >= 1 && n <= 66 ? n - 1 : null;
  }
  return BOOK_INDEX.get(norm(s)) ?? null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const clean = (s: string) => s.replace(/¶/g, "").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// Collecting verses

interface Collector {
  books: string[][][];
  verses: number;
  unknownBooks: Set<string>;
}

function collector(): Collector {
  return { books: Array.from({ length: 66 }, () => []), verses: 0, unknownBooks: new Set() };
}

function put(c: Collector, book: number | null, bookLabel: string, chapter: number, verse: number, text: string) {
  if (book === null) {
    if (bookLabel) c.unknownBooks.add(bookLabel);
    return;
  }
  const t = clean(text);
  if (!t || !(chapter >= 1) || !(verse >= 1) || chapter > 200 || verse > 200) return;
  const ch = (c.books[book][chapter - 1] ??= []);
  // A range written as one verse ("\v 1-2") lands on its first number.
  if (ch[verse - 1]) ch[verse - 1] += ` ${t}`;
  else {
    ch[verse - 1] = t;
    c.verses++;
  }
}

// ---------------------------------------------------------------------------
// Formats

function parseUsfm(text: string, c: Collector) {
  let book: number | null = null;
  let label = "";
  // Footnotes and cross references are not read aloud or projected.
  const body = text
    .replace(/\\f\s[\s\S]*?\\f\*/g, "")
    .replace(/\\fe\s[\s\S]*?\\fe\*/g, "")
    .replace(/\\x\s[\s\S]*?\\x\*/g, "")
    // \w grace|strong="G5485"\w*  ->  grace
    .replace(/\\\+?w\s+([^|\\]*?)(?:\|[^\\]*)?\\\+?w\*/g, "$1");
  let chapter = 0;
  for (const part of body.split(/(?=\\(?:id|c|v)\s)/)) {
    const id = part.match(/^\\id\s+(\S+)/);
    if (id) {
      label = id[1];
      book = resolveBook(id[1]);
      chapter = 0;
      continue;
    }
    const ch = part.match(/^\\c\s+(\d+)/);
    if (ch) {
      chapter = Number(ch[1]);
      continue;
    }
    const v = part.match(/^\\v\s+(\d+)(?:-\d+)?\s*([\s\S]*)$/);
    if (v && chapter) {
      const verseText = v[2]
        // Section headings and similar paragraph-level lines are not verse text.
        .replace(/\\(?:s\d?|ms\d?|mr|r|d|sp|cl|cp|h|toc\d?|mt\d?|rem|ide)\s[^\n\\]*/g, " ")
        .replace(/\\\+?[a-z]+\d*\*?/g, " ");
      put(c, book, label, chapter, Number(v[1]), verseText);
    }
  }
}

const stripTags = (s: string) => decode(s.replace(/<[^>]+>/g, " "));

function parseOsis(xml: string, c: Collector) {
  const body = xml.replace(/<note\b[\s\S]*?<\/note>/g, "").replace(/<title\b[\s\S]*?<\/title>/g, "");
  // Each verse start tag; its text runs to the next verse tag of any kind,
  // which covers both <verse>…</verse> and milestone (sID/eID) files.
  const re = /<verse\b([^>]*?)(\/?)>/g;
  const starts: { id: string; end: number; at: number }[] = [];
  for (let m; (m = re.exec(body)); ) {
    const attrs = m[1];
    if (/\beID=/.test(attrs)) {
      starts.push({ id: "", end: re.lastIndex, at: m.index });
      continue;
    }
    const id = attrs.match(/\bosisID="([^"]+)"/)?.[1] ?? "";
    starts.push({ id, end: re.lastIndex, at: m.index });
  }
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    if (!s.id) continue;
    const next = body.indexOf("<verse", s.end);
    const close = body.indexOf("</verse>", s.end);
    const stop = [next, close].filter((n) => n >= 0).reduce((a, b) => Math.min(a, b), body.length);
    // "Gen.1.1" or a range "Gen.1.1 Gen.1.2": the first one names it.
    const [bookCode, ch, vs] = s.id.split(/\s+/)[0].split(".");
    put(c, resolveBook(bookCode), bookCode, Number(ch), Number(vs), stripTags(body.slice(s.end, stop)));
  }
}

function parseZefania(xml: string, c: Collector) {
  const body = xml.replace(/<NOTE\b[\s\S]*?<\/NOTE>/gi, "");
  const bookRe = /<BIBLEBOOK\b([^>]*)>([\s\S]*?)<\/BIBLEBOOK>/gi;
  for (let b; (b = bookRe.exec(body)); ) {
    const num = b[1].match(/\bbnumber="(\d+)"/i)?.[1];
    const name = b[1].match(/\bbname="([^"]+)"/i)?.[1] ?? "";
    const book = num ? resolveBook(num) : resolveBook(name);
    const chRe = /<CHAPTER\b([^>]*)>([\s\S]*?)<\/CHAPTER>/gi;
    for (let ch; (ch = chRe.exec(b[2])); ) {
      const chapter = Number(ch[1].match(/\bcnumber="(\d+)"/i)?.[1]);
      const vRe = /<VERS\b([^>]*)>([\s\S]*?)<\/VERS>/gi;
      for (let v; (v = vRe.exec(ch[2])); ) {
        put(c, book, name || num || "", chapter, Number(v[1].match(/\bvnumber="(\d+)"/i)?.[1]), stripTags(v[2]));
      }
    }
  }
}

function parseJson(text: string, c: Collector) {
  const data = JSON.parse(text.replace(/^\uFEFF/, ""));
  // The app's own shape.
  if (Array.isArray(data?.books) && Array.isArray(data.books[0]) && (data.books[0].length === 0 || Array.isArray(data.books[0][0]))) {
    (data.books as string[][][]).forEach((chs, b) =>
      chs?.forEach((vs, ci) => vs?.forEach((t, vi) => put(c, b < 66 ? b : null, `book ${b + 1}`, ci + 1, vi + 1, String(t ?? "")))),
    );
    return;
  }
  // scrollmapper: { books: [{ name, chapters: [{ chapter, verses: [{ verse, text }] }] }] }
  if (Array.isArray(data?.books)) {
    data.books.forEach((bk: { name?: string; chapters?: { chapter: number; verses: { verse: number; text: string }[] }[] }, i: number) => {
      const book = bk.name ? (resolveBook(bk.name) ?? (data.books.length === 66 ? i : null)) : i;
      for (const ch of bk.chapters ?? []) for (const v of ch.verses ?? []) put(c, book, bk.name ?? "", ch.chapter, v.verse, v.text);
    });
    return;
  }
  // A flat list of verses.
  const list = Array.isArray(data) ? data : Array.isArray(data?.verses) ? data.verses : null;
  if (!list) throw new Error("This JSON file isn't a Bible format the importer knows.");
  for (const v of list) {
    const label = String(v.book ?? v.book_name ?? v.bookName ?? v.book_id ?? "");
    put(c, resolveBook(label), label, Number(v.chapter), Number(v.verse), String(v.text ?? ""));
  }
}

/** Splits CSV or TSV, honouring quoted fields. */
function rows(text: string, sep: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      out.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    out.push(row);
  }
  return out;
}

function parseDelimited(text: string, sep: string, c: Collector) {
  const all = rows(text.replace(/^\uFEFF/, ""), sep).filter((r) => r.some((f) => f.trim()));
  if (!all.length) return;
  // Find the columns from a header when there is one; otherwise assume
  // book, chapter, verse, text (with an optional leading id column).
  const head = all[0].map((h) => h.trim().toLowerCase());
  const find = (...names: string[]) => head.findIndex((h) => names.includes(h));
  let cols = { book: find("book", "book_name", "bookname", "b", "book_id"), chapter: find("chapter", "c", "ch"), verse: find("verse", "v", "vs"), text: find("text", "t", "verse_text", "content") };
  let body = all;
  if (cols.book >= 0 && cols.chapter >= 0 && cols.verse >= 0 && cols.text >= 0) body = all.slice(1);
  else {
    const n = all[0].length;
    cols = n >= 5 ? { book: 1, chapter: 2, verse: 3, text: 4 } : { book: 0, chapter: 1, verse: 2, text: 3 };
    if (!/^\d+$/.test(all[0][cols.chapter]?.trim() ?? "")) body = all.slice(1);
  }
  for (const r of body) {
    const label = r[cols.book]?.trim() ?? "";
    // Rows with more fields than columns had an unquoted separator in the text.
    const textField = r.slice(cols.text).join(sep);
    put(c, resolveBook(label), label, Number(r[cols.chapter]), Number(r[cols.verse]), textField);
  }
}

function parsePlain(text: string, c: Collector) {
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*((?:[1-3]\s*)?[A-Za-z][A-Za-z .']*?)\s+(\d+):(\d+)\s+(.+)$/);
    if (m) put(c, resolveBook(m[1]), m[1], Number(m[2]), Number(m[3]), m[4]);
  }
}

export type BibleFormat = "usfm" | "osis" | "zefania" | "json" | "csv" | "tsv" | "text";

export function detectFormat(name: string, text: string): BibleFormat {
  const head = text.slice(0, 4000);
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (/\\id\s+\w{3}/.test(head) || ext === "usfm" || ext === "sfm") return "usfm";
  if (/<osis\b|<osisText\b/i.test(head)) return "osis";
  if (/<XMLBIBLE\b|<BIBLEBOOK\b/i.test(head)) return "zefania";
  if (ext === "json" || /^\uFEFF?\s*[[{]/.test(head)) return "json";
  if (ext === "tsv" || (head.split("\n")[0].includes("\t") && ext !== "csv")) return "tsv";
  if (ext === "csv") return "csv";
  if (/^\s*(?:[1-3]\s*)?[A-Za-z][A-Za-z .']*?\s+\d+:\d+\s/m.test(head)) return "text";
  return "csv";
}

// ---------------------------------------------------------------------------
// Result

export interface ImportReport {
  /** Ready to save: 66 books, every chapter the KJV has, gaps as "". */
  books: string[][][];
  formats: BibleFormat[];
  verses: number;
  /** Books with at least one verse. */
  booksFound: number;
  /** Books with no text at all (a New Testament on its own has 39). */
  missingBooks: number[];
  /** Verses the KJV has that this file doesn't (some are normal: Acts 8:37). */
  gaps: number;
  /** Book names in the file that couldn't be matched. */
  unknownBooks: string[];
  /** A name for the translation, when the file has one. */
  title?: string;
}

/**
 * Reads one or more files into a translation. `kjvShape[b][c]` is the
 * number of verses in KJV book b, chapter c + 1: every chapter it has is
 * kept, so references and verse stepping work the same in every translation.
 */
export function importBible(files: { name: string; text: string }[], kjvShape: number[][]): ImportReport {
  const c = collector();
  const formats = new Set<BibleFormat>();
  let title: string | undefined;
  for (const f of files) {
    const format = detectFormat(f.name, f.text);
    formats.add(format);
    if (format === "usfm") parseUsfm(f.text, c);
    else if (format === "osis") {
      parseOsis(f.text, c);
      title ??= f.text.match(/<title\b[^>]*>([^<]+)<\/title>/)?.[1]?.trim();
    } else if (format === "zefania") {
      parseZefania(f.text, c);
      title ??= f.text.match(/\bbiblename="([^"]+)"/i)?.[1]?.trim() ?? f.text.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    } else if (format === "json") parseJson(f.text, c);
    else if (format === "csv") parseDelimited(f.text, ",", c);
    else if (format === "tsv") parseDelimited(f.text, "\t", c);
    else parsePlain(f.text, c);
  }

  let gaps = 0;
  const missingBooks: number[] = [];
  const books = c.books.map((chapters, b) => {
    const kjv = kjvShape[b] ?? [];
    if (!chapters.some((ch) => ch?.some(Boolean))) missingBooks.push(b);
    const count = Math.max(kjv.length, chapters.length);
    const out: string[][] = [];
    for (let ch = 0; ch < count; ch++) {
      const found = chapters[ch] ?? [];
      const len = Math.max(found.length, kjv[ch] ?? 0);
      const row = Array.from({ length: len }, (_, v) => found[v] ?? "");
      gaps += row.filter((t, v) => !t && v < (kjv[ch] ?? 0)).length;
      out.push(row);
    }
    return out;
  });

  return {
    books,
    formats: [...formats],
    verses: c.verses,
    booksFound: 66 - missingBooks.length,
    missingBooks,
    gaps,
    unknownBooks: [...c.unknownBooks].slice(0, 20),
    title,
  };
}
