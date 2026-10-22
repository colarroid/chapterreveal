// Checking song detection against a real service: the lines heard in a
// worship service (from its detection log) are played through today's
// engine, with Follow on and nobody touching anything, and compared with
// what the media team actually had on screen. Run it on old services after
// a change to see whether detection got better or worse.

import { FollowEngine } from "./engine";
import type { SongIndex } from "./matcher";

/** A row of the song_detections log (migration 0027). */
export interface LoggedEvent {
  at: string;
  kind: "heard" | "shown";
  heard: string | null;
  decision: string | null;
  song_id: string | null;
  slide: number | null;
}

export interface ReplayReport {
  /** Finished lines of singing in the log. */
  lines: number;
  /** Lines sung while the team had a song up (what can be checked). */
  checked: number;
  /** Of those, lines where the replay had the same song on screen. */
  sameSong: number;
  /** …and the same slide. */
  sameSlide: number;
  /** Songs the replay put up on its own. */
  autoShows: number;
  /** …of which the wrong song (not what the team had up). */
  wrongShows: number;
  /** Lines where it offered songs to pick, and how often the right one was among them. */
  offered: number;
  offeredRight: number;
  /** Per song the team put up: seconds of singing before the replay had it up (null: never). */
  found: { song_id: string; seconds: number | null }[];
}

/** An automatic slide replaced by the team within this long was a mistake, not the truth. */
const CORRECTED_MS = 10_000;
/** The team often puts a song up a few seconds after the singing starts. */
const TEAM_LAG_MS = 6000;

/**
 * What the team had on screen over time: every slide shown, except
 * automatic ones the operator replaced within a few seconds, and songs the
 * operator marked wrong (from then, nothing: id "").
 */
function truth(events: LoggedEvent[]): { at: number; id: string; slide: number }[] {
  const shown = events.filter((e) => e.kind === "shown" && e.song_id).map((e) => ({ ...e, t: Date.parse(e.at) }));
  return shown
    .filter((e, i) => {
      if (e.decision !== "auto" && e.decision !== "early") return true;
      const later = shown.slice(i + 1);
      // Marked wrong before another song of its own went up: a mistake.
      const wrong = later.find((n) => n.song_id === e.song_id && (n.decision === "rejected" || n.decision === "operator" || n.decision === "suggestion"));
      if (wrong?.decision === "rejected") return false;
      const fix = later.find((n) => n.t - e.t <= CORRECTED_MS && (n.decision === "operator" || n.decision === "suggestion"));
      return !fix || fix.song_id === e.song_id;
    })
    .map((e) => ({ at: e.t, id: e.decision === "rejected" ? "" : e.song_id!, slide: e.slide ?? 0 }));
}

export function replay(library: SongIndex, events: LoggedEvent[], usage?: Map<string, number>): ReplayReport {
  const engine = new FollowEngine();
  engine.library = library;
  if (usage) engine.usage = usage;
  const team = truth(events);
  // The team's song for a line sung at \`t\`: what they had up then, or put
  // up shortly after (they're often a line or two behind the singer).
  const teamAt = (t: number) => {
    let now: (typeof team)[number] | null = null;
    for (const e of team) if (e.at <= t) now = e;
    const soon = team.find((e) => e.at > t && e.at - t <= TEAM_LAG_MS && e.id);
    const pick = soon && soon.id !== now?.id ? soon : now;
    return pick?.id ? pick : null;
  };

  const report: ReplayReport = { lines: 0, checked: 0, sameSong: 0, sameSlide: 0, autoShows: 0, wrongShows: 0, offered: 0, offeredRight: 0, found: [] };
  let current: { id: string; slide: number } | null = null;
  const firstHeard = new Map<string, number>();
  const foundAt = new Map<string, number>();

  for (const e of events) {
    if (e.kind !== "heard" || !e.heard) continue;
    const t = Date.parse(e.at);
    report.lines++;
    const want = teamAt(t);
    const o = engine.hear({ recent: e.heard, final: true, current, follow: true, now: t });
    if (o.show) {
      if (o.show.how === "auto") {
        report.autoShows++;
        if (want && want.id !== o.show.id) report.wrongShows++;
      }
      engine.shown(o.show.id, current, t);
      current = { id: o.show.id, slide: o.show.slide };
    }
    if (o.suggestions.length && want) {
      report.offered++;
      if (o.suggestions.some((s) => s.id === want.id)) report.offeredRight++;
    }
    if (!want) continue;
    report.checked++;
    if (!firstHeard.has(want.id)) firstHeard.set(want.id, t);
    if (current?.id === want.id) {
      report.sameSong++;
      if (!foundAt.has(want.id)) foundAt.set(want.id, t);
      if (current.slide === want.slide) report.sameSlide++;
    }
  }
  report.found = [...firstHeard].map(([id, t]) => ({ song_id: id, seconds: foundAt.has(id) ? Math.round((foundAt.get(id)! - t) / 1000) : null }));
  return report;
}
