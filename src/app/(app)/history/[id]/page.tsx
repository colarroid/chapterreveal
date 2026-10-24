import { ArrowLeft, BookOpen, Clock, Music } from "lucide-react";
import Link from "next/link";
import { PendingIcon } from "@/components/pending";
import { Chip } from "@/components/ui";
import { notFound } from "next/navigation";
import { requireMembership, supabaseServer } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/format";
import { DetectionCheck } from "./detection-check";
import { ExportButton } from "./export";
import { ScriptureCheck } from "./scripture-check";

export const metadata = { title: "Service" };

interface Shown {
  id: number;
  label: string;
  translation: string;
  source: string;
  segment_seq: number | null;
  char_start: number | null;
  char_end: number | null;
  shown_at: string;
}

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await requireMembership();
  const supabase = await supabaseServer();

  const [{ data: service }, { data: segments }, { data: shown }, { data: songs }, { count: detections }] = await Promise.all([
    supabase.from("services").select("id, started_at, ended_at").eq("id", id).maybeSingle(),
    supabase.from("transcript_segments").select("seq, start_ms, text").eq("service_id", id).order("seq").limit(5000),
    supabase.from("verses_shown").select("id, label, translation, source, segment_seq, char_start, char_end, shown_at").eq("service_id", id).order("shown_at"),
    // Before migrations 0024 and 0027 these tables are missing: no songs, no check.
    supabase.from("songs_shown").select("id, song_id, title, shown_at").eq("service_id", id).order("shown_at"),
    supabase.from("song_detections").select("id", { count: "exact", head: true }).eq("service_id", id).eq("kind", "heard"),
  ]);
  if (!service) notFound();

  // Where each shown verse was spoken, by segment.
  const marks = new Map<number, Shown[]>();
  for (const v of (shown ?? []) as Shown[]) {
    if (v.segment_seq == null || v.char_start == null || v.char_end == null) continue;
    marks.set(v.segment_seq, [...(marks.get(v.segment_seq) ?? []), v]);
  }

  const started = new Date(service.started_at);
  const clock = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Link href="/history" className="inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink active:scale-95">
        <PendingIcon>
          <ArrowLeft size={16} />
        </PendingIcon>{" "}
        History
      </Link>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {started.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Chip>
              <Clock size={13} /> {started.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · {formatDuration(service.started_at, service.ended_at)}
            </Chip>
            <Chip tone={shown?.length ? "ok" : "neutral"}>
              <BookOpen size={13} /> {shown?.length ?? 0} verses shown
            </Chip>
          </div>
        </div>
        <div className="ml-auto">
          <ExportButton
            filename={`service-${service.started_at.slice(0, 10)}.txt`}
            segments={(segments ?? []).map((s) => ({ at: clock(s.start_ms), text: s.text }))}
            verses={((shown ?? []) as Shown[]).map((v) => ({ at: new Date(v.shown_at).toLocaleTimeString(), label: `${v.label} (${v.translation.toUpperCase()})` }))}
          />
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="card p-5">
          <h2 className="font-bold">Transcript</h2>
          {!segments?.length ? (
            <p className="mt-3 text-muted">No transcript was saved for this service.</p>
          ) : (
            <div className="mt-4 space-y-2.5 leading-relaxed">
              {segments.map((s) => (
                <p key={s.seq} className="grid grid-cols-[4.5rem_1fr] gap-3">
                  <span className="pt-0.5 font-mono text-xs text-faint tabular-nums">{clock(s.start_ms)}</span>
                  <span>
                    <Marked text={s.text} marks={marks.get(s.seq) ?? []} />
                  </span>
                </p>
              ))}
            </div>
          )}
        </section>
        <aside className="h-fit card p-5 lg:sticky lg:top-4">
          <h2 className="font-bold">Verses shown</h2>
          <ol className="mt-4 space-y-3 text-sm">
            {((shown ?? []) as Shown[]).map((v) => (
              <li key={v.id} className="flex items-baseline gap-3">
                <span className="w-14 shrink-0 font-mono text-xs text-faint tabular-nums">
                  {new Date(v.shown_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </span>
                <span className="min-w-0">
                  <span className="font-bold">{v.label}</span>{" "}
                  <span className="text-faint">{v.source === "search" ? "searched" : v.source === "step" ? "stepped" : ""}</span>
                </span>
              </li>
            ))}
            {!shown?.length && <li className="text-muted">None.</li>}
          </ol>
          {!!shown?.length && !!segments?.length && m.role === "admin" && <ScriptureCheck serviceId={service.id} startedAt={service.started_at} />}
          {!!songs?.length && (
            <>
              <h2 className="mt-6 flex items-center gap-2 font-bold">
                <Music size={15} className="text-muted" /> Songs sung
              </h2>
              <ol className="mt-3 space-y-2 text-sm">
                {songs.map((s) => (
                  <li key={s.id} className="flex items-baseline gap-3">
                    <span className="w-14 shrink-0 font-mono text-xs text-faint tabular-nums">
                      {new Date(s.shown_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </span>
                    <span className="min-w-0 font-bold">{s.title}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          {!!detections && m.role === "admin" && (
            <DetectionCheck serviceId={service.id} churchId={m.churchId} titles={Object.fromEntries((songs ?? []).filter((s) => s.song_id).map((s) => [s.song_id, s.title]))} />
          )}
        </aside>
      </div>
    </main>
  );
}

function Marked({ text, marks }: { text: string; marks: Shown[] }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  const seen = new Set<string>();
  for (const m of [...marks].sort((a, b) => a.char_start! - b.char_start!)) {
    const key = `${m.char_start}-${m.char_end}`;
    if (seen.has(key) || m.char_start! < at) continue;
    seen.add(key);
    parts.push(text.slice(at, m.char_start!));
    parts.push(
      <mark key={key} title={`Shown: ${m.label}`} className="rounded bg-accent-fill/20 px-0.5 font-semibold text-accent">
        {text.slice(m.char_start!, m.char_end!)}
      </mark>,
    );
    at = m.char_end!;
  }
  parts.push(text.slice(at));
  return <>{parts}</>;
}
