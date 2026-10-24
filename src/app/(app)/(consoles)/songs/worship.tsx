"use client";

import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ListOrdered,
  LoaderCircle,
  Lock as LockIcon,
  LockOpen,
  Mic,
  Maximize,
  MonitorOff,
  MonitorUp,
  Music,
  Pencil,
  Plus,
  Search,
  Square,
  Trash2,
  Undo2,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmDialog } from "@/components/confirm";
import { askToGoLive, mayProjectHere } from "@/lib/live/present-check";
import { DisplayQuick } from "@/components/display-quick";
import { Dropdown } from "@/components/dropdown";
import { SlideView } from "@/components/slide-view";
import { cleanDisplay, type DisplaySettings } from "@/lib/display/theme";
import { Button, Chip, IconButton, Kbd, Notice } from "@/components/ui";
import { closeProjector, fillProjectorScreen, presentOnProjector, useProjectorOpen } from "@/lib/live/present";
import { CONSOLE_CHANNEL, SCREEN_TAKEN, ScreenSender, TAKEN_ELSEWHERE, type ConsoleMessage } from "@/lib/live/screen";
import type { Slide } from "@/lib/scripture/bible";
import { songKeyterms } from "@/lib/songs/keyterms";
import { outbox } from "@/lib/live/outbox";
import { FollowEngine, usageLift, type Suggested } from "@/lib/songs/engine";
import { SongIndex } from "@/lib/songs/matcher";
import { cleanOrder, learnOrder, nextPosition, partStarts, positionOf, sameWords, writtenOrder, type Order, type OrderSource } from "@/lib/songs/order";
import { fetchAllSongs, keepSongs, songsAreFresh, songsInMemory, storedSongs, type FullSong } from "@/lib/songs/store";
import { firstLine, songBody } from "@/lib/songs/songs";
import { supabaseBrowser } from "@/lib/supabase/client";
import { EndServiceButton, LevelMeter } from "../dashboard/console";
import { useLiveService } from "../dashboard/use-live-service";
import { useConsoleActive } from "../active";
import { SwitchTrack } from "@/components/motion";
import { ArrangeOrder } from "./arrange";
import { PublicLibrary } from "./public-library";
import { SetlistPanel, type Setlist } from "./setlist";
import { SongEditor, type SongFields } from "./song-editor";

export interface LibrarySong {
  id: string;
  title: string;
  author: string;
  firstLine: string;
  /** The church's own version (its edit of the library song). */
  edited?: boolean;
}

const SETLIST_KEY = "scripture.setlist";

/** The slide selected, and where it is in the song's order. */
interface Current {
  id: string;
  slide: number;
  pos?: number;
}

/** What put a slide on screen, for the detection log. */
type ShownHow = "auto" | "early" | "suggestion" | "operator";



const AUTO_KEY = "scripture.worshipAuto";
const SHOWN = 300;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** Per song, per slide index: the words as they'll be sung today. */
type Edits = Record<string, Record<number, string>>;

function withEdits(song: FullSong, edits: Edits): FullSong {
  const e = edits[song.id];
  if (!e || !Object.keys(e).length) return song;
  return { ...song, slides: song.slides.map((s, i) => (e[i] !== undefined ? { ...s, text: e[i] } : s)) };
}

function toSlide(song: FullSong, i: number): Slide | null {
  const s = song.slides[i];
  if (!s) return null;
  return {
    kind: "song",
    label: `${song.title} (${i + 1}/${song.slides.length})`,
    lines: s.text.split("\n").map((text) => ({ verse: 0, text })),
    translation: "",
    copyright: song.copyright || undefined,
  };
}

