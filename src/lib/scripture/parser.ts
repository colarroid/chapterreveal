// Rule-based detection of explicit Bible references in transcript text.
//
// Runs on every partial transcript, so it must be fast and must not need the
// network. It understands the ways a preacher cites scripture:
//   "John 3:16", "John chapter three verse sixteen", "John three sixteen",
//   "verses 16 to 18", "Proverbs 3, 5 and 6", "first Corinthians 13",
// and follow-ups that lean on the last reference: "verse 17",
// "go down to verse 20", "the same chapter, verse 20", "chapter 4 verse 2".

import { BOOKS, ORDINAL_WORDS } from "./books";
import { tokenize, type Token } from "./tokenize";

export interface VerseRef {
  book: number;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}

export interface Detection {
  ref: VerseRef;
  /** Character offsets of the cited words in the parsed text. */
  start: number;
  end: number;
  /** 0 to 1. Clear chapter-and-verse citations score highest. */
  confidence: number;
  /** "quote": recognised from the verse's own words, no reference said. */
  kind: "explicit" | "followup" | "quote";
}

export interface ParseContext {
  /** Book and chapter of the last reference, for follow-ups like "verse 17". */
  book?: number;
  chapter?: number;
  /** A book named at the very end of the last text, waiting for its numbers. */
  pendingBook?: number;
}

/** Chapter and verse counts, read from whichever translation is loaded. */
export interface BibleShape {
  chapters(book: number): number;
  verses(book: number, chapter: number): number;
}

type Mode = "speech" | "search";

const CHAPTER_KW = new Set(["chapter", "chapters", "chap", "chp"]);
const VERSE_KW = new Set(["verse", "verses", "vs", "vss", "v", "vers", "ver", "vv"]);
const RANGE_KW = new Set(["to", "till", "until", "through", "thru", "-", "–", "—"]);
const LIST_KW = new Set(["and", ","]);
// Words a preacher puts between chapter and verse: "chapter 3 and verse 16",
// "chapter 3, from verse 16", "chapter 3 at verse 16".
const BRIDGE = new Set([",", ".", ";", "and", "from", "at", "number", "in", "the"]);

// ---------------------------------------------------------------------------
// Book name lookup

interface Alias {
  words: string[];
  book: number;
  ordinal?: 1 | 2 | 3;
}

function buildAliases(mode: Mode): Map<string, Alias[]> {
  const map = new Map<string, Alias[]>();
  const add = (phrase: string, book: number, ordinal?: 1 | 2 | 3) => {
    const words = phrase.toLowerCase().split(/\s+/);
    const list = map.get(words[0]) ?? [];
    if (!list.some((a) => a.book === book && a.words.join(" ") === words.join(" "))) {
      list.push({ words, book, ordinal });
    }
    map.set(words[0], list);
  };
  BOOKS.forEach((b, i) => {
    const forms = mode === "search" ? [...b.spoken, ...b.abbr, b.name.replace(/^\d /, "").toLowerCase()] : b.spoken;
    for (const f of forms) add(f, i, b.ordinal);
  });
  // Longest phrases first so "song of songs" beats "song".
  for (const list of map.values()) list.sort((a, b) => b.words.length - a.words.length);
  return map;
}

const ALIASES: Record<Mode, Map<string, Alias[]>> = {
  speech: buildAliases("speech"),
  search: buildAliases("search"),
};

function aliasAt(tokens: Token[], i: number, mode: Mode, ordinal?: 1 | 2 | 3) {
  const list = ALIASES[mode].get(tokens[i]?.text ?? "");
  if (!list) return null;
  for (const a of list) {
    if ((a.ordinal ?? undefined) !== ordinal) continue;
    if (a.words.every((w, k) => tokens[i + k]?.text === w)) {
      return { book: a.book, end: i + a.words.length };
    }
  }
  return null;
}

/** A book name starting at token i. `end` is the index after its last token. */
function matchBook(tokens: Token[], i: number, mode: Mode): { book: number; end: number } | null {
  const t = tokens[i];
  if (!t) return null;
  // Skip a leading "the book of".
  if (t.text === "book" && tokens[i + 1]?.text === "of") {
    return matchBook(tokens, i + 2, mode);
  }
  const isRoman = t.text === "i" || t.text === "ii" || t.text === "iii";
  const ordinal = (!isRoman || mode === "search") ? ORDINAL_WORDS[t.text] : undefined;
  if (ordinal) {
    const m = aliasAt(tokens, i + 1, mode, ordinal);
    if (m) return m;
  }
  return aliasAt(tokens, i, mode);
}

// ---------------------------------------------------------------------------
// Chapter and verse grammar

interface NumberParse {
  chapter: number;
  verses: [number, number][];
  end: number; // index after the last consumed token
  colon: boolean;
  verseKw: boolean;
  chapterKw: boolean;
  adjacent: boolean; // "John 3 16" with nothing between
  clamped: boolean;
}

