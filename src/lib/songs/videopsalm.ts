// Reads VideoPsalm songbooks: the .json files, and .vpc files (a zip with
// the JSON inside). Songbooks VideoPsalm sells or downloads come encrypted;
// those are reported as locked, never opened.
//
// VideoPsalm's JSON is relaxed: keys aren't quoted and line breaks sit raw
// inside strings. Each song's "Verses" are its slides in order; "Tag" marks
// a part of the song (1 chorus, 3 bridge...).

import { firstLine, songBody, type SongSlide } from "./songs";

export interface ImportedSong {
  title: string;
  author: string;
  copyright: string;
  slides: SongSlide[];
  fingerprint: string;
}

export interface SongbookRead {
  name: string;
  songs: ImportedSong[];
  /** Songs with no words at all. */
  empty: number;
  /** Songs that appear more than once in the file, extra copies dropped. */
  duplicates: number;
}

export class LockedSongbookError extends Error {
  constructor(file: string) {
    super(`${file} is locked (encrypted by VideoPsalm), so it can't be imported. Songbooks you made yourself can be.`);
  }
}

// Turns the relaxed JSON into strict JSON in one pass, then parses it.
export function parseRelaxedJson(raw: string): unknown {
  raw = raw.replace(/^﻿/, "");
  const out: string[] = [];
  let inStr = false;
  let lastSig = "";
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (c === "\\") {
        out.push(c + (raw[++i] ?? ""));
        continue;
      }
      if (c === '"') {
        inStr = false;
        lastSig = '"';
      }
      if (c === "\n") out.push("\\n");
      else if (c === "\r") out.push("\\r");
      else if (c === "\t") out.push("\\t");
      else out.push(c);
      continue;
    }
    if (c === '"') {
      inStr = true;
      out.push(c);
      continue;
    }
    // An unquoted key: a word right after { or , and followed by a colon.
    if ((lastSig === "{" || lastSig === ",") && /[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < raw.length && /\w/.test(raw[j])) j++;
      let k = j;
      while (k < raw.length && /\s/.test(raw[k])) k++;
      if (raw[k] === ":") {
        out.push(`"${raw.slice(i, j)}"`);
        i = j - 1;
        lastSig = '"';
        continue;
      }
    }
    if (!/\s/.test(c)) lastSig = c;
    out.push(c);
  }
  return JSON.parse(out.join(""));
}

const GENERIC_TITLE = /^(?:new song|song|untitled|new)?\s*\d*$/i;

const TAG_LABELS: Record<number, string> = { 1: "Chorus", 2: "Pre-chorus", 3: "Bridge", 4: "Ending", 7: "Tag" };

// VideoPsalm puts styling marks in the text ("<s769>(Might)</s>").
const cleanLine = (s: string) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();

const cleanText = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(cleanLine)
    .filter(Boolean)
    .join("\n");

/** A short stable hash (cyrb53) of a song's words, to spot duplicates. */
function hash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function fingerprint(title: string, slides: SongSlide[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return hash(`${norm(title)}|${norm(songBody(slides))}`);
}

interface VpSong {
  Text?: string;
  Author?: string;
  Copyright?: string;
  Verses?: { Text?: string; Tag?: number }[];
}

/** The songs in one songbook's JSON. */
export function readSongbookJson(text: string, fileName: string): SongbookRead {
  const data = parseRelaxedJson(text) as { Text?: string; Songs?: VpSong[] };
  if (!Array.isArray(data?.Songs)) throw new Error(`${fileName} isn't a VideoPsalm songbook.`);

  const seen = new Set<string>();
  const songs: ImportedSong[] = [];
  let empty = 0;
  let duplicates = 0;
  for (const s of data.Songs) {
    const slides: SongSlide[] = [];
    for (const v of s.Verses ?? []) {
      const t = cleanText(v.Text ?? "");
      if (!t) continue;
      const label = v.Tag !== undefined ? TAG_LABELS[v.Tag] : undefined;
      slides.push(label ? { label, text: t } : { text: t });
    }
    if (!slides.length) {
      empty++;
      continue;
    }
    // Titles sometimes carry line breaks or stray spaces. VideoPsalm's
    // default "New song" (or no title) says nothing: use the first line.
    const named = cleanText(s.Text ?? "").replace(/\n/g, " ");
    const title = (GENERIC_TITLE.test(named) ? firstLine(slides) : named).slice(0, 200);
    const fp = fingerprint(title, slides);
    if (seen.has(fp)) {
      duplicates++;
      continue;
    }
    seen.add(fp);
    songs.push({ title, author: cleanLine(s.Author ?? "").slice(0, 200), copyright: cleanLine(s.Copyright ?? "").slice(0, 300), slides, fingerprint: fp });
  }
  const name = cleanLine(data.Text ?? "") || fileName.replace(/\.(json|vpc)$/i, "");
  return { name, songs, empty, duplicates };
}

// ---------------------------------------------------------------------------
// .vpc files: a zip holding one JSON file.

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // A copy into a plain ArrayBuffer, which is what Blob accepts.
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The JSON text inside a .vpc file. */
export async function unzipSongbook(bytes: Uint8Array, fileName: string): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The central directory (found from the end record) has reliable sizes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${fileName} isn't a VideoPsalm file it can read.`);
  let p = view.getUint32(eocd + 16, true);
  const count = view.getUint16(eocd + 10, true);
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/\.json$/i.test(name)) continue;
    if (flags & 1 || method === 99) throw new LockedSongbookError(fileName);

    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    const out = method === 0 ? raw : method === 8 ? await inflateRaw(raw) : null;
    if (!out) throw new Error(`${fileName} uses a compression it can't read.`);
    return new TextDecoder().decode(out);
  }
  throw new Error(`${fileName} has no songbook inside.`);
}

/** Reads a .json or .vpc songbook file. */
export async function readSongbookFile(name: string, bytes: Uint8Array): Promise<SongbookRead> {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const text = isZip ? await unzipSongbook(bytes, name) : new TextDecoder().decode(bytes);
  return readSongbookJson(text, name);
}
