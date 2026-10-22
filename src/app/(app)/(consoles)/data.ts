import "server-only";
import { after } from "next/server";
import { cloudinaryConfig, destroy } from "@/lib/cloudinary";
import { cleanDisplay, type DisplaySettings } from "@/lib/display/theme";
import { cleanTakeDown, type TakeDown } from "@/lib/live/take-down";
import type { Plan } from "@/lib/plans";
import { findTranslation, type TranslationInfo } from "@/lib/scripture/translations";
import { getStarredTranslations, getTranslations } from "@/lib/scripture/translations-server";
import { supabaseServer, type Membership } from "@/lib/supabase/server";
import type { SavedSlide } from "./slides/slides";
import type { Setlist } from "./songs/setlist";
import type { LibrarySong } from "./songs/worship";

// What each console needs, loaded once when the consoles open (the three of
// them stay mounted after that; see workspace.tsx). Each is its own promise,
// so a console shows as soon as its own data is in.

/** Shared by all three consoles. */
export interface ConsoleBase {
  churchId: string;
  userId: string;
  screenToken: string;
  silenceEndMinutes: number;
  display: DisplaySettings;
  canEditDisplay: boolean;
  /** When verses come off the screen on their own. */
  takeDown: TakeDown;
}

export const baseFor = (m: Membership): ConsoleBase => ({
  churchId: m.churchId,
  userId: m.userId,
  screenToken: m.screenToken,
  silenceEndMinutes: m.settings.silence_end_minutes ?? 20,
  display: cleanDisplay(m.settings.display),
  canEditDisplay: m.role === "admin",
  takeDown: cleanTakeDown(m.settings),
});

export interface ScriptureData {
  translationId: string;
  translations: TranslationInfo[];
  starred: string[];
}

export async function loadScripture(m: Membership): Promise<ScriptureData> {
  const [translations, starred] = await Promise.all([getTranslations(), getStarredTranslations(m.userId)]);
  return { translationId: findTranslation(translations, m.settings.translation ?? "kjv").id, translations, starred };
}

export type SongsData = { library: LibrarySong[]; setlists: Setlist[] } | { error: string };

const PAGE = 1000; // Supabase returns at most this many rows per request.

export async function loadSongs(m: Membership): Promise<SongsData> {
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
  for (const { data, error } of [first, ...rest]) {
    if (error) return { error: `Could not load songs: ${error.message}. Has migration 0008 been run?` };
    for (const r of data ?? []) {
      library.push({ id: r.id, title: r.title, author: r.author, firstLine: r.first_line, shared: r.church_id === null });
    }
  }
  const { data: setlists } = await setlistsQuery;
  return { library, setlists: (setlists ?? []) as Setlist[] };
}

export type SlidesData = { plan: Plan; initial: SavedSlide[] } | { error: string };

export async function loadSlides(m: Membership): Promise<SlidesData> {
  const supabase = await supabaseServer();
  // Expired pictures and videos (Free plan) leave the list first. Their files
  // are deleted from Cloudinary after the response, so nobody waits on it.
  const { data: expired } = await supabase.rpc("take_expired_slides");
  const config = cloudinaryConfig();
  if (config && Array.isArray(expired) && expired.length) {
    // Every picture on an expired picture slide, or the video.
    const files = (expired as { public_id: string | null; kind: string; images?: { public_id: string }[] | null }[]).flatMap((e) =>
      e.kind === "image" && e.images?.length
        ? e.images.map((i) => ({ kind: "image" as const, id: i.public_id }))
        : e.public_id
          ? [{ kind: e.kind === "video" ? ("video" as const) : ("image" as const), id: e.public_id }]
          : [],
    );
    after(() => Promise.allSettled(files.map((x) => destroy(config, x.kind, x.id))));
  }
  const [{ data, error }, { data: plan }] = await Promise.all([
    supabase.from("slides").select("id, kind, title, body, image_url, images, position, expires_at").eq("church_id", m.churchId).order("position").order("created_at"),
    supabase.rpc("church_plan", { p_church: m.churchId }),
  ]);
  if (error) return { error: `Could not load slides: ${error.message}. Have migrations 0020 and 0021 been run?` };
  return { plan: (plan as Plan) === "paid" ? "paid" : "free", initial: (data ?? []) as SavedSlide[] };
}
