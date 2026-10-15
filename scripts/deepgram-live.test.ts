// Live end-to-end check against the real Deepgram service. Skipped by
// default; run it with `npm run test:live` (needs DEEPGRAM_API_KEY in
// .env.local). Uses a few cents of Deepgram credit per run.
//
// For each sermon line: Deepgram text-to-speech makes the audio, which is
// streamed into live transcription in real time (40 ms chunks, the same
// settings as the app), and our detector runs on every interim result. It
// reports what was heard, what was detected, and how long after the sentence
// finished the verse was found.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readiness } from "@/lib/live/auto-show";
import { transcriptionKeyterms } from "@/lib/scripture/books";
import { shapeOf, type Translation } from "@/lib/scripture/bible";
import { detect, formatRef, type ParseContext } from "@/lib/scripture/parser";

const env = (() => {
  try {
    const text = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
    ) as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
})();
const KEY = env.DEEPGRAM_API_KEY ?? "";
const RUN = process.env.LIVE_DEEPGRAM === "1" && KEY && !KEY.startsWith("your-");

const kjv: Translation = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/bibles/kjv.json"), "utf8"));
const bible = shapeOf(kjv);

const RATE = 16000;
const CHUNK_BYTES = (RATE / 25) * 2; // 40 ms of 16-bit mono, as the app sends

/** The same live settings the app's session route uses. */
function listenUrl(): string {
  const params = new URLSearchParams({
    model: "nova-3",
    language: "en",
    encoding: "linear16",
    sample_rate: String(RATE),
    channels: "1",
    interim_results: "true",
    punctuate: "true",
    smart_format: "false",
    endpointing: process.env.ENDPOINTING ?? "400",
    utterance_end_ms: "1500",
    vad_events: "true",
  });
  for (const t of transcriptionKeyterms()) params.append("keyterm", t);
  return `wss://api.deepgram.com/v1/listen?${params}`;
}

async function speak(text: string): Promise<Buffer> {
  const res = await fetch(`https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=${RATE}&container=none`, {
    method: "POST",
    headers: { Authorization: `Token ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`TTS failed ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

interface Result {
  heard: string;
  detected: string[];
  /** ms from the end of the sentence's audio to the first correct detection; negative = before it ended. */
  afterSentenceMs: number | null;
  /** Would auto mode have put it on screen at that moment? */
  autoReady: boolean;
}

/** Byte offset where speech ends: the last 20 ms window louder than near-silence. */
function speechEnd(pcm: Buffer): number {
  const win = (RATE / 50) * 2;
  for (let end = pcm.length - (pcm.length % 2); end > win; end -= win) {
    let peak = 0;
    for (let i = end - win; i < end; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
    if (peak > 600) return end;
  }
  return pcm.length;
}

/** Streams audio in real time and watches for `want` in the live results. */
function stream(pcm: Buffer, want: string, ctx: ParseContext): Promise<Result> {
  return new Promise((resolve, reject) => {
    // Node's WebSocket can't set headers; Deepgram accepts the key as a subprotocol.
    const ws = new WebSocket(listenUrl(), ["token", KEY]);
    ws.binaryType = "arraybuffer";
    let finals: string[] = [];
    let audioEnd = 0;
    let foundAt: number | null = null;
    let autoReady = false;
    const detected = new Set<string>();
    const timeout = setTimeout(() => reject(new Error("timed out")), 30_000);

    ws.onmessage = (m) => {
      const msg = JSON.parse(String(m.data));
      if (msg.type !== "Results") return;
      const text: string = msg.channel?.alternatives?.[0]?.transcript ?? "";
      if (!text) return;
      const res = detect(text, bible, ctx);
      for (const d of res.detections) {
        const label = formatRef(d.ref);
        detected.add(label);
        if (label === want && foundAt === null) {
          foundAt = performance.now();
          autoReady = readiness(text, d, bible, !!msg.is_final) !== "never";
        }
      }
      if (msg.is_final) finals.push(text);
    };
    ws.onerror = (e) => reject(new Error(`socket error ${String((e as ErrorEvent).message ?? e)}`));
    ws.onclose = () => {
      clearTimeout(timeout);
      resolve({
        heard: finals.join(" "),
        detected: [...detected],
        afterSentenceMs: foundAt === null ? null : Math.round(foundAt - audioEnd),
        autoReady,
      });
    };
    ws.onopen = async () => {
      // Real time: one 40 ms chunk every 40 ms, then a second of silence.
      const silence = Buffer.alloc(CHUNK_BYTES * 25);
      const all = Buffer.concat([pcm, silence]);
      // Time from when the last spoken word has been sent, not the end of
      // the file (TTS adds trailing silence).
      const spokenTo = speechEnd(pcm);
      for (let i = 0; i < all.length; i += CHUNK_BYTES) {
        ws.send(all.subarray(i, i + CHUNK_BYTES));
        if (i + CHUNK_BYTES >= spokenTo && audioEnd === 0) audioEnd = performance.now();
        await new Promise((r) => setTimeout(r, 40));
      }
      ws.send(JSON.stringify({ type: "CloseStream" }));
      finals = finals.filter(Boolean);
    };
  });
}

const CASES: { say: string; want: string; ctx?: ParseContext }[] = [
  { say: "Please turn with me to Romans chapter eight verse twenty eight.", want: "Romans 8:28" },
  { say: "John chapter three verse sixteen says, for God so loved the world.", want: "John 3:16" },
  { say: "Let us read first Corinthians chapter thirteen verse four.", want: "1 Corinthians 13:4" },
  { say: "Psalm one hundred and nineteen, verse one hundred and five.", want: "Psalm 119:105" },
  { say: "Now look at verse seven.", want: "John 3:7", ctx: { book: 42, chapter: 3 } },
  { say: "Proverbs chapter three, verses five and six.", want: "Proverbs 3:5-6" },
];

describe.skipIf(!RUN)("Deepgram live pipeline", () => {
  for (const c of CASES) {
    it(
      c.say,
      async () => {
        const pcm = await speak(c.say);
        const r = await stream(pcm, c.want, c.ctx ?? {});
        console.log(
          `\n  said:     ${c.say}\n  heard:    ${r.heard}\n  detected: ${r.detected.join(", ") || "(nothing)"}\n` +
            `  found:    ${r.afterSentenceMs === null ? "MISSED" : `${r.afterSentenceMs} ms after the last word was spoken`}${r.autoReady ? " (auto mode would show it)" : ""}`,
        );
        expect(r.detected).toContain(c.want);
      },
      40_000,
    );
  }
});
