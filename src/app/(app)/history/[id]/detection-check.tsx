"use client";

import { Gauge, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import { usageLift } from "@/lib/songs/engine";
import { SongIndex } from "@/lib/songs/matcher";
import { replay, type LoggedEvent, type ReplayReport } from "@/lib/songs/replay";
import { fetchAllSongs, songsInMemory, storedSongs } from "@/lib/songs/store";
import { supabaseBrowser } from "@/lib/supabase/client";

// Plays this service's worship singing through today's song detection and
// compares it with what the media team had on screen (lib/songs/replay.ts).
// For tuning detection: after a change, an old service shows whether it got
// better or worse.

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "–");

export function DetectionCheck({ serviceId, churchId, titles }: { serviceId: string; churchId: string; titles: Record<string, string> }) {
  const [state, setState] = useState<"idle" | "running" | "error">("idle");
  const [report, setReport] = useState<ReplayReport | null>(null);

  async function run() {
    setState("running");
    try {
      const supabase = supabaseBrowser();
      const [{ data, error }, songs, usage] = await Promise.all([
        supabase.from("song_detections").select("at, kind, heard, decision, song_id, slide").eq("service_id", serviceId).order("at").limit(10000),
        (async () => songsInMemory(churchId) ?? (await storedSongs(churchId)) ?? (await fetchAllSongs(churchId)))(),
        supabase.rpc("song_usage"),
      ]);
      if (error) throw error;
      const lift = usageLift((usage.data ?? []) as Parameters<typeof usageLift>[0]);
      setReport(replay(new SongIndex(songs), (data ?? []) as LoggedEvent[], lift));
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
      <p className="mt-1 text-xs leading-snug text-muted">Plays this service&apos;s singing through today&apos;s song detection and compares it with what was on screen.</p>
      {!report && (
        <Button size="sm" variant="outline" className="mt-3" onClick={() => void run()} disabled={state === "running"}>
          {state === "running" && <LoaderCircle size={13} className="animate-spin" />}
          {state === "running" ? "Checking" : "Run check"}
        </Button>
      )}
      {state === "error" && <p className="mt-2 text-xs text-negative">Couldn&apos;t run the check. Try again.</p>}
      {report && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Row label="Lines sung" value={String(report.lines)} />
          <Row label="Right song" value={pct(report.sameSong, report.checked)} />
          <Row label="Right slide" value={pct(report.sameSlide, report.checked)} />
          <Row label="Wrong song put up" value={`${report.wrongShows} of ${report.autoShows}`} />
          <Row label="Right song offered" value={pct(report.offeredRight, report.offered)} />
          <div className="col-span-2 mt-1">
            <dt className="text-xs font-bold text-muted">Time to find each song</dt>
            <dd className="mt-1 space-y-0.5">
              {report.found.map((f) => (
                <p key={f.song_id} className="flex justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate">{titles[f.song_id] ?? "A song"}</span>
                  <span className="shrink-0 tabular-nums">{f.seconds === null ? "not found" : `${f.seconds}s`}</span>
                </p>
              ))}
              {!report.found.length && <p className="text-xs text-muted">No songs were on screen during the singing.</p>}
            </dd>
          </div>
        </dl>
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