const num = (t: Token | undefined) => t?.num;

/** True when a full reference (book plus chapter) starts at token i. */
function refStartsAt(tokens: Token[], i: number, mode: Mode): boolean {
  const m = matchBook(tokens, i, mode);
  if (!m) return false;
  return num(tokens[m.end]) !== undefined || CHAPTER_KW.has(tokens[m.end]?.text ?? "");
}

function parseNumbers(
  tokens: Token[],
  start: number,
  book: number,
  mode: Mode,
  bible: BibleShape,
): NumberParse | null {
  let k = start;
  const res: NumberParse = {
    chapter: 0, verses: [], end: start,
    colon: false, verseKw: false, chapterKw: false, adjacent: false, clamped: false,
  };
  const singleChapter = bible.chapters(book) === 1;

  if (CHAPTER_KW.has(tokens[k]?.text ?? "")) {
    res.chapterKw = true;
    k += 1;
  }

  // "Jude verse 3": single-chapter books can skip the chapter.
  if (singleChapter && !res.chapterKw && VERSE_KW.has(tokens[k]?.text ?? "") && num(tokens[k + 1]) !== undefined) {
    res.chapter = 1;
    res.verseKw = true;
    res.verses.push([num(tokens[k + 1])!, num(tokens[k + 1])!]);
    res.end = k + 2;
    return finishVerses(tokens, res, mode, bible, book);
  }

  const ch = num(tokens[k]);
  if (ch === undefined) return null;
  res.chapter = ch;
  k += 1;
  res.end = k;

  // Separator between chapter and verse.
  let j = k;
  let sawBridge = false;
  while (j < k + 4 && tokens[j] && num(tokens[j]) === undefined) {
    const w = tokens[j].text;
    if (w === ":") res.colon = true;
    else if (VERSE_KW.has(w)) res.verseKw = true;
    else if (BRIDGE.has(w)) sawBridge = true;
    else break;
    j += 1;
  }
  const v = num(tokens[j]);
  const bridgeOk =
    res.colon || res.verseKw ||
    // "Proverbs 3, 5 and 6": a bare comma means chapter then verse.
    (sawBridge && j === k + 1 && (tokens[k].text === "," || tokens[k].text === "."));
  if (v !== undefined && !refStartsAt(tokens, j, mode)) {
    if (j === k) {
      res.adjacent = true;
      res.verses.push([v, v]);
      res.end = j + 1;
    } else if (bridgeOk) {
      res.verses.push([v, v]);
      res.end = j + 1;
    }
  }

  if (res.verses.length === 0) {
    return fixSingleChapter(fixMergedDigits(res, book, bible), book, bible);
  }
  return finishVerses(tokens, res, mode, bible, book);
}

// After the first verse: ranges ("to 18", "-18") and lists ("and 6", ", 7").
function finishVerses(tokens: Token[], res: NumberParse, mode: Mode, bible: BibleShape, book: number): NumberParse | null {
  let k = res.end;
  for (;;) {
    const w = tokens[k]?.text ?? "";
    const isRange = RANGE_KW.has(w);
    const isList = LIST_KW.has(w);
    if (!isRange && !isList) break;
    let j = k + 1;
    if (VERSE_KW.has(tokens[j]?.text ?? "")) j += 1;
    const n = num(tokens[j]);
    if (n === undefined || refStartsAt(tokens, j, mode)) break;
    // "John 3:16, 4:2" is a new chapter, not a verse list. Stop here.
    if (tokens[j + 1]?.text === ":") break;
    const last = res.verses[res.verses.length - 1];
    if (isRange) {
      if (n <= last[1]) break;
      last[1] = n;
    } else if (n === last[1] + 1) {
      last[1] = n;
    } else if (n > last[1]) {
      res.verses.push([n, n]);
    } else {
      break;
    }
    k = j + 1;
    res.end = k;
  }
  return validate(fixMergedDigits(res, book, bible), book, bible);
}

// The transcriber may write "three sixteen" as "316". If the chapter does
// not exist, try splitting the digits into chapter and verse.
function fixMergedDigits(res: NumberParse, book: number, bible: BibleShape): NumberParse {
  if (res.verses.length > 0 || res.chapter <= bible.chapters(book) || res.chapter < 100) return res;
  const s = String(res.chapter);
  for (let p = 1; p < s.length; p++) {
    if (s[p] === "0") continue;
    const c = Number(s.slice(0, p));
    const v = Number(s.slice(p));
    if (c >= 1 && c <= bible.chapters(book) && v >= 1 && v <= bible.verses(book, c)) {
      return { ...res, chapter: c, verses: [[v, v]], colon: true };
    }
  }
  return res;
}

