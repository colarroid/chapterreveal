"use client";

// Every song's words for the worship console: the whole ReedArk library,
// since detection listens for any song, with the church's own version where
// it has one and each song marked in its library or not. Loading them all takes a few seconds, so they're kept:
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
  /** The church's own version (its edit of the library song). */
  edited?: boolean;
  /** In the church's library; otherwise only in ReedArk's, for detection. */
  inLibrary?: boolean;
}

/** A tag (church_songs) with its library song: the church's version wins where it has one. */
export interface TagRow {
  song_id: string;
  title: string | null;
  author: string | null;
  slides: SongSlide[] | null;
  songs: { title: string; author: string; copyright: string; ccli_number: string; slides: SongSlide[] } | null;
}

export const TAG_COLUMNS = "song_id, title, author, slides, songs(title, author, copyright, ccli_number, slides)";

/** A tag as the console's song: the church's version, else the library's. */
export function fromTag(t: TagRow): FullSong | null {
  const s = t.songs;
  if (!s) return null;
  return {
    id: t.song_id,
    title: t.title ?? s.title,
    author: t.author ?? s.author,
    copyright: s.copyright,
    ccli_number: s.ccli_number,
    slides: t.slides ?? s.slides,
    edited: t.slides !== null || t.title !== null,
    inLibrary: true,
  };
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
/** Every row of a table, all pages at once. */
async function allPages<T>(count: () => PromiseLike<{ count: number | null; error: unknown }>, page: (from: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { count: n, error } = await count();
  if (error) throw error;
  const pages = Math.max(1, Math.ceil((n ?? 0) / PAGE));
  const results = await Promise.all(Array.from({ length: pages }, (_, i) => page(i * PAGE)));
  const out: T[] = [];
  for (const { data, error: e } of results) {
    if (e) throw e;
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

export async function fetchAllSongs(churchId: string): Promise<FullSong[]> {
  const supabase = supabaseBrowser();
  const [tags, library] = await Promise.all([
    allPages<TagRow>(
      () => supabase.from("church_songs").select("song_id", { count: "exact", head: true }).eq("church_id", churchId),
      (from) => supabase.from("church_songs").select(TAG_COLUMNS).eq("church_id", churchId).order("song_id").range(from, from + PAGE - 1),
    ),
    allPages<Omit<FullSong, "edited" | "inLibrary">>(
      () => supabase.from("songs").select("id", { count: "exact", head: true }),
      (from) => supabase.from("songs").select("id, title, author, copyright, ccli_number, slides").order("id").range(from, from + PAGE - 1),
    ),
  ]);
  // The church's songs as it has them; every other song as the library has it.
  const out = new Map<string, FullSong>();
  for (const s of library) out.set(s.id, { ...s, inLibrary: false });
  for (const t of tags) {
    const song = fromTag(t);
    if (song) out.set(song.id, song);
  }
  // Songs added between the count and the pages land on a page beyond the
  // last; they arrive on the next refresh.
  return [...out.values()].sort((a, b) => a.title.localeCompare(b.title));
}
