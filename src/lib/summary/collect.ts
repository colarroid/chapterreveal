import type { SupabaseClient } from "@supabase/supabase-js";

/** One service, as the weekly summary tells it. */
export interface ServiceDigest {
  id: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number;
  /** Scriptures shown, in order, each once: "John 3:16 (KJV)". */
  verses: string[];
  /** Songs put on screen, in order, each once. */
  songs: string[];
  /** Everything heard, line after line. */
  transcript: string;
  words: number;
}

const once = (list: string[]) => [...new Set(list)];

// Supabase returns at most 1,000 rows a request; a long service has more lines.
async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

/**
 * The church's services that started between `from` and `to`, with what was
 * shown and said. Works with a signed-in client (RLS keeps it to the user's
 * church) or the service role (the weekly job).
 */
export async function collectServices(supabase: SupabaseClient, churchId: string, from: Date, to: Date): Promise<ServiceDigest[]> {
  const { data: services, error } = await supabase
    .from("services")
    .select("id, started_at, ended_at, audio_seconds")
    .eq("church_id", churchId)
    .gte("started_at", from.toISOString())
    .lt("started_at", to.toISOString())
    .order("started_at");
  if (error) throw new Error(error.message);
  if (!services?.length) return [];

  const ids = services.map((s) => s.id);
  const [segments, verses, songs] = await Promise.all([
    allRows<{ service_id: string; seq: number; text: string }>((lo, hi) =>
      supabase.from("transcript_segments").select("service_id, seq, text").in("service_id", ids).order("service_id").order("seq").range(lo, hi),
    ),
    supabase.from("verses_shown").select("service_id, label, translation, shown_at").in("service_id", ids).order("shown_at").limit(5000),
    // Missing until migration 0024 runs; the summary goes out without songs then.
    supabase.from("songs_shown").select("service_id, title, shown_at").in("service_id", ids).order("shown_at").limit(2000),
  ]);
  if (verses.error) throw new Error(verses.error.message);

  return services.map((s) => {
    const transcript = segments.filter((t) => t.service_id === s.id).map((t) => t.text as string).join("\n");
    const end = s.ended_at ? new Date(s.ended_at).getTime() : null;
    const minutes = end ? Math.round((end - new Date(s.started_at).getTime()) / 60000) : Math.round((s.audio_seconds ?? 0) / 60);
    return {
      id: s.id,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      minutes,
      verses: once((verses.data ?? []).filter((v) => v.service_id === s.id).map((v) => `${v.label} (${String(v.translation).toUpperCase()})`)),
      songs: once((songs.data ?? []).filter((v) => v.service_id === s.id).map((v) => v.title as string)),
      transcript,
      words: transcript ? transcript.split(/\s+/).length : 0,
    };
  });
}
