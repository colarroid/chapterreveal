"use client";

import { Gauge, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { loadTranslation, shapeOf } from "@/lib/scripture/bible";
import { replayScripture, type ReplaySegment, type ScriptureReplay, type ShownVerse } from "@/lib/scripture/replay";
import { BUILT_IN_TRANSLATIONS, findTranslation } from "@/lib/scripture/translations";
import { supabaseBrowser } from "@/lib/supabase/client";

// Reads this service's transcript through today's scripture detection and
// compares it with the verses the media team put on screen
// (lib/scripture/replay.ts). For tuning the parser: an old service shows
// what a change fixed or broke, and the words said before a verse the
// operator had to search for are the phrasings it still misses.

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–");
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const MAX_LISTED = 8;

export function ScriptureCheck({ serviceId, startedAt }: { serviceId: string; startedAt: string }) {
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [report, setReport] = useState<ScriptureReplay | null>(null);

  async function run() {
    setState("running");
    try {
      const supabase = supabaseBrowser();
      const [{ data: segments, error: segErr }, { data: shown, error: shownErr }, kjv] = await Promise.all([
        supabase.from("transcript_segments").select("seq, start_ms, end_ms, text").eq("service_id", serviceId).order("seq").limit(5000),
        supabase.from("verses_shown").select("label, book, chapter, verse_start, verse_end, source, shown_at").eq("service_id", serviceId).order("shown_at"),
        // Chapter and verse counts, the same in every translation but the Deuterocanonical books.
        loadTranslation(findTranslation(BUILT_IN_TRANSLATIONS, "kjv")),
      ]);
      if (segErr) throw segErr;
      if (shownErr) throw shownErr;
      setReport(replayScripture((segments ?? []) as ReplaySegment[], (shown ?? []) as ShownVerse[], startedAt, shapeOf(kjv)));
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-5 border-t border-line pt-4">
      <div className="flex items-center gap-2">
        <Gauge size={15} className="text-muted" />
        <h3 className="text-sm font-bold">Detection check</h3>
      </div>
      <p className="mt-1 text-xs leading-snug text-muted">Reads this service&apos;s transcript through today&apos;s scripture detection and compares it with the verses shown.</p>
      {!report && (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => void run()} disabled={state === "running"}>
          {state === "running" && <LoaderCircle size={13} className="animate-spin" />}
          {state === "running" ? "Checking" : "Run check"}
        </Button>
      )}
      {state === "error" && <p className="mt-2 text-xs text-negative">Couldn&apos;t run the check. Try again.</p>}
      {report && (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Row label="References heard" value={String(report.heard)} />
            <Row label="Shown from hearing" value={String(report.shownFromHearing)} />
            <Row label="Still heard today" value={pct(report.stillHeard, report.shownFromHearing)} />
            <Row label="Found by hand" value={String(report.byHand.length)} />
          </dl>
          <List title="No longer heard" hint="Shown from a heard reference then; today's detection misses it." items={report.lost.map((l) => ({ label: l.label, at: l.at, note: l.heard }))} tone="negative" />
          <List
            title="Found by hand"
            hint="What was said before the operator searched for it. Likely phrasings detection misses."
            items={report.byHand.map((b) => ({ label: `${b.label}${b.heardNow ? " · heard now" : ""}`, at: b.at, note: b.heard }))}
          />
          <List title="Heard, not shown" hint="Clear references nobody put up: false alarms, or verses the team skipped." items={report.unused.map((u) => ({ label: u.label, at: u.at, note: u.heard }))} />
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold text-muted">{label}</dt>
      <dd className="font-bold tabular-nums">{value}</dd>
    </div>
  );
}

function List({ title, hint, items, tone }: { title: string; hint: string; items: { label: string; at: number; note: string }[]; tone?: "negative" }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <h4 className={`text-xs font-bold ${tone === "negative" ? "text-negative" : "text-muted"}`}>
        {title} · {items.length}
      </h4>
      <p className="text-xs text-faint">{hint}</p>
      <ol className="mt-2 space-y-2 text-sm">
        {items.slice(0, MAX_LISTED).map((it, i) => (
          <li key={`${it.label}-${it.at}-${i}`}>
            <span className="font-mono text-xs text-faint tabular-nums">{clock(it.at)}</span> <span className="font-bold">{it.label}</span>
            {it.note && <p className="mt-0.5 line-clamp-3 text-xs leading-snug text-muted">“{it.note}”</p>}
          </li>
        ))}
        {items.length > MAX_LISTED && <li className="text-xs text-faint">and {items.length - MAX_LISTED} more</li>}
      </ol>
    </div>
  );
}
