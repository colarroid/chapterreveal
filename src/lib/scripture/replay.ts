// Checking scripture detection against a real service: the saved transcript
// is read through today's parser, line by line as the console read it live,
// and compared with the verses the media team put on screen. Run it on old
// services after a parser change to see whether detection got better or
// worse, and to find the phrasings it still misses (the words said before
// a verse the operator had to find by hand).
//
// Verses recognised from their words alone (lib/scripture/verse-text) are
// not replayed: that index takes a second to build and the check is about
// spoken references.

import { formatRef, type BibleShape, type Detection, type ParseContext, type VerseRef, detectWithCarry, unfinishedTail } from "./parser";

export interface ReplaySegment {
  seq: number;
  /** Milliseconds from the start of the service. */
  start_ms: number;
  end_ms?: number | null;
  text: string;
}

/** A row of verses_shown. */
export interface ShownVerse {
  label: string;
  book: number;
  chapter: number;
  verse_start: number | null;
  verse_end: number | null;
  source: "detected" | "search" | "step";
  shown_at: string;
}

/** A reference heard today, where and when. */
export interface HeardRef {
  label: string;
  ref: VerseRef;
  confidence: number;
  kind: Detection["kind"];
  seq: number;
  /** Milliseconds from the start of the service, at the end of its line. */
  at: number;
  /** The line it was heard in. */
  heard: string;
}

export interface ScriptureReplay {
  /** References heard today, counting each once per line. */
  heard: number;
  /** Verses the team showed from a heard reference (a card or Auto). */
  shownFromHearing: number;
  /** …of which today's parser hears again. */
  stillHeard: number;
  /** Shown from hearing then, not heard now: what a change broke. */
  lost: { label: string; at: number; heard: string }[];
  /** Verses the operator found by search, with the words said before each: likely misses. */
  byHand: { label: string; at: number; heard: string; heardNow: boolean }[];
  /** Clear references heard today that nobody showed: possible false alarms, or verses the team skipped. */
  unused: { label: string; at: number; confidence: number; heard: string }[];
}

/** How long before a verse goes up its reference may have been said. */
const BEFORE_MS = 120_000;
/** How long after a reference is heard the team may take to show it. */
const AFTER_MS = 60_000;
/** How much of the transcript to show as "what was said" before a verse found by hand. */
const HEARD_WORDS = 40;

/** Everything heard, read line by line with the carry-over and follow-up context the console uses. */
export function replayTranscript(segments: ReplaySegment[], bible: BibleShape): HeardRef[] {
  const out: HeardRef[] = [];
  let ctx: ParseContext = {};
  let carry: string | null = null;
  for (const s of [...segments].sort((a, b) => a.seq - b.seq)) {
    const res = detectWithCarry(s.text, bible, ctx, carry);
    ctx = res.context;
    carry = unfinishedTail(carry ? `${carry} ${s.text}` : s.text);
    const at = s.end_ms ?? s.start_ms;
    const seen = new Set<string>();
    for (const d of res.detections) {
      const label = formatRef(d.ref);
      if (seen.has(label)) continue;
      seen.add(label);
      out.push({ label, ref: d.ref, confidence: d.confidence, kind: d.kind, seq: s.seq, at, heard: s.text });
    }
  }
  return out;
}

/** Whether a heard reference is (or contains) the verse that was shown. */
function matches(h: HeardRef, v: ShownVerse): boolean {
  if (h.ref.book !== v.book || h.ref.chapter !== v.chapter) return false;
  if (h.ref.verseStart === undefined) return (v.verse_start ?? 1) === 1;
  const hs = h.ref.verseStart;
  const he = h.ref.verseEnd ?? hs;
  const vs = v.verse_start ?? 1;
  const ve = v.verse_end ?? vs;
  return hs <= ve && he >= vs;
}

const lastWords = (text: string, n: number) => text.trim().split(/\s+/).slice(-n).join(" ");

/**
 * The check. `startedAt` is the service's start (verses_shown times are
 * absolute; transcript times count from the start).
 */
export function replayScripture(segments: ReplaySegment[], shown: ShownVerse[], startedAt: string | number, bible: BibleShape): ScriptureReplay {
  const t0 = typeof startedAt === "number" ? startedAt : Date.parse(startedAt);
  const heard = replayTranscript(segments, bible);
  const ordered = [...segments].sort((a, b) => a.seq - b.seq);
  const said = (before: number) =>
    lastWords(ordered.filter((s) => s.start_ms <= before && s.start_ms >= before - BEFORE_MS).map((s) => s.text).join(" "), HEARD_WORDS);

  const used = new Set<HeardRef>();
  let shownFromHearing = 0;
  let stillHeard = 0;
  const lost: ScriptureReplay["lost"] = [];
  const byHand: ScriptureReplay["byHand"] = [];
  for (const v of shown) {
    const at = Date.parse(v.shown_at) - t0;
    const hits = heard.filter((h) => matches(h, v) && h.at >= at - BEFORE_MS && h.at <= at + 3000);
    for (const h of hits) used.add(h);
    if (v.source === "detected") {
      shownFromHearing += 1;
      if (hits.length) stillHeard += 1;
      else lost.push({ label: v.label, at, heard: said(at) });
    } else if (v.source === "search") {
      byHand.push({ label: v.label, at, heard: said(at), heardNow: hits.length > 0 });
    }
  }
  // A verse the team showed later (by any route) counts as using the reference.
  for (const h of heard) {
    if (used.has(h)) continue;
    if (shown.some((v) => matches(h, v) && Date.parse(v.shown_at) - t0 >= h.at - 3000 && Date.parse(v.shown_at) - t0 <= h.at + AFTER_MS)) used.add(h);
  }
  const unused = heard
    .filter((h) => !used.has(h) && h.ref.verseStart !== undefined)
    .map((h) => ({ label: h.label, at: h.at, confidence: h.confidence, heard: h.heard }));

  return { heard: heard.length, shownFromHearing, stillHeard, lost, byHand, unused };
}