export function Worship({
  churchId,
  userId,
  screenToken,
  silenceEndMinutes,
  library,
  setlists: initialSetlists,
  display: initialDisplay,
  canEditDisplay,
}: {
  churchId: string;
  userId: string;
  screenToken: string;
  silenceEndMinutes: number;
  library: LibrarySong[];
  setlists: Setlist[];
  /** How the projector looks (Settings → Display). */
  display: DisplaySettings;
  /** Church admins can change the look from the console. */
  canEditDisplay: boolean;
}) {
  const active = useConsoleActive();
  const router = useRouter();

  // ---- The songs' words -------------------------------------------------------
  // From memory when this tab was open before, else this browser's saved copy
  // (instant), while a fresh copy downloads in the background (lib/songs/store).
  const [songs, setSongs] = useState<FullSong[] | null>(() => songsInMemory(churchId));
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let live = true;
    if (!songsInMemory(churchId)) void storedSongs(churchId).then((saved) => live && saved && setSongs((cur) => cur ?? saved));
    if (songsAreFresh(churchId)) return;
    fetchAllSongs(churchId).then(
      (fresh) => {
        if (!live) return;
        keepSongs(churchId, fresh, true);
        setSongs(fresh);
        setLoadError("");
      },
      // Offline or failed: the saved copy (if any) carries on; say so only without one.
      () => live && !songsRef.current && setLoadError("Could not load the songs. Check the connection and reload."),
    );
    return () => {
      live = false;
    };
  }, [churchId]);
  // Songs added, edited or deleted here go into the kept copy too.
  useEffect(() => {
    if (songs && songs !== songsInMemory(churchId)) keepSongs(churchId, songs);
  }, [songs, churchId]);
  const byId = useMemo(() => new Map((songs ?? []).map((s, i) => [s.id, i])), [songs]);
  const index = useMemo(() => (songs ? new SongIndex(songs) : null), [songs]);

  // ---- Setlists --------------------------------------------------------------
  // The chosen setlist's songs are listened for first; songs outside it are
  // only ever suggested, never put up on their own.
  const [setlists, setSetlists] = useState(initialSetlists);
  const [setlistId, setSetlistId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETLIST_KEY);
      if (saved && initialSetlists.some((s) => s.id === saved)) setSetlistId(saved);
    } catch {}
  }, [initialSetlists]);
  const chooseSetlist = useCallback((id: string | null) => {
    setSetlistId(id);
    try {
      if (id) localStorage.setItem(SETLIST_KEY, id);
      else localStorage.removeItem(SETLIST_KEY);
    } catch {}
  }, []);
  const activeSetlist = setlists.find((s) => s.id === setlistId) ?? null;
  const setIndex = useMemo(() => {
    if (!songs || !activeSetlist?.song_ids.length) return null;
    const list = activeSetlist.song_ids.map((id) => songs[byId.get(id) ?? -1]).filter(Boolean);
    return list.length ? new SongIndex(list) : null;
  }, [songs, byId, activeSetlist]);
  const titles = useMemo(() => new Map(library.map((s) => [s.id, s.title])), [library]);

  const saveSetlist = useCallback(async (id: string, patch: Partial<Pick<Setlist, "name" | "song_ids">>) => {
    setSetlists((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    await supabaseBrowser()
      .from("setlists")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
  }, []);
  const createSetlist = useCallback(async () => {
    const name = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "short" }).format(new Date());
    const { data } = await supabaseBrowser().from("setlists").insert({ church_id: churchId, created_by: userId, name }).select("id, name, song_ids").single();
    if (!data) return;
    setSetlists((all) => [data as Setlist, ...all]);
    chooseSetlist(data.id);
  }, [churchId, userId, chooseSetlist]);
  const deleteSetlist = useCallback(
    async (id: string) => {
      setSetlists((all) => all.filter((s) => s.id !== id));
      chooseSetlist(null);
      await supabaseBrowser().from("setlists").delete().eq("id", id);
    },
    [chooseSetlist],
  );
  const addToSetlist = useCallback(
    (songId: string) => {
      if (activeSetlist && !activeSetlist.song_ids.includes(songId)) void saveSetlist(activeSetlist.id, { song_ids: [...activeSetlist.song_ids, songId] });
    },
    [activeSetlist, saveSetlist],
  );

  // ---- What's selected and what's on screen --------------------------------
  // `pos`: where in the song's order the slide is (a chorus comes up more than once).
  const [current, setCurrent] = useState<Current | null>(null);
  const currentRef = useRef(current);
  const [isLive, setIsLive] = useState(false);
  const liveRef = useRef(false);
  // Esc: the lyrics come off, the background and Live stay (Enter brings them back).
  const [cleared, setCleared] = useState(false);
  const clearedRef = useRef(false);
  const markCleared = useCallback((on: boolean) => {
    clearedRef.current = on;
    setCleared(on);
  }, []);
  const screen = useRef<ScreenSender | null>(null);
  // Words changed for this service only (a choir that sings it differently).
  // Kept in memory, never saved: reloading or ending worship drops them.
  const [edits, setEdits] = useState<Edits>({});
  const editsRef = useRef(edits);
  const original = current ? (songs?.[byId.get(current.id) ?? -1] ?? null) : null;
  const currentSong = useMemo(() => (original ? withEdits(original, edits) : null), [original, edits]);

  const songsRef = useRef(songs);
  const byIdRef = useRef(byId);
  useEffect(() => {
    songsRef.current = songs;
    byIdRef.current = byId;
    editsRef.current = edits;
  }, [songs, byId, edits]);
  /** A song as it's sung today: the library's words with this service's edits. */
  const songById = useCallback((id: string) => {
    const song = songsRef.current?.[byIdRef.current.get(id) ?? -1];
    return song ? withEdits(song, editsRef.current) : null;
  }, []);

  /** Changes one slide's words for this service (null puts the original back). */
  const editSlide = useCallback((songId: string, index: number, text: string | null) => {
    const next = { ...editsRef.current, [songId]: { ...editsRef.current[songId] } };
    if (text === null) delete next[songId][index];
    else next[songId][index] = text;
    editsRef.current = next;
    setEdits(next);
    // The edited slide is on screen: show the new words straight away.
    const cur = currentRef.current;
    const song = songById(songId);
    if (liveRef.current && cur?.id === songId && cur.slide === index && song) void screen.current?.show(toSlide(song, index));
  }, [songById]);
  const selectedSlide = currentSong && current ? toSlide(currentSong, current.slide) : null;

  // ---- The order songs are sung in ------------------------------------------
  // This church's order for a song (learned in its services, or arranged by
  // hand: its variation), else the shared profile of a copied public song
  // (how it's most often sung across every church's services), else as
  // written (lib/songs/order.ts, migrations 0028 and 0031).
  const [orders, setOrders] = useState(new Map<string, { slides: Order; source: "sung" | "arranged" }>());
  const [profiles, setProfiles] = useState(new Map<string, { slides: Order; performances: number }>());
  const [asWritten, setAsWritten] = useState(false);
  // Arranging the open song by hand (./arrange.tsx); the console's keys rest meanwhile.
  const [arranging, setArranging] = useState(false);
  const arrangingRef = useRef(arranging);
  useEffect(() => {
    arrangingRef.current = arranging;
  }, [arranging]);
  useEffect(() => {
    const supabase = supabaseBrowser();
    // Before migration 0028 neither exists: songs stay as written.
    void supabase
      .from("song_orders")
      .select("song_id, slides, source")
      .then(({ data }) => setOrders(new Map((data ?? []).map((r) => [r.song_id as string, { slides: r.slides as Order, source: r.source as "sung" | "arranged" }]))));
    void supabase
      .rpc("song_profiles")
      .then(({ data }) =>
        setProfiles(new Map(((data ?? []) as { song_id: string; slides: Order; performances: number }[]).map((r) => [r.song_id, { slides: r.slides, performances: r.performances }]))),
      );
  }, [churchId]);
  const orderOf = useCallback(
    (song: { id: string; slides: unknown[] } | null): { order: Order; source: OrderSource; performances?: number } => {
      if (!song) return { order: [], source: "written" };
      const n = song.slides.length;
      if (!asWritten) {
        const own = orders.get(song.id);
        const mine = own && cleanOrder(own.slides, n);
        if (mine) return { order: mine, source: own.source };
        const c = profiles.get(song.id);
        const usual = c && cleanOrder(c.slides, n);
        if (usual) return { order: usual, source: "common", performances: c.performances };
      }
      return { order: writtenOrder(n), source: "written" };
    },
    [orders, profiles, asWritten],
  );
  const orderOfRef = useRef(orderOf);
  useEffect(() => {
    orderOfRef.current = orderOf;
  }, [orderOf]);
  /** A song opened at the start of its order. */
  const startOf = useCallback((id: string): Current => {
    const order = orderOfRef.current(songById(id)).order;
    return { id, slide: order[0] ?? 0, pos: 0 };
  }, [songById]);
  /** The slide after this one in the song's order, if any. */
  const nextOf = useCallback((cur: Current): number | undefined => {
    const order = orderOfRef.current(songById(cur.id)).order;
    return order[(cur.pos ?? positionOf(order, cur.slide)) + 1];
  }, [songById]);
  const currentOrder = orderOf(currentSong);
  const openId = current?.id;
  useEffect(() => setArranging(false), [openId]);

  /** Keeps this church's order for a song (null: back to the written order). */
  const saveOrder = useCallback(
    async (songId: string, slides: Order | null, source: "sung" | "arranged") => {
      if (!/^[0-9a-f-]{36}$/i.test(songId)) return;
      setOrders((m) => {
        const next = new Map(m);
        if (slides) next.set(songId, { slides, source });
        else next.delete(songId);
        return next;
      });
      const table = supabaseBrowser().from("song_orders");
      if (slides) await table.upsert({ church_id: churchId, song_id: songId, slides, source, updated_by: userId, updated_at: new Date().toISOString() });
      else await table.delete().eq("church_id", churchId).eq("song_id", songId);
    },
    [churchId, userId],
  );
  const ordersRef = useRef(orders);
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // What went on screen during a service, song by song: when a song is
  // finished, the order it was sung in is kept (unless arranged by hand).
  const path = useRef<{ id: string; steps: { slide: number; at: number }[] } | null>(null);
  const serviceRef = useRef<string | null>(null);
  const finishSong = useCallback(() => {
    const p = path.current;
    path.current = null;
    if (!p || !serviceRef.current) return;
    const learned = learnOrder(p.steps, Date.now());
    if (!learned) return;
    // Every performance improves the public song's shared profile (copies
    // only, unedited; the database checks).
    void supabaseBrowser().rpc("record_performance", { p_song: p.id, p_slides: learned, p_service: serviceRef.current });
    // The church's own order: what it sang, unless arranged by hand.
    const own = ordersRef.current.get(p.id);
    if (own?.source === "arranged" || (own && own.slides.join() === learned.join())) return;
    void saveOrder(p.id, learned, "sung");
  }, [saveOrder]);

  const [token, setToken] = useState(screenToken);
  const [display, setDisplay] = useState(initialDisplay);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(CONSOLE_CHANNEL);
    bc.onmessage = (e: MessageEvent<ConsoleMessage>) => {
      if (e.data?.type === "screen-token" && e.data.token) setToken(e.data.token);
      // Saved in Settings in this browser: use the new look straight away.
      else if (e.data?.type === "display") setDisplay(cleanDisplay(e.data.display));
    };
    return () => bc.close();
  }, []);
  useEffect(() => {
    if (!token) return;
    const s = new ScreenSender(supabaseBrowser(), churchId, token);
    screen.current = s;
    return () => s.close();
  }, [churchId, token]);

  // Live stays on while another console is open (Auto keeps following the
  // sermon), until another console puts something on the screen: then this
  // one's Live goes off, so it can't knock that off again.
  useEffect(() => {
    const onTaken = (e: Event) => {
      const by = (e as CustomEvent).detail;
      if (by === screen.current) return;
      liveRef.current = false;
      setIsLive(false);
      setElsewhere(by === TAKEN_ELSEWHERE);
    };
    window.addEventListener(SCREEN_TAKEN, onTaken);
    return () => window.removeEventListener(SCREEN_TAKEN, onTaken);
  }, []);
  // Every slide goes out in the songs look; a new look re-sends what's up.
  const shownDisplay = useRef(display);
  useEffect(() => {
    if (!screen.current) return;
    screen.current.theme = display.songs;
    if (shownDisplay.current === display) return;
    shownDisplay.current = display;
    const cur = currentRef.current;
    const song = cur ? songById(cur.id) : null;
    if (liveRef.current && song && cur) void (clearedRef.current ? screen.current.clearWords("song") : screen.current.show(toSlide(song, cur.slide)));
  }, [display, token, songById]);
  const [outputUrl, setOutputUrl] = useState("");
  useEffect(() => setOutputUrl(token ? `${location.origin}/screen/${token}` : ""), [token]);
  const [presenting, setPresenting] = useState(false);
  async function present() {
    if (!outputUrl) return;
    if (!liveRef.current) {
      if (screen.current?.otherOnScreen()) await liveOn();
      else if (await askToGoLive("lyrics")) goLive(true);
    }
    setPresenting(true);
    await presentOnProjector(outputUrl);
    setPresenting(false);
    syncProjector();
  }
  const [projectorOpen, syncProjector, projectorFull] = useProjectorOpen();
  function stopPresenting() {
    closeProjector();
    syncProjector();
  }


  // ---- Following ------------------------------------------------------------
  // Once a song is up it's locked: matching follows its lines and other
  // songs are only suggested until the singing has clearly moved on
  // (lib/songs/follow.ts). The operator can lock it for good (K).
  const engine = useRef(new FollowEngine());
  const [lock, setLock] = useState<{ id: string; manual: boolean } | null>(null);
  const syncLock = useRef<(() => void) | null>(null);
  useEffect(() => {
    syncLock.current = () => {
      const l = engine.current.follower.lock;
      setLock(l ? { ...l } : null);
    };
  }, []);
  const toggleLock = useCallback(() => {
    const f = engine.current.follower;
    const cur = currentRef.current;
    if (f.lock?.manual) f.unlock();
    else if (cur) f.lockTo(cur.id, true);
    syncLock.current?.();
  }, []);
  // How widely each song is sung (migration 0027): a small lift for
  // well-known songs and this church's recent ones, to settle near-ties.
  useEffect(() => {
    void supabaseBrowser()
      .rpc("song_usage")
      .then(({ data }) => {
        engine.current.usage = usageLift((data ?? []) as Parameters<typeof usageLift>[0]);
      });
  }, []);
  // The detection log (migration 0027), set up once the service is known.
  const logDetection = useRef<((row: Record<string, unknown>) => void) | null>(null);

  /**
   * Selects a slide; when live, it goes to the screen first. `how` says
   * what put it there, for the detection log. A new song is locked (see
   * lib/songs/follow.ts), so following stays on it.
   */
  const putUp = useCallback((id: string, slide: number, how: ShownHow = "operator", pos?: number) => {
    const song = songById(id);
    if (!song) return;
    let i = Math.max(0, Math.min(slide, song.slides.length - 1));
    const before = currentRef.current;
    // Where it is in the song's order: as given, the same place if it's the
    // same slide again, back within the part being sung if it's there (the
    // chorus once more from the top), else the next place it comes.
    const order = orderOfRef.current(song).order;
    const from = before?.id === id ? (before.pos ?? -1) : -1;
    const at =
      pos ??
      (before?.id === id && before.slide === i && how !== "early"
        ? (before.pos ?? positionOf(order, i))
        : nextPosition(order, i, from, from >= 0 ? partStarts(song.slides, order) : null, sameWords(song.slides)));
    // A copy of the slide with the same words: show the one at that place.
    if (at >= 0 && order[at] !== undefined) i = order[at];
    // Following landed on what's already up (a copy of it): nothing to do.
    if (how !== "operator" && before?.id === id && before.slide === i && (before.pos === undefined || before.pos === at)) return;
    if (liveRef.current) {
      void screen.current?.show(toSlide(song, i));
      markCleared(false);
      logDetection.current?.({ kind: "shown", decision: how, song_id: id, slide: i, current_song_id: before?.id ?? null, current_slide: before?.slide ?? null });
      // Remembered, to learn the order it's sung in once it's over.
      if (path.current?.id !== id) {
        finishSong();
        path.current = { id, steps: [] };
      }
      path.current.steps.push({ slide: i, at: Date.now() });
    }
    engine.current.shown(id, before);
    syncLock.current?.();
    // A song detection found in ReedArk's library joins this church's when it goes up.
    if (liveRef.current && !song.inLibrary) {
      setSongs((list) => list?.map((x) => (x.id === id ? { ...x, inLibrary: true } : x)) ?? list);
      void supabaseBrowser()
        .from("church_songs")
        .insert({ church_id: churchId, song_id: id, added_by: userId })
        .then(() => router.refresh());
    }
    const next = { id, slide: i, pos: at >= 0 ? at : undefined };
    currentRef.current = next;
    setCurrent(next);
  }, [songById, markCleared, finishSong, churchId, userId, router]);

  const goLive = useCallback((on: boolean) => {
    liveRef.current = on;
    setIsLive(on);
    markCleared(false);
    const cur = currentRef.current;
    const song = cur ? songById(cur.id) : null;
    void screen.current?.show(on && song && cur ? toSlide(song, cur.slide) : null);
  }, [songById, markCleared]);
  // Going live asks first when another computer (or tab) has something on
  // the screen (lib/live/present-check.ts); going off never asks.
  const [elsewhere, setElsewhere] = useState(false);
  const liveOn = useCallback(async () => {
    if (!(await mayProjectHere(screen.current))) return;
    setElsewhere(false);
    goLive(true);
  }, [goLive]);
  const toggleLive = useCallback(() => {
    if (liveRef.current) goLive(false);
    else void liveOn();
  }, [goLive, liveOn]);
  const clear = useCallback(() => {
    if (!liveRef.current) return;
    void screen.current?.clearWords("song");
    markCleared(true);
  }, [markCleared]);

  // Wrong song (W): off the screen (the background stays), no longer
  // followed, and not put up or suggested again for a couple of minutes.
  // Close (×): done with this song. Its cards go, its words come off the
  // screen if they're up, and it's no longer followed.
  const closeSong = useCallback(() => {
    const cur = currentRef.current;
    if (!cur) return;
    if (!clearedRef.current) clear();
    if (engine.current.follower.lock?.id === cur.id) engine.current.follower.unlock();
    currentRef.current = null;
    setCurrent(null);
    syncLock.current?.();
  }, [clear]);

  const rejectSong = useCallback(() => {
    const cur = currentRef.current;
    if (!cur) return;
    engine.current.reject(cur.id);
    if (path.current?.id === cur.id) path.current = null;
    logDetection.current?.({ kind: "shown", decision: "rejected", song_id: cur.id, slide: cur.slide, current_song_id: cur.id, current_slide: cur.slide });
    clear();
    currentRef.current = null;
    setCurrent(null);
    setSuggestions([]);
    syncLock.current?.();
  }, [clear]);

  // Through the song in its order (repeats and all).
  const step = useCallback(
    (dir: 1 | -1) => {
      const cur = currentRef.current;
      if (!cur) return;
      const order = orderOfRef.current(songById(cur.id)).order;
      const at = (cur.pos ?? positionOf(order, cur.slide)) + dir;
      if (at >= 0 && at < order.length) putUp(cur.id, order[at], "operator", at);
    },
    [putUp, songById],
  );

  // ---- Following the singing -----------------------------------------------
  const [auto, setAuto] = useState(true);
  const autoRef = useRef(auto);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AUTO_KEY);
      if (saved !== null) setAuto(saved === "1");
    } catch {}
  }, []);
  useEffect(() => {
    autoRef.current = auto;
    try {
      localStorage.setItem(AUTO_KEY, auto ? "1" : "0");
    } catch {}
  }, [auto]);

  useEffect(() => {
    engine.current.library = index;
    engine.current.playlist = setIndex;
  }, [index, setIndex]);
  const sung = useRef(""); // the last finished lines, kept short
  const [heard, setHeard] = useState("");
  // Songs it could be, best first, while detection isn't sure enough to show one.
  const [suggestions, setSuggestions] = useState<Suggested[]>([]);
  const picksRef = useRef<Suggested[]>([]);

  const onText = useCallback(
    (text: string, final: boolean) => {
      const recent = `${sung.current} ${text}`.trim();
      if (final) sung.current = recent.split(/\s+/).slice(-24).join(" ");
      setHeard(recent.split(/\s+/).slice(-14).join(" "));
      const cur = currentRef.current;
      const o = engine.current.hear({ recent, final, current: cur && { ...cur, next: nextOf(cur) }, follow: autoRef.current, now: Date.now() });
      syncLock.current?.();
      setSuggestions(o.suggestions);
      if (o.show) putUp(o.show.id, o.show.slide, o.show.how);
      // One log line per finished line of singing.
      if (final) {
        logDetection.current?.({
          kind: "heard",
          heard: recent.slice(-600),
          candidates: o.candidates.map((c) => ({ song_id: c.id, slide: c.slide, score: c.score })),
          decision: o.decision,
          song_id: o.chosen?.id ?? null,
          slide: o.chosen?.slide ?? null,
          current_song_id: cur?.id ?? null,
          current_slide: cur?.slide ?? null,
          locked: o.locked,
          playlist: o.playlist,
        });
      }
    },
    [putUp, nextOf],
  );

  // Hints for the transcriber: the setlist's songs, or with no setlist the
  // song that's open. Read when Start worship is pressed.
  const hintSongs = useRef<FullSong[]>([]);
  useEffect(() => {
    const ids = activeSetlist?.song_ids.length ? activeSetlist.song_ids : current ? [current.id] : [];
    hintSongs.current = ids.map((id) => songs?.[byId.get(id) ?? -1]).filter((s): s is FullSong => !!s);
  }, [activeSetlist, current, songs, byId]);
  const session = useCallback(() => ({ mode: "worship" as const, keyterms: songKeyterms(hintSongs.current) }), []);

  const live = useLiveService({ churchId, userId, bible: null, silenceEndMinutes, onText, session });
  useEffect(() => {
    if (live.phase === "idle") {
      sung.current = "";
      setHeard("");
      setSuggestions([]);
    }
  }, [live.phase]);

  useEffect(() => {
    const serviceId = live.serviceId;
    logDetection.current = null;
    if (!serviceId) return;
    let on = true;
    // Only once the table exists (migration 0027): rows for a missing table
    // would wait in this browser's save queue for ever.
    void supabaseBrowser()
      .from("song_detections")
      .select("id", { head: true })
      .limit(1)
      .then(({ error }) => {
        if (!on || error) return;
        logDetection.current = (row) =>
          outbox(supabaseBrowser()).add("song_detections", {
            client_id: crypto.randomUUID(),
            service_id: serviceId,
            church_id: churchId,
            at: new Date().toISOString(),
            ...row,
          });
      });
    return () => {
      on = false;
    };
  }, [live.serviceId, churchId]);

  // Orders are learned during a service only. When it ends, the last
  // song's order is kept too (the clean-up runs before the id changes).
  useEffect(() => {
    serviceRef.current = live.serviceId;
    return () => finishSong();
  }, [live.serviceId, finishSong]);

  // Each song that goes up live during a service, once, for the service
  // history and the weekly summary. Kept offline first, like the verses.
  const loggedSongs = useRef(new Set<string>());
  const liveSongId = isLive ? (current?.id ?? null) : null;
  const liveSongTitle = isLive ? (original?.title ?? "") : "";
  useEffect(() => {
    // Saved songs only (an unsaved draft has no id the database knows).
    if (!liveSongId || !liveSongTitle || !live.serviceId || !/^[0-9a-f-]{36}$/i.test(liveSongId)) return;
    const key = `${live.serviceId}:${liveSongId}`;
    if (loggedSongs.current.has(key)) return;
    loggedSongs.current.add(key);
    outbox(supabaseBrowser()).add("songs_shown", {
      client_id: crypto.randomUUID(),
      service_id: live.serviceId,
      church_id: churchId,
      song_id: liveSongId,
      title: liveSongTitle.slice(0, 200),
      shown_at: new Date().toISOString(),
    });
  }, [liveSongId, liveSongTitle, live.serviceId, churchId]);

  // ---- Keyboard ------------------------------------------------------------
  useEffect(() => {
    // Only the console on screen answers the keyboard (see ../active.ts).
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (arrangingRef.current || t.closest("input, textarea, [role=listbox], [contenteditable=true]")) return;
      // Alt + 1 to 3 puts up a suggested song.
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-3]$/.test(e.key)) {
        const x = picksRef.current[Number(e.key) - 1];
        if (x) {
          e.preventDefault();
          putUp(x.id, x.slide, "suggestion");
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "l" || e.key === "L") toggleLive();
      else if (e.key === "Escape") clear();
      else if (e.key === "Enter" && clearedRef.current && currentRef.current) {
        e.preventDefault();
        putUp(currentRef.current.id, currentRef.current.slide);
      }
      else if (e.key === "a" || e.key === "A") setAuto((v) => !v);
      else if (e.key === "k" || e.key === "K") toggleLock();
      else if ((e.key === "w" || e.key === "W") && currentRef.current) rejectSong();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, step, goLive, clear, putUp, toggleLive, toggleLock, rejectSong]);

  // ---- Library and editing --------------------------------------------------
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<FullSong | "new" | null>(null);
  // The song list: the church's own, or the ReedArk library to add from.
  const [browse, setBrowse] = useState<"mine" | "public">("mine");
  // Library songs already in this church's library.
  const copied = useMemo(() => new Set([...library.map((x) => x.id), ...(songs ?? []).filter((x) => x.inLibrary).map((x) => x.id)]), [library, songs]);
  // A word after saving (a version kept for this church, sent for review).
  const [saved, setSaved] = useState("");
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(""), 8000);
    return () => clearTimeout(t);
  }, [saved]);
  /** Songs added while another was being presented, waiting their turn. */
  const [queue, setQueue] = useState<string[]>([]);
  const folded = useMemo(() => {
    const words = new Map((songs ?? []).map((s) => [s.id, fold(songBody(s.slides))]));
    return library.map((s) => ({ s, key: fold(`${s.title} ${s.author} ${s.firstLine}`), words: words.get(s.id) ?? "" }));
  }, [library, songs]);
  const matches = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return library;
    return folded.filter(({ key, words }) => key.includes(q) || (q.length >= 3 && words.includes(q))).map(({ s }) => s);
  }, [folded, library, query]);

  /** Opens a song at the start of its order. */
  function open(id: string) {
    const c = startOf(id);
    currentRef.current = c;
    setCurrent(c);
  }

  /** Puts a saved song into the console's songs straight away, not after a reload of them all. */
  function keep(saved: FullSong) {
    setSongs((list) => (list ? [...list.filter((x) => x.id !== saved.id), saved].sort((a, b) => a.title.localeCompare(b.title)) : list));
    router.refresh(); // the library list beside it
  }

  /** A new song opens at once, unless one is being presented: then it waits in Up next. */
  function arrive(id: string) {
    if (liveRef.current && currentRef.current !== null) setQueue((q) => (q.includes(id) ? q : [...q, id]));
    else open(id);
  }

  /**
   * Saves a song (migration 0037). New: it joins the ReedArk library, or
   * the church is tagged on the same words if they're there. An edit: the
   * library song itself when only this church has it, else this church's
   * own version, also sent to ReedArk as a suggested correction.
   */
  async function save(fields: SongFields, existing: FullSong | null): Promise<string | void> {
    const args = {
      p_title: fields.title,
      p_author: fields.author,
      p_copyright: fields.copyright,
      p_ccli: fields.ccli_number,
      p_slides: fields.slides,
      p_body: songBody(fields.slides),
      p_first_line: firstLine(fields.slides),
    };
    const supabase = supabaseBrowser();
    if (existing) {
      const { data, error } = await supabase.rpc("save_song", { p_song: existing.id, ...args });
      if (error) return error.message;
      setEditing(null);
      keep({ id: existing.id, ...fields, edited: data === "version" });
      if (data === "version") setSaved("Saved for your church. The change is also sent to ReedArk to consider for everyone.");
      return;
    }
    const { data, error } = await supabase.rpc("add_song", args);
    if (error || !data) return error?.message ?? "Could not save the song.";
    setEditing(null);
    const id = data as string;
    // The same words were in the library already: it's that song, as the library has it.
    const known = await supabase.from("songs").select("title, author, copyright, ccli_number, slides").eq("id", id).maybeSingle();
    keep(known.data ? { id, ...(known.data as Omit<FullSong, "id">) } : { id, ...fields });
    arrive(id);
  }

  /** Add to my library: a tag on the library song, no copy of its words. */
  const copyFromPublic = useCallback(
    async (songId: string): Promise<string | void> => {
      const supabase = supabaseBrowser();
      const { data: src } = await supabase.from("songs").select("title, author, copyright, ccli_number, slides").eq("id", songId).maybeSingle();
      if (!src) return "This song is no longer in the library.";
      const { error } = await supabase.from("church_songs").insert({ church_id: churchId, song_id: songId, added_by: userId });
      if (error && error.code !== "23505") return error.message;
      keep({ id: songId, ...(src as Omit<FullSong, "id">) });
      arrive(songId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keep/arrive read refs and setters only
    [churchId, userId],
  );

  /** Back to the library's version of a song this church has edited. */
  async function resetSong(song: FullSong) {
    const ok = await confirmDialog({
      title: `Use the library's "${song.title}"?`,
      body: "Your church's changes to it are removed, and so is the suggestion sent with them.",
      confirmLabel: "Use the library's",
    });
    if (!ok) return;
    const supabase = supabaseBrowser();
    const { error } = await supabase.rpc("reset_song", { p_song: song.id });
    if (error) return;
    const { data } = await supabase.from("songs").select("title, author, copyright, ccli_number, slides").eq("id", song.id).maybeSingle();
    if (data) keep({ id: song.id, ...(data as Omit<FullSong, "id">) });
  }

  // For the rows of the song list: kept stable, reading the latest state.
  const rowActions = useRef<{ edit: (id: string) => void; remove: (id: string) => void; reset: (id: string) => void }>({ edit: () => {}, remove: () => {}, reset: () => {} });
  useEffect(() => {
    rowActions.current = {
      edit: (id) => {
        const song = songs?.[byId.get(id) ?? -1];
        if (song) setEditing(song);
      },
      remove: (id) => {
        const song = songs?.[byId.get(id) ?? -1];
        if (song) void remove(song);
      },
      reset: (id) => {
        const song = songs?.[byId.get(id) ?? -1];
        if (song) void resetSong(song);
      },
    };
  });
  const editRow = useCallback((id: string) => rowActions.current.edit(id), []);
  const removeRow = useCallback((id: string) => rowActions.current.remove(id), []);
  const resetRow = useCallback((id: string) => rowActions.current.reset(id), []);

  /** Opens a song from Up next. */
  function openQueued(id: string) {
    setQueue((q) => q.filter((x) => x !== id));
    setEditing(null);
    open(id);
  }

  async function remove(song: FullSong) {
    const ok = await confirmDialog({
      title: `Take "${song.title}" out of your library?`,
      body: song.edited
        ? "Your church's changes to it go too. The song stays in the ReedArk library, and you can add it again."
        : "It stays in the ReedArk library, and you can add it again.",
      confirmLabel: "Take it out",
      danger: true,
    });
    if (!ok) return;
    if (song.edited) await supabaseBrowser().rpc("reset_song", { p_song: song.id });
    await supabaseBrowser().from("church_songs").delete().eq("church_id", churchId).eq("song_id", song.id);
    if (currentRef.current?.id === song.id) {
      currentRef.current = null;
      setCurrent(null);
    }
    setSongs((list) => list?.filter((x) => x.id !== song.id) ?? list);
    setQueue((q) => q.filter((x) => x !== song.id));
    router.refresh();
  }

  const onAir = isLive && !cleared ? selectedSlide : null;
  // Suggestions that aren't what's already up, with their titles.
  const picks = suggestions
    .filter((x) => current?.id !== x.id || current.slide !== x.slide)
    .map((x) => ({ ...x, title: songs?.[byId.get(x.id) ?? -1]?.title }))
    .filter((x): x is Suggested & { title: string } => !!x.title);
  // For Alt+1, 2, 3.
  useEffect(() => {
    picksRef.current = picks;
  });

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 lg:grid lg:h-[calc(100dvh-4rem)] lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      <div className="flex min-h-0 flex-col gap-4">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 card px-4 py-3">
          <label className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
              <Mic size={17} />
            </span>
            <span className="sr-only">Audio input</span>
            <Dropdown
              ariaLabel="Audio input"
              value={live.deviceId}
              onChange={live.setDeviceId}
              disabled={live.phase !== "idle"}
              placeholder="No inputs found"
              options={live.inputs.map((d) => ({ value: d.deviceId, label: d.label }))}
              className="h-9 w-64 max-w-full text-sm font-semibold"
            />
          </label>
          <LevelMeter levelRef={live.levelRef} active={live.phase === "live" || live.testing} />
          {live.phase === "idle" && (
            <Button variant={live.testing ? "secondary" : "outline"} size="sm" onClick={() => void live.toggleTest()}>
              {live.testing ? <Square size={11} className="fill-current" /> : <Mic size={13} />}
              {live.testing ? "Stop test" : "Test mic"}
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={auto}
              onClick={() => setAuto((v) => !v)}
              title={auto ? "Follow on: the screen follows the singing (A)" : "Follow off: the singing only suggests slides (A)"}
              className={`inline-flex h-9 items-center gap-2 rounded-full pr-2 pl-3.5 text-sm font-bold transition ${auto ? "bg-accent-fill/15 text-accent" : "bg-surface-2 text-muted hover:text-ink"}`}
            >
              <Zap size={15} className={auto ? "fill-current" : ""} />
              Follow
              <SwitchTrack on={auto} tone="accent" />
            </button>
            {live.phase === "live" &&
              (live.status === "live" ? (
                <Chip tone="live">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-negative" /> Listening
                </Chip>
              ) : (
                <Chip tone="warn">
                  <WifiOff size={13} /> Reconnecting
                </Chip>
              ))}
            {(live.phase === "idle" || live.phase === "starting") && (
              <Button
                // The same height as the Follow switch beside it.
                className="h-9! px-5!"
                onClick={live.start}
                loading={live.phase === "starting"}
                disabled={!songs}
                title="Listen to the singing and follow it on screen. Songs can be shown by hand without this."
              >
                {live.phase !== "starting" && <AudioLines size={15} />}
                {live.phase === "starting" ? "Connecting" : songs ? "Start worship" : "Loading songs"}
              </Button>
            )}
          </div>
        </div>

        {(live.error || loadError) && <div className="rounded-lg bg-warning/12 px-4 py-2.5 text-sm font-semibold text-warning">{live.error || loadError}</div>}

        <EndServiceButton live={live} label="End worship" confirmTitle="End worship?" confirmBody="Listening stops. What's on the screen stays until you change it." />
        {/* Always usable by hand: listening only adds following the singing. */}
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* The song */}
          <section className="flex min-h-[320px] flex-col overflow-hidden card lg:min-h-0">
            <>
                <div className="flex h-14 shrink-0 items-center gap-2 px-4">
                  <h2 className="min-w-0 flex-1 truncate font-bold">{currentSong?.title ?? "Song"}</h2>
                  {currentSong &&
                    (() => {
                      // Locked by the operator, followed (locked on its own
                      // until the singing moves on), or neither.
                      const state = lock?.id !== currentSong.id ? "off" : lock.manual ? "locked" : "following";
                      return (
                        <button
                          type="button"
                          aria-pressed={state === "locked"}
                          onClick={toggleLock}
                          title={
                            state === "locked"
                              ? "Locked: following stays on this song until you unlock it (K)"
                              : state === "following"
                                ? "Following this song until the singing moves on. Lock it to stay on it whatever else it sounds like (K)"
                                : "Lock: follow only this song, whatever else it sounds like (K)"
                          }
                          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition active:scale-[0.97] ${
                            state === "locked"
                              ? "bg-ink text-bg"
                              : state === "following"
                                ? "bg-accent-fill/15 text-accent hover:bg-accent-fill/25"
                                : "bg-surface-2 text-muted hover:bg-surface-3 hover:text-ink"
                          }`}
                        >
                          {state === "locked" ? <LockIcon size={13} /> : <LockOpen size={13} />}
                          {state === "locked" ? "Locked" : state === "following" ? "Following" : "Lock"}
                        </button>
                      );
                    })()}
                  {/* Only while it's on the screen: that's when a wrong song matters. */}
                  {currentSong && onAir && (
                    <button
                      type="button"
                      onClick={rejectSong}
                      title="Wrong song: take it off the screen and stop following it (W)"
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs font-bold text-muted transition hover:bg-negative/10 hover:text-negative active:scale-[0.97]"
                    >
                      <X size={13} /> Wrong song
                    </button>
                  )}
                  {currentSong && (
                    <IconButton label="Close this song (its words come off the screen if they're up)" onClick={closeSong}>
                      <X size={16} />
                    </IconButton>
                  )}
                </div>

                {/* Up next: songs added while another was on screen. */}
                {queue.length > 0 && (
                  <div className="mx-3 mb-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 py-2">
                    <span className="mr-1 text-[11px] font-bold tracking-wider text-faint uppercase">Up next</span>
                    {queue.map((id) => (
                      <span key={id} className="inline-flex items-center rounded-full bg-surface-3 pl-3 text-sm font-semibold">
                        <button type="button" onClick={() => openQueued(id)} className="max-w-56 truncate py-1 hover:underline" title="Open this song">
                          {titles.get(id) ?? songs?.find((s) => s.id === id)?.title ?? "New song"}
                        </button>
                        <IconButton label="Remove from Up next" onClick={() => setQueue((q) => q.filter((x) => x !== id))} className="h-7 w-7 hover:bg-ink/10!">
                          <X size={13} />
                        </IconButton>
                      </span>
                    ))}
                  </div>
                )}

                {/* Heard, but not sure enough (or Follow is off): the songs it
                    could be, best first. One click (or Alt+1, 2, 3) puts one up. */}
                {picks.length > 0 && (
                  <div className="mx-3 mb-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-accent-fill/10 px-2.5 py-2">
                    <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-bold text-accent">
                      <AudioLines size={15} /> Sounds like
                    </span>
                    {picks.map((x, i) => (
                      <button
                        key={x.id}
                        type="button"
                        onClick={() => putUp(x.id, x.slide, "suggestion")}
                        title={`Show ${x.title}, slide ${x.slide + 1} (Alt+${i + 1})`}
                        className={`inline-flex h-8 max-w-full min-w-0 items-center gap-2 rounded-full pr-1.5 pl-3 text-sm transition active:scale-[0.97] ${
                          i === 0 ? "bg-accent-fill font-bold text-on-accent hover:brightness-105" : "bg-surface font-semibold text-ink hover:bg-surface-3"
                        }`}
                      >
                        <span className="min-w-0 truncate">{x.title}</span>
                        <span className={`shrink-0 text-xs tabular-nums ${i === 0 ? "opacity-70" : "text-muted"}`}>{x.slide + 1}</span>
                        <Kbd>{`⌥${i + 1}`}</Kbd>
                      </button>
                    ))}
                  </div>
                )}

                {currentSong && (
                  <OrderBar
                    source={currentOrder.source}
                    performances={currentOrder.performances}
                    hasOrder={orders.has(currentSong.id) || profiles.has(currentSong.id)}
                    asWritten={asWritten}
                    onWritten={setAsWritten}
                    arranging={arranging}
                    canArrange={/^[0-9a-f-]{36}$/i.test(currentSong.id)}
                    onArrange={() => setArranging(true)}
                  />
                )}
                {currentSong && arranging ? (
                  <ArrangeOrder
                    key={currentSong.id}
                    slides={currentSong.slides}
                    initial={orderOf({ id: currentSong.id, slides: currentSong.slides }).order}
                    canReset={orders.has(currentSong.id)}
                    onSave={(order) => {
                      void saveOrder(currentSong.id, order, "arranged");
                      setAsWritten(false);
                      setArranging(false);
                    }}
                    onReset={() => {
                      void saveOrder(currentSong.id, null, "arranged");
                      setArranging(false);
                    }}
                    onCancel={() => setArranging(false)}
                  />
                ) : currentSong ? (
                  <SlideGrid
                    song={currentSong}
                    order={currentOrder.order}
                    edited={edits[currentSong.id]}
                    active={current ? (current.pos ?? positionOf(currentOrder.order, current.slide)) : -1}
                    onAir={!!onAir}
                    onPick={(i, pos) => putUp(currentSong.id, i, "operator", pos)}
                    onEdit={(i, text) => editSlide(currentSong.id, i, text)}
                  />
                ) : (
                  <div className="grid flex-1 place-items-center px-6 text-center">
                    <div>
                      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-muted">
                        <Music size={24} />
                      </span>
                      <p className="mt-4 font-bold">{live.phase === "live" ? "Listening for a song" : "No song yet"}</p>
                      <p className="mt-0.5 max-w-xs text-sm text-muted">
                        {live.phase === "live" ? "It appears here as soon as a line is recognised." : "Pick one from the library, or start worship and let it follow the singing."}
                      </p>
                    </div>
                  </div>
                )}
                {live.phase === "live" && heard && <p className="shrink-0 truncate border-t border-line px-4 py-2 text-xs text-faint">Hearing: {heard}</p>}
            </>
          </section>

          {/* On screen */}
          <section className="flex min-h-0 flex-col card">
            <div className="flex h-14 shrink-0 items-center gap-3 px-4">
              <h2 className="font-bold">On screen</h2>
              {isLive ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-negative">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-negative" /> Live
                  {cleared && <span className="font-semibold text-faint">· words cleared, Enter to show</span>}
                </span>
              ) : (
                <span className="text-xs font-bold text-faint">{elsewhere ? "Not live · another computer is projecting" : "Not live · screen blank"}</span>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={isLive}
                onClick={toggleLive}
                className="ml-auto inline-flex h-9 items-center gap-2 rounded-full bg-surface-2 pr-2 pl-3 text-sm font-semibold transition hover:bg-surface-3"
              >
                Live
                <Kbd>L</Kbd>
                <SwitchTrack on={isLive} tone="live" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
              <div className="flex h-[60vw] items-center justify-center [container-type:size] lg:h-auto lg:min-h-[150px] lg:flex-1">
                <div className="flex w-[min(100cqw,calc((100cqh-50px)*16/9))] flex-col gap-2.5">
                  <div className={`relative aspect-video w-full overflow-hidden rounded-lg shadow-pop ${onAir ? "ring-2 ring-negative" : "ring-1 ring-line"}`}>
                    <SlideView slide={selectedSlide} theme={display.songs} />
                    {!selectedSlide && <span className="absolute inset-0 grid place-items-center text-xs font-semibold text-white/30">Screen is clear</span>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <div className="inline-flex h-10 items-center rounded-full bg-surface-2 p-0.5">
                      <IconButton label="Previous slide (←)" onClick={() => step(-1)} disabled={!current} className="h-9 w-9 text-ink hover:bg-surface-3">
                        <ChevronLeft size={18} />
                      </IconButton>
                      <span className={`min-w-20 px-2 text-center text-sm font-bold tabular-nums ${current ? "text-ink" : "text-faint"}`}>
                        {currentSong && current ? `${(current.pos ?? positionOf(currentOrder.order, current.slide)) + 1} / ${currentOrder.order.length}` : "No slide"}
                      </span>
                      <IconButton label="Next slide (→ or Space)" onClick={() => step(1)} disabled={!current} className="h-9 w-9 text-ink hover:bg-surface-3">
                        <ChevronRight size={18} />
                      </IconButton>
                    </div>
                    {outputUrl && (
                      <div className="ml-auto flex items-center gap-1">
                        <a
                          href={outputUrl}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="Open the output page in a new tab"
                          className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink"
                        >
                          <ExternalLink size={16} />
                        </a>
                        {/* The projector window isn't filling its screen (the address bar shows): one click here fixes it. */}
                        {projectorOpen && !projectorFull && (
                          <Button size="sm" variant="outline" className="h-10" onClick={fillProjectorScreen} title="The projector window isn't full screen yet. Click to fill it.">
                            <Maximize size={14} /> Fill projector screen
                          </Button>
                        )}
                        {projectorOpen ? (
                          <Button size="sm" variant="secondary" className="h-10" onClick={stopPresenting} title="Close the projector window">
                            <MonitorOff size={14} /> Stop presenting
                          </Button>
                        ) : (
                          <Button size="sm" className="h-10" loading={presenting} onClick={present}>
                            <MonitorUp size={14} /> Present
                          </Button>
                        )}
                        {canEditDisplay && <DisplayQuick churchId={churchId} kind="songs" display={display} onChange={setDisplay} />}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Library, or the song form in its place. Outside the start panel, so
          songs can be added and edited before worship starts. */}
      {editing ? (
        <aside className="flex min-h-[460px] flex-col overflow-hidden card lg:min-h-0">
          <SongEditor
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            heading={editing === "new" ? "Add a song" : "Edit song"}
            onCancel={() => setEditing(null)}
            onSave={(f) => save(f, editing === "new" ? null : editing)}
          />
        </aside>
      ) : (
        <aside className="flex min-h-[460px] flex-col gap-3 card p-3 lg:min-h-0">
          <div className="flex items-center gap-2 px-1 pt-1">
            <h2 className="sr-only">Songs</h2>
            {/* The church's own songs, or the public library to copy from. */}
            <div className="inline-flex min-w-0 rounded-full bg-surface-2 p-0.5" role="group" aria-label="Which songs">
              {(
                [
                  ["mine", "My library"],
                  ["public", "All songs"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={browse === v}
                  onClick={() => setBrowse(v)}
                  className={`h-8 rounded-full px-3 text-xs font-bold whitespace-nowrap transition ${browse === v ? "bg-bg text-ink shadow-card" : "text-muted hover:text-ink"}`}
                >
                  {label}
                  {v === "mine" && <span className="ml-1.5 font-semibold text-faint tabular-nums">{library.length.toLocaleString()}</span>}
                </button>
              ))}
            </div>
            {!songs && !loadError && <LoaderCircle size={14} className="animate-spin text-faint" />}
            <Button size="sm" variant="secondary" className="ml-auto shrink-0" onClick={() => setEditing("new")}>
              <Plus size={13} /> Add song
            </Button>
          </div>
          {saved && <Notice tone="ok">{saved}</Notice>}
          {browse === "public" ? (
            <PublicLibrary copied={copied} onCopy={copyFromPublic} />
          ) : (
          <>
          <SetlistPanel
            setlists={setlists}
            activeId={setlistId}
            titles={titles}
            currentSongId={current?.id ?? null}
            onSelect={chooseSetlist}
            onCreate={createSetlist}
            onRename={(id, name) => void saveSetlist(id, { name })}
            onDelete={deleteSetlist}
            onChange={(id, song_ids) => void saveSetlist(id, { song_ids })}
            onOpen={(id) => {
              setEditing(null);
              open(id);
            }}
          />
          <label className="relative block">
            <span className="sr-only">Search songs</span>
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles and lyrics"
              className="inset-field h-10 w-full rounded-full bg-surface-2 pr-4 pl-10 text-sm placeholder:text-faint"
            />
          </label>
          <ol className="min-h-0 flex-1 overflow-y-auto">
            {matches.slice(0, SHOWN).map((s) => (
              <LibraryRow
                key={s.id}
                song={s}
                active={s.id === current?.id}
                inSetlist={!!activeSetlist?.song_ids.includes(s.id)}
                onAdd={activeSetlist ? addToSetlist : undefined}
                onEdit={songs ? editRow : undefined}
                onRemove={songs ? removeRow : undefined}
                onReset={songs ? resetRow : undefined}
                onOpen={() => {
                  setEditing(null);
                  open(s.id);
                }}
              />
            ))}
            {matches.length > SHOWN && <li className="px-3 py-3 text-center text-xs text-muted">{(matches.length - SHOWN).toLocaleString()} more. Search to narrow the list.</li>}
            {library.length > 0 && matches.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">No songs match.</li>}
            {library.length === 0 && (
              <li className="px-4 py-10 text-center">
                <p className="text-sm text-muted">No songs yet. Paste the lyrics from anywhere, or add songs from All songs.</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
                    <Plus size={13} /> Add song
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setBrowse("public")}>
                    Browse all songs
                  </Button>
                </div>
              </li>
            )}
          </ol>
          </>
          )}
        </aside>
      )}
    </div>
  );
}

const LibraryRow = memo(function LibraryRow({
  song,
  active,
  inSetlist,
  onAdd,
  onOpen,
  onEdit,
  onRemove,
  onReset,
}: {
  song: LibrarySong;
  active: boolean;
  inSetlist: boolean;
  /** Present while a setlist is chosen. */
  onAdd?: (id: string) => void;
  onOpen: () => void;
  /** Present once the songs' words have loaded. */
  onEdit?: (id: string) => void;
  onRemove?: (id: string) => void;
  /** Back to the library's version (songs the church has edited). */
  onReset?: (id: string) => void;
}) {
  return (
    <li className={`group flex items-center rounded-md transition ${active ? "bg-surface-3" : "hover:bg-surface-2"}`}>
      <button type="button" onClick={onOpen} className="block min-w-0 flex-1 px-3 py-2 text-left">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{song.title}</span>
          {song.edited && <span className="shrink-0 text-[10px] font-bold tracking-wider text-faint uppercase">Edited</span>}
        </span>
        <span className="block truncate text-xs text-muted">{song.firstLine || song.author || " "}</span>
      </button>
      {/* On hover (or keyboard focus): edit and delete. */}
      {onEdit && (
        <span className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <IconButton label="Edit song" onClick={() => onEdit(song.id)} className="h-8 w-8 hover:bg-ink/10!">
            <Pencil size={14} />
          </IconButton>
          {onReset && song.edited && (
            <IconButton label="Back to the library's version" onClick={() => onReset(song.id)} className="h-8 w-8 hover:bg-ink/10!">
              <Undo2 size={14} />
            </IconButton>
          )}
          {onRemove && (
            <IconButton label="Take out of your library" onClick={() => onRemove(song.id)} className="h-8 w-8 hover:bg-ink/10! hover:text-negative">
              <Trash2 size={14} />
            </IconButton>
          )}
        </span>
      )}
      {onAdd &&
        (inSetlist ? (
          <span className="mr-2 shrink-0 text-[10px] font-bold tracking-wider text-faint uppercase">In playlist</span>
        ) : (
          <IconButton label="Add to playlist" onClick={() => onAdd(song.id)} className="mr-1 h-8 w-8 opacity-60 group-hover:opacity-100">
            <Plus size={16} />
          </IconButton>
        ))}
    </li>
  );
});

/**
 * Above a song's slides: the order they're in (sung, or as written) and
 * Arrange. The switch only shows once there's a sung order to switch from.
 */
function OrderBar({
  source,
  performances,
  hasOrder,
  asWritten,
  onWritten,
  arranging,
  canArrange,
  onArrange,
}: {
  source: OrderSource;
  performances?: number;
  hasOrder: boolean;
  asWritten: boolean;
  onWritten: (on: boolean) => void;
  arranging: boolean;
  canArrange: boolean;
  onArrange: () => void;
}) {
  const note =
    source === "sung"
      ? "As your church sang it last time"
      : source === "arranged"
        ? "As you arranged it"
        : source === "common"
          ? `As it's usually sung${performances ? ` (${performances} service${performances === 1 ? "" : "s"})` : ""}`
          : hasOrder
            ? "As written"
            : "As written. The order you sing it is learned in the service.";
  const pill = (on: boolean) =>
    `h-7 rounded-full px-3 text-xs font-bold transition ${on ? "bg-bg text-ink shadow-card" : "text-muted hover:text-ink"}`;
  if (arranging) return null;
  return (
    <div className="mx-3 mb-2 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1.5">
      {hasOrder && (
        <div className="inline-flex shrink-0 rounded-full bg-surface-2 p-0.5" role="group" aria-label="Slide order">
          <button type="button" aria-pressed={!asWritten} onClick={() => onWritten(false)} className={pill(!asWritten)}>
            Sung
          </button>
          <button type="button" aria-pressed={asWritten} onClick={() => onWritten(true)} className={pill(asWritten)}>
            As written
          </button>
        </div>
      )}
      <span className="min-w-0 flex-1 truncate text-xs text-muted">{note}</span>
      {canArrange && (
        <button
          type="button"
          onClick={onArrange}
          title="Put the parts in the order your church sings them"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-xs font-bold text-muted transition hover:bg-surface-3 hover:text-ink active:scale-[0.97]"
        >
          <ListOrdered size={13} /> Arrange
        </button>
      )}
    </div>
  );
}

const SlideGrid = memo(function SlideGrid({
  song,
  order,
  edited,
  active,
  onAir,
  onPick,
  onEdit,
}: {
  song: FullSong;
  /** The slides in the order they're sung (repeats included). */
  order: Order;
  /** Slides changed for this service: index → words. */
  edited?: Record<number, string>;
  /** The position in `order` that's selected. */
  active: number;
  onAir: boolean;
  onPick: (slide: number, pos: number) => void;
  /** New words for a slide, or null to put the original back. */
  onEdit: (i: number, text: string | null) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const [editing, setEditing] = useState<{ i: number; pos: number; text: string } | null>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-slide="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, song.id]);
  useEffect(() => setEditing(null), [song.id]);

  const finish = () => {
    if (!editing) return;
    const text = editing.text.replace(/\n{3,}/g, "\n\n").trim();
    if (text) onEdit(editing.i, text);
    setEditing(null);
  };

  return (
    <ol ref={list} className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 overflow-y-auto px-3 pb-3">
      {order.map((i, pos) => {
        const s = song.slides[i];
        if (!s) return null;
        const changed = edited?.[i] !== undefined;
        // A part sung again (a chorus coming back).
        const again = order.indexOf(i) < pos;
        const tone =
          pos === active
            ? onAir
              ? "bg-negative/10 shadow-[inset_0_0_0_2px_var(--color-negative)]"
              : "bg-accent-fill/15 shadow-[inset_0_0_0_1px_var(--accent-fill)]"
            : "bg-surface-2 hover:bg-surface-3";
        if (editing?.i === i && editing.pos === pos) {
          return (
            <li key={pos} className="flex flex-col gap-2 rounded-lg bg-surface-2 p-2 shadow-[inset_0_0_0_1px_var(--accent-fill)]">
              <span className="px-1 text-[11px] font-bold text-faint">{i + 1} · editing for today</span>
              <textarea
                autoFocus
                value={editing.text}
                onChange={(e) => setEditing({ i, pos, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditing(null);
                  } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    finish();
                  }
                }}
                rows={Math.max(2, editing.text.split("\n").length)}
                className="inset-field w-full resize-y rounded-md bg-bg px-2.5 py-2 text-sm leading-snug"
              />
              <span className="flex gap-1.5">
                <Button size="sm" onClick={finish}>
                  Done
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </span>
            </li>
          );
        }
        return (
          <li key={pos} className="group relative">
            <button type="button" data-slide={pos} onClick={() => onPick(i, pos)} className={`flex h-full w-full flex-col rounded-lg p-3 text-left transition ${tone}`}>
              <span className="mb-1 flex items-center gap-2 pr-14 text-[11px] font-bold text-faint">
                {pos + 1}
                {s.label && <span className={s.label === "Chorus" ? "text-accent" : ""}>{s.label}</span>}
                {again && <span>again</span>}
                {changed && <span className="text-warning">Edited</span>}
              </span>
              <span className="text-sm leading-snug whitespace-pre-line">{s.text}</span>
            </button>
            {/* For today only: the library keeps its words. */}
            <span className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
              {changed && (
                <IconButton label="Put the original words back" onClick={() => onEdit(i, null)} className="h-7 w-7 hover:bg-ink/10!">
                  <Undo2 size={14} />
                </IconButton>
              )}
              <IconButton label="Change the words for today" onClick={() => setEditing({ i, pos, text: s.text })} className="h-7 w-7 hover:bg-ink/10!">
                <Pencil size={13} />
              </IconButton>
            </span>
          </li>
        );
      })}
    </ol>
  );
});
