"use client";

// Every song's words for the worship console: the shared library and every
// church's songs (only the church's own can be edited). Loading them all takes a few seconds, so they're kept:
//   - in memory, so switching tabs and coming back is instant;
//   - in the browser (Cache Storage), so the next visit opens straight away
//     while a fresh copy downloads in the background.
// Each church's copy is stored under its own key; signing out clears them.
import { supabaseBrowser } from "@/lib/supabase/client";
import type { SongSlide } from "./songs";

export interface FullSong {
  id: string;
  title: string;
  author: string;
  copyright: string;
  ccli_number: string;
  slides: SongSlide[];
  /** Not this church's own (the shared library or another church's). */
  shared: boolean;
  /** This church's version of another song: the original's id. */
  basedOn?: string | null;
}

const STORE = "scripture-songs";
const PAGE = 1000; // Supabase returns at most this many rows per request.
/** A copy younger than this isn't downloaded again when the page opens. */
const FRESH_MS = 2 * 60_000;

const storeKey = (churchId: string) => `/__songs/${churchId}.json`;

let memory: { churchId: string; songs: FullSong[]; fetchedAt: number } | null = null;

/** This session's copy, if this church's songs were loaded already. */
export function songsInMemory(churchId: string): FullSong[] | null {
  return memory?.churchId === churchId ? memory.songs : null;
}

/** Whether this session's copy is recent enough to skip downloading again. */
export function songsAreFresh(churchId: string): boolean {
  return memory?.churchId === churchId && Date.now() - memory.fetchedAt < FRESH_MS;
}

/** The copy saved in this browser on an earlier visit. */
export async function storedSongs(churchId: string): Promise<FullSong[] | null> {
  try {
    const hit = await (await caches.open(STORE)).match(storeKey(churchId));
    return hit ? ((await hit.json()) as FullSong[]) : null;
  } catch {
    return null;
  }
}

/** Keeps a copy in memory and in the browser. `fetched`: it just came from the server. */
export function keepSongs(churchId: string, songs: FullSong[], fetched = false) {
  memory = { churchId, songs, fetchedAt: fetched ? Date.now() : memory?.churchId === churchId ? memory.fetchedAt : 0 };
  void caches
    ?.open(STORE)
    .then((c) => c.put(storeKey(churchId), new Response(JSON.stringify(songs), { headers: { "Content-Type": "application/json" } })))
    .catch(() => {});
}

/** Clears the saved songs (on sign out: they include the church's own). */
export function forgetSongs() {
  memory = null;
  void globalThis.caches?.delete(STORE).catch(() => {});
}

/** Downloads every song, all pages at once. */
export async function fetchAllSongs(churchId: string): Promise<FullSong[]> {
  const supabase = supabaseBrowser();
  const { count, error } = await supabase.from("songs").select("id", { count: "exact", head: true });
  if (error) throw error;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const load = (cols: string) =>
    Promise.all(
      Array.from({ length: pages }, (_, p) =>
        supabase
          .from("songs")
          .select(cols)
          .order("title")
          .order("id")
          .range(p * PAGE, p * PAGE + PAGE - 1),
      ),
    );
  // based_on: a church's own version of a song (migration 0030; without it, none).
  let results = await load("id, title, author, copyright, ccli_number, slides, church_id, based_on");
  if (results.some((r) => r.error)) results = await load("id, title, author, copyright, ccli_number, slides, church_id");
  type Row = Omit<FullSong, "shared" | "basedOn"> & { church_id: string | null; based_on?: string | null };
  const rows: Row[] = [];
  for (const { data, error: e } of results) {
    if (e) throw e;
    rows.push(...((data ?? []) as unknown as Row[]));
  }
  // This church's versions stand in for the songs they were made from.
  const replaced = new Set(rows.filter((r) => r.church_id === churchId && r.based_on).map((r) => r.based_on));
  const out: FullSong[] = rows
    .filter((r) => !replaced.has(r.id))
    .map(({ church_id, based_on, ...r }) => ({ ...r, shared: church_id !== churchId, basedOn: based_on ?? null }));
  // Songs added between the count and the pages land on a page beyond the
  // last; they arrive on the next refresh.
  return out;
}