// "Jude 3" means verse 3: Jude has one chapter.
function fixSingleChapter(res: NumberParse, book: number, bible: BibleShape): NumberParse | null {
  if (bible.chapters(book) === 1 && res.verses.length === 0 && !res.chapterKw && res.chapter > 1) {
    return validate({ ...res, verses: [[res.chapter, res.chapter]], chapter: 1 }, book, bible);
  }
  return validate(res, book, bible);
}

function validate(res: NumberParse, book: number, bible: BibleShape): NumberParse | null {
  if (res.chapter < 1 || res.chapter > bible.chapters(book)) return null;
  const max = bible.verses(book, res.chapter);
  const kept: [number, number][] = [];
  for (const [s, e] of res.verses) {
    if (s < 1 || s > max) {
      res.clamped = true;
      continue;
    }
    if (e > max) res.clamped = true;
    kept.push([s, Math.min(e, max)]);
  }
  // "Psalm one nineteen" for Psalm 119: the "verse" was really the rest of
  // the chapter number.
  if (kept.length === 0 && res.adjacent && res.verses.length === 1) {
    const joined = Number(`${res.chapter}${res.verses[0][0]}`);
    if (joined <= bible.chapters(book)) {
      return { ...res, chapter: joined, verses: [], adjacent: false, clamped: false };
    }
  }
  return { ...res, verses: kept };
}

function score(p: NumberParse, book: number, mode: Mode, followup: boolean): number {
  if (mode === "search") return 1;
  let c: number;
  if (p.verses.length === 0) c = 0.55;
  else if (p.colon || p.verseKw) c = 0.95;
  else c = 0.85;
  // "John two" could be anyone; "John three sixteen" (a real chapter and
  // verse) is a citation. "Numbers one two" is still just counting.
  const bare = !p.colon && !p.verseKw && !p.chapterKw;
  const numberRun = p.verses.length > 0 && !p.clamped && BOOKS[book].name !== "Numbers";
  if (BOOKS[book].commonWord && bare && !numberRun) c -= 0.15;
  if (p.clamped) c -= 0.2;
  if (followup) c -= 0.1;
  return Math.max(0.1, Math.round(c * 100) / 100);
}

