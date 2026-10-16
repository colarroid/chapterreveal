import { Notice } from "@/components/ui";
import { cleanDisplay } from "@/lib/display/theme";
import { requireMembership, supabaseServer } from "@/lib/supabase/server";
import type { Setlist } from "./setlist";
import { Worship, type LibrarySong } from "./worship";

export const metadata = { title: "Song Lyrics" };

const PAGE = 1000; // Supabase returns at most this many rows per request.

export default async function SongsPage() {
  const m = await requireMembership();
  const supabase = await supabaseServer();

  // Setlists load alongside the songs (none yet, or before migration 0009, is fine).
  // (Promise.resolve starts the request now; a bare query waits to be awaited.)
  const setlistsQuery = Promise.resolve(
    supabase.from("setlists").select("id, name, song_ids").eq("church_id", m.churchId).order("updated_at", { ascending: false }).limit(30),
  );

  // Titles only, the shared library and the church's own (the database
  // decides which rows this church can see). The words load in the browser.
  // The first page also says how many there are; the rest come at once.
  const page = (p: number, count = false) =>
    Promise.resolve(
      supabase
        .from("songs")
        .select("id, title, author, first_line, church_id", count ? { count: "exact" } : undefined)
        .order("title")
        .order("id")
        .range(p * PAGE, p * PAGE + PAGE - 1),
    );
  const first = await page(0, true);
  const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil((first.count ?? 0) / PAGE) - 1) }, (_, i) => page(i + 1)));
  const library: LibrarySong[] = [];
  let error: string | null = null;
  for (const { data, error: e } of [first, ...rest]) {
    if (e) {
      error = e.message;
      break;
    }
    for (const r of data ?? []) {
      library.push({
        id: r.id,
        title: r.title,
        author: r.author,
        firstLine: r.first_line,
        shared: r.church_id === null,
      });
    }
  }

  const { data: setlists } = await setlistsQuery;

  if (error) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <Notice tone="error">Could not load songs: {error}. Has migration 0008 been run?</Notice>
      </main>
    );
  }
  return (
    <Worship
      churchId={m.churchId}
      userId={m.userId}
      screenToken={m.screenToken}
      silenceEndMinutes={m.settings.silence_end_minutes ?? 20}
      display={cleanDisplay(m.settings.display)}
      canEditDisplay={m.role === "admin"}
      library={library}
      setlists={(setlists ?? []) as Setlist[]}
    />
  );
}