function toDetections(
  p: NumberParse,
  book: number,
  tokens: Token[],
  startTok: number,
  conf: number,
  kind: Detection["kind"],
): Detection[] {
  const start = tokens[startTok].start;
  const end = tokens[p.end - 1].end;
  if (p.verses.length === 0) {
    return [{ ref: { book, chapter: p.chapter }, start, end, confidence: conf, kind }];
  }
  return p.verses.map(([s, e]) => ({
    ref: { book, chapter: p.chapter, verseStart: s, verseEnd: e },
    start,
    end,
    confidence: conf,
    kind,
  }));
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Finds every reference in `text`. `ctx` carries the book and chapter from
 * earlier text so follow-ups resolve; the returned context is what the next
 * call should receive once this text is final.
 */
export function detect(
  text: string,
  bible: BibleShape,
  ctx: ParseContext = {},
  mode: Mode = "speech",
): { detections: Detection[]; context: ParseContext } {
  const tokens = tokenize(text);
  const out: Detection[] = [];
  let book = ctx.book;
  let chapter = ctx.chapter;
  let bare: { book: number; end: number } | null = null;

  for (let i = 0; i < tokens.length; ) {
    // 1. Book name followed by numbers.
    const m = matchBook(tokens, i, mode);
    if (m) {
      const p = parseNumbers(tokens, m.end, m.book, mode, bible);
      if (p) {
        out.push(...toDetections(p, m.book, tokens, i, score(p, m.book, mode, false), "explicit"));
        book = m.book;
        chapter = p.chapter;
        bare = null;
        i = p.end;
        continue;
      }
      if (mode === "search") {
        out.push({ ref: { book: m.book, chapter: 1 }, start: tokens[i].start, end: tokens[m.end - 1].end, confidence: 1, kind: "explicit" });
        return { detections: out, context: { book: m.book, chapter: 1 } };
      }
      // Named with numbers that don't exist in it ("2 Peter chapter 4": it has
      // three). Those numbers are this book's, so they must not fall through
      // to the book before it as a follow-up; nothing shows instead.
      const next = tokens[m.end]?.text;
      if (next !== undefined && (CHAPTER_KW.has(next) || num(tokens[m.end]) !== undefined)) {
        book = m.book;
        chapter = undefined;
      }
      bare = { book: m.book, end: m.end };
      i = m.end;
      continue;
    }

    // 2. The previous text ended on a book name: "...turn to Romans" then "8:28".
    if (ctx.pendingBook !== undefined && i < 3 && out.length === 0 && mode === "speech") {
      const p = parseNumbers(tokens, i, ctx.pendingBook, mode, bible);
      if (p && (p.verses.length > 0 || p.chapterKw)) {
        out.push(...toDetections(p, ctx.pendingBook, tokens, i, score(p, ctx.pendingBook, mode, true), "explicit"));
        book = ctx.pendingBook;
        chapter = p.chapter;
        i = p.end;
        continue;
      }
    }

    const w = tokens[i].text;

    // 3. "chapter 4 verse 2" in the current book.
    if (CHAPTER_KW.has(w) && book !== undefined) {
      const p = parseNumbers(tokens, i, book, mode, bible);
      if (p) {
        out.push(...toDetections(p, book, tokens, i, score(p, book, mode, true) - (p.verses.length ? 0 : 0.1), "followup"));
        chapter = p.chapter;
        i = p.end;
        continue;
      }
    }

    // 4. "verse 17", "verses 20 to 22" in the current chapter.
    if (VERSE_KW.has(w) && w !== "v" && book !== undefined && chapter !== undefined && num(tokens[i + 1]) !== undefined) {
      const v = num(tokens[i + 1])!;
      const seed: NumberParse = {
        chapter, verses: [[v, v]], end: i + 2,
        colon: false, verseKw: true, chapterKw: false, adjacent: false, clamped: false,
      };
      const p = finishVerses(tokens, seed, mode, bible, book);
      if (p && p.verses.length > 0) {
        out.push(...toDetections(p, book, tokens, i, score(p, book, mode, true), "followup"));
        i = p.end;
        continue;
      }
    }

    i += 1;
  }

  // A book named in the last couple of tokens is probably waiting for its
  // chapter, which will arrive in the next piece of transcript.
  const pendingBook = bare && bare.end >= tokens.length - 1 ? bare.book : undefined;
  return { detections: out, context: { book, chapter, pendingBook } };
}

/** Parses what the operator types in the search box: "Jn 3 16", "1 cor 13:4-7", "ps 23". */
export function parseSearch(query: string, bible: BibleShape, ctx: ParseContext = {}): VerseRef | null {
  const { detections } = detect(query, bible, ctx, "search");
  if (detections.length === 0) return null;
  const first = detections[0];
  // Lists like "Prov 3:5, 6" come back as one detection per run; for a
  // search we want the whole span from first to last verse.
  const sameChapter = detections.filter((d) => d.ref.book === first.ref.book && d.ref.chapter === first.ref.chapter);
  const last = sameChapter[sameChapter.length - 1];
  return { ...first.ref, verseEnd: last.ref.verseEnd ?? first.ref.verseEnd };
}

export function refKey(r: VerseRef): string {
  return `${r.book}.${r.chapter}.${r.verseStart ?? 0}.${r.verseEnd ?? 0}`;
}

export function formatRef(r: VerseRef): string {
  const b = BOOKS[r.book];
  // "Psalm 23", but "Psalms" is the book.
  const name = r.book === 18 ? "Psalm" : b.name;
  if (r.verseStart === undefined) return `${name} ${r.chapter}`;
  if (r.verseEnd === undefined || r.verseEnd === r.verseStart) return `${name} ${r.chapter}:${r.verseStart}`;
  return `${name} ${r.chapter}:${r.verseStart}-${r.verseEnd}`;
}

// Words a reference can continue after: a number (the verse may follow the
// chapter: "Isaiah forty two" | "nine"), "chapter", "verse", "and", "to"...
const OPEN_ENDING =
  /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|hundred|chapter|chapters|verse|verses|and|to|through|colon|\d+)$/;

/**
 * The transcriber cuts a stretch of speech at a pause, sometimes mid-number:
 * "…in Psalm ninety" | "one, our psalm of protection". When a stretch ends
 * like that, its last words, to be read again with the next stretch so the
 * reference comes out whole (Psalm 91, not Psalm 90). Null when it ended
 * cleanly, at a full stop or on a word that can't continue a reference.
 */
export function unfinishedTail(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || /[.!?]$/.test(trimmed)) return null;
  const words = trimmed.split(/\s+/);
  const last = words[words.length - 1].toLowerCase().replace(/[^a-z0-9]/g, "");
  return OPEN_ENDING.test(last) ? words.slice(-8).join(" ") : null;
}

/**
 * Detects in `text` read after `carry` (the previous stretch's unfinished
 * tail). Offsets are moved back into `text`; references wholly inside the
 * carried words were already reported with the previous stretch.
 */
export function detectWithCarry(text: string, shape: BibleShape, ctx: ParseContext, carry: string | null): { detections: Detection[]; context: ParseContext } {
  if (!carry) return detect(text, shape, ctx);
  const shift = carry.length + 1;
  const res = detect(`${carry} ${text}`, shape, ctx);
  return {
    context: res.context,
    detections: res.detections
      .filter((d) => d.end > shift)
      .map((d) => ({ ...d, start: Math.max(0, d.start - shift), end: d.end - shift })),
  };
}
