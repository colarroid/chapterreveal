"use client";

import { ChevronLeft, Maximize, MonitorOff, MonitorUp, Pencil, Plus, StretchHorizontal, StretchVertical, Trash2, Type, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmDialog } from "@/components/confirm";
import { SlideView } from "@/components/slide-view";
import { Button, Chip, IconButton, Kbd, Notice } from "@/components/ui";
import { cleanDisplay, type DisplaySettings } from "@/lib/display/theme";
import { askToGoLive, mayProjectHere } from "@/lib/live/present-check";
import { closeProjector, fillProjectorScreen, presentOnProjector, useProjectorOpen } from "@/lib/live/present";
import { CONSOLE_CHANNEL, SCREEN_TAKEN, ScreenSender, TAKEN_ELSEWHERE, type ConsoleMessage } from "@/lib/live/screen";
import { PLAN_LIMITS, planName, type Plan } from "@/lib/plans";
import type { Slide } from "@/lib/scripture/bible";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AddSlideChoice } from "./add-slide";
import { useLeaveWarning } from "@/lib/use-leave-warning";
import { useConsoleActive } from "../active";
import { SwitchTrack } from "@/components/motion";

/** A named set of slides ("Sunday announcements"), migration 0033. */
export interface SlideDeck {
  id: string;
  name: string;
  position: number;
}

const DECK_KEY = "reedark.slideDeck";

export interface SavedSlide {
  /** The presentation it's in. */
  deck_id: string | null;
  id: string;
  kind: "text" | "image" | "video";
  title: string;
  body: string;
  image_url: string | null;
  /** Picture slides: their pictures, side by side on screen. */
  images?: { url: string; public_id: string }[];
  position: number;
  /** Free plan: when a picture or video slide is removed. */
  expires_at?: string | null;
  /** Picture slides: full height (the default) or full width on screen. */
  fit?: "height" | "width";
}

const IMAGE_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 80 * 1024 * 1024;
const DAY = 86_400_000;

/** "Deletes in 3 days", for Free plan pictures and videos. */
function expiresIn(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
  return days <= 1 ? "Deletes within a day" : `Deletes in ${days} days`;
}

/** What goes to the screen for a saved slide. */
function toSlide(s: SavedSlide): Slide {
  return s.kind !== "text"
    ? { kind: s.kind, image: s.image_url ?? "", images: s.images?.map((i) => i.url), fit: s.fit === "width" ? "width" : "height", label: s.title, translation: "", lines: [] }
    : { kind: "text", label: s.title, translation: "", lines: s.body.split("\n").filter((l) => l.trim()).map((text) => ({ verse: 0, text })) };
}

const nameOf = (s: SavedSlide) =>
  s.title || (s.kind === "image" ? "Picture" : s.kind === "video" ? "Video" : s.body.split("\n").find((l) => l.trim()) || "Text slide");

export function Slides({
  churchId,
  userId,
  screenToken,
  display: initialDisplay,
  plan,
  initial,
  decks: initialDecks,
}: {
  churchId: string;
  userId: string;
  screenToken: string;
  display: DisplaySettings;
  plan: Plan;
  initial: SavedSlide[];
  decks: SlideDeck[];
}) {
  const active = useConsoleActive();
  const [all, setSlides] = useState(initial);

  // ---- Presentations ------------------------------------------------------------
  // The open one's slides are the ones listed, stepped through and shown; the
  // last one opened is opened again next time.
  const [decks, setDecks] = useState(initialDecks);
  const [deckId, setDeckId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DECK_KEY);
      if (saved && initialDecks.some((d) => d.id === saved)) setDeckId(saved);
    } catch {}
  }, [initialDecks]);
  const openDeck = useCallback((id: string | null) => {
    setDeckId(id);
    try {
      if (id) localStorage.setItem(DECK_KEY, id);
      else localStorage.removeItem(DECK_KEY);
    } catch {}
  }, []);
  const deck = decks.find((d) => d.id === deckId) ?? null;
  const slides = useMemo(() => (deck ? all.filter((x) => x.deck_id === deck.id) : []), [all, deck]);
  /** A new slide being made: choosing what it is, or writing its words. */
  const [adding, setAdding] = useState<null | "choose" | "text">(null);
  useEffect(() => setAdding(null), [deckId]);
  // Free plan pictures and videos leave the list the moment they expire
  // (the files go when the page is next opened).
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setSlides((all) => (all.some((s) => s.expires_at && new Date(s.expires_at).getTime() <= now) ? all.filter((s) => !s.expires_at || new Date(s.expires_at).getTime() > now) : all));
    }, 60_000);
    return () => clearInterval(t);
  }, []);
  // The Free plan's allowance: picture and video slides kept at a time.
  const limits = PLAN_LIMITS[plan];
  const limit = limits.slide;
  const mediaCount = all.filter((s) => s.kind !== "text").length;
  const full = mediaCount >= limit;
  const [selected, setSelected] = useState<string | null>(null);
  // Live, as in the other consoles: while on, the selected slide is on
  // screen; off, slides only preview here and the screen is blank. Starts
  // off; L toggles it, Esc turns it off.
  const [isLive, setIsLive] = useState(false);
  // Live went off because another computer took the screen.
  const [elsewhere, setElsewhere] = useState(false);
  const liveRef = useRef(false);
  const onAir = isLive ? selected : null;
  const [editing, setEditing] = useState<SavedSlide | null>(null);
  const [error, setError] = useState("");
  /** "Video slides are Pro": shown when a Free church presses Video. */
  const [upsell, setUpsell] = useState(false);
  const [uploading, setUploading] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const addInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  useLeaveWarning(uploading !== null);

  // ---- The screen ------------------------------------------------------------
  const [token, setToken] = useState(screenToken);
  const [display, setDisplay] = useState(initialDisplay);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(CONSOLE_CHANNEL);
    bc.onmessage = (e: MessageEvent<ConsoleMessage>) => {
      if (e.data?.type === "screen-token" && e.data.token) setToken(e.data.token);
      else if (e.data?.type === "display") setDisplay(cleanDisplay(e.data.display));
    };
    return () => bc.close();
  }, []);
  const screen = useRef<ScreenSender | null>(null);
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
  // Text slides wear the scripture look from Design.
  useEffect(() => {
    if (screen.current) screen.current.theme = display.scripture;
  }, [display, token]);

  /** Selects a slide; while live, it goes on screen too. */
  const select = useCallback((s: SavedSlide) => {
    currentRef.current = s; // at once, so Live switched on right after uses it
    setSelected(s.id);
    if (liveRef.current) void screen.current?.show(toSlide(s));
  }, []);
  // The selected slide, read when Live is switched on.
  const currentRef = useRef<SavedSlide | null>(null);
  const goLive = useCallback((on: boolean) => {
    liveRef.current = on;
    setIsLive(on);
    const cur = currentRef.current;
    void screen.current?.show(on && cur ? toSlide(cur) : null);
  }, []);
  // Going live asks first when another computer (or tab) has something on
  // the screen (lib/live/present-check.ts); going off never asks.
  const liveOn = useCallback(async () => {
    if (!(await mayProjectHere(screen.current))) return;
    setElsewhere(false);
    goLive(true);
  }, [goLive]);
  const toggleLive = useCallback(() => {
    if (liveRef.current) goLive(false);
    else void liveOn();
  }, [goLive, liveOn]);

  const [outputUrl, setOutputUrl] = useState("");
  useEffect(() => setOutputUrl(token ? `${location.origin}/screen/${token}` : ""), [token]);
  const [presenting, setPresenting] = useState(false);
  const [projectorOpen, syncProjector, projectorFull] = useProjectorOpen();
  async function present() {
    if (!outputUrl) return;
    if (!liveRef.current) {
      if (screen.current?.otherOnScreen()) await liveOn();
      else if (await askToGoLive("slides")) goLive(true);
    }
    setPresenting(true);
    await presentOnProjector(outputUrl);
    setPresenting(false);
    syncProjector();
  }

  // Arrow keys step through the list (on screen too while live); L toggles
  // Live; Esc turns it off.
  useEffect(() => {
    // Only the console on screen answers the keyboard (see ../active.ts).
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (editing || e.ctrlKey || e.metaKey || e.altKey || t.closest("input, textarea, [contenteditable], [role=dialog], dialog")) return;
      const i = slides.findIndex((s) => s.id === selected);
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        const next = slides[Math.min(slides.length - 1, i + 1)];
        if (next) select(next);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = slides[Math.max(0, i - 1)];
        if (prev) select(prev);
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        toggleLive();
      } else if (e.key === "Escape") {
        goLive(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, slides, selected, editing, select, goLive, toggleLive]);

  // ---- Saving -----------------------------------------------------------------
  const nextPosition = () => (slides.length ? Math.max(...slides.map((s) => s.position)) + 1 : 0);
  // The plan's limits on presentations and their slides (Free: 2, of 10 each).
  const deckFull = slides.length >= limits.deckSlides;
  const decksFull = decks.length >= limits.decks;

  async function saveText(title: string, body: string, existing: SavedSlide | null): Promise<string | void> {
    const supabase = supabaseBrowser();
    const row = { title: title.trim().slice(0, 120), body: body.trim().slice(0, 2000), updated_at: new Date().toISOString() };
    const { data, error } = existing
      ? await supabase.from("slides").update(row).eq("id", existing.id).select("id, kind, title, body, image_url, position, deck_id, fit").single()
      : await supabase
          .from("slides")
          .insert({ ...row, church_id: churchId, kind: "text", position: nextPosition(), deck_id: deckId, created_by: userId })
          .select("id, kind, title, body, image_url, position, deck_id, fit")
          .single();
    if (error || !data) return error?.message ?? "Couldn't save the slide.";
    const saved = data as SavedSlide;
    setSlides((all) => (existing ? all.map((s) => (s.id === saved.id ? saved : s)) : [...all, saved]));
    setSelected(saved.id);
    setEditing(null);
    setAdding(null);
    // Edited while on screen: the screen shows the new words.
    if (liveRef.current && selected === saved.id) void screen.current?.show(toSlide(saved));
  }

  /** Uploads one file to Cloudinary; returns its id there. `adding`: to an existing slide. */
  async function uploadFile(file: File, video: boolean, adding: boolean, onProgress: (f: number) => void): Promise<string> {
    const signRes = await fetch("/api/slides/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: video ? "video" : "image", adding }),
    });
    const signed = await signRes.json().catch(() => ({}));
    if (!signRes.ok) throw new Error(signed.error ?? "Couldn't start the upload.");
    const form = new FormData();
    for (const [k, v] of Object.entries(signed.fields as Record<string, string>)) form.append(k, v);
    form.append("file", file, file.name);
    const uploaded = await new Promise<{ public_id: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", signed.url);
      xhr.upload.onprogress = (e) => e.total && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        const d = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) resolve(d);
        else reject(new Error(d.error?.message ? `Upload failed: ${d.error.message}` : "Upload failed."));
      };
      xhr.onerror = () => reject(new Error("Upload failed. Check the connection and try again."));
      xhr.send(form);
    });
    return uploaded.public_id;
  }

  /** Checks picked files: pictures (up to the plan's per-slide number) or one video. */
  function checkFiles(files: File[], room: number): string | null {
    const videos = files.filter((f) => f.type.startsWith("video/"));
    if (files.some((f) => !/^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime))$/.test(f.type))) return "Use JPG, PNG or WebP pictures, or an MP4, MOV or WebM video.";
    if (videos.length && !limits.videoSlides) return "Video slides are on the Paid plan. Upload pictures instead, or upgrade.";
    if (videos.length && files.length > 1) return "A video slide is one video on its own. Pick just the video.";
    if (files.some((f) => !f.type.startsWith("video/") && f.size > IMAGE_MAX)) return "A picture is over 8 MB. Save a smaller copy (1920 pixels wide is plenty).";
    if (videos.some((f) => f.size > VIDEO_MAX)) return "That video is over 80 MB. Export it at 1080p, or at a lower bitrate.";
    if (!videos.length && files.length > room)
      return room <= 0 ? `This slide already has ${limits.slideImages} pictures, the most on the ${planName(plan)} plan.` : `Pick up to ${room} picture${room === 1 ? "" : "s"}: the ${planName(plan)} plan shows ${limits.slideImages} on one slide.`;
    return null;
  }

  /** Uploads several files one after another, with one progress bar for all. */
  async function uploadAll(files: File[], adding: boolean): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const video = files[i].type.startsWith("video/");
      ids.push(await uploadFile(files[i], video, adding, (f) => setUploading((i + f) / files.length)));
    }
    return ids;
  }

  /** A new slide from the picked pictures (side by side) or video. */
  async function upload(files: File[]) {
    setError("");
    const problem = checkFiles(files, limits.slideImages);
    if (problem) return setError(problem);
    const video = files[0].type.startsWith("video/");
    setUploading(0);
    try {
      const ids = await uploadAll(files, false);
      const res = await fetch("/api/slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: video ? "video" : "image", public_ids: ids, title: files[0].name.replace(/\.[^.]+$/, "").slice(0, 120), position: nextPosition(), deck_id: deckId }),
      });
      const saved = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(saved.error ?? "Couldn't save the upload.");
      setSlides((all) => [...all, saved as SavedSlide]);
      select(saved as SavedSlide);
      setAdding(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  }

  /** Saves a picture slide's new list of pictures (adding or taking some off). */
  async function setPictures(s: SavedSlide, publicIds: string[]) {
    const res = await fetch(`/api/slides/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ public_ids: publicIds }) });
    const saved = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(saved.error ?? "Couldn't change the pictures.");
    setSlides((all) => all.map((x) => (x.id === s.id ? (saved as SavedSlide) : x)));
    currentRef.current = saved as SavedSlide;
    if (liveRef.current && selected === s.id) void screen.current?.show(toSlide(saved as SavedSlide));
  }

  /** A picture slide's fit: full height or full width. On screen at once if it's up. */
  async function setFit(s: SavedSlide, fit: "height" | "width") {
    const next = { ...s, fit };
    setSlides((list) => list.map((x) => (x.id === s.id ? next : x)));
    currentRef.current = next;
    if (liveRef.current && selected === s.id) void screen.current?.show(toSlide(next));
    const { error: e } = await supabaseBrowser().from("slides").update({ fit }).eq("id", s.id);
    if (e) {
      setSlides((list) => list.map((x) => (x.id === s.id ? s : x)));
      setError(/fit/.test(e.message) ? "Saving the fit needs migration 0034. Ask your admin to run it." : e.message);
    }
  }

  async function addPictures(s: SavedSlide, files: File[]) {
    setError("");
    const have = s.images?.length ?? 1;
    const problem = checkFiles(files, limits.slideImages - have);
    if (problem) return setError(problem);
    setUploading(0);
    try {
      const ids = await uploadAll(files, true);
      await setPictures(s, [...(s.images ?? []).map((i) => i.public_id), ...ids]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  }

  async function removePicture(s: SavedSlide, publicId: string) {
    setError("");
    try {
      await setPictures(s, (s.images ?? []).map((i) => i.public_id).filter((p) => p !== publicId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the picture.");
    }
  }

  async function remove(s: SavedSlide) {
    const ok = await confirmDialog({ title: `Delete "${nameOf(s)}"?`, body: "It's removed from your church's slides.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/slides/${s.id}`, { method: "DELETE" });
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't delete it.");
    if (liveRef.current && selected === s.id) void screen.current?.show(null);
    setSlides((all) => all.filter((x) => x.id !== s.id));
    setSelected((cur) => (cur === s.id ? null : cur));
  }

  // ---- Making, renaming and deleting presentations -----------------------------
  const [naming, setNaming] = useState<null | "new" | "rename">(null);
  async function saveDeck(name: string): Promise<string | void> {
    const clean = name.trim().slice(0, 80);
    if (!clean) return "Give the presentation a name.";
    const supabase = supabaseBrowser();
    if (naming === "rename" && deck) {
      const { error: e } = await supabase.from("slide_decks").update({ name: clean, updated_at: new Date().toISOString() }).eq("id", deck.id);
      if (e) return e.message;
      setDecks((list) => list.map((d) => (d.id === deck.id ? { ...d, name: clean } : d)));
    } else {
      const position = decks.length ? Math.max(...decks.map((d) => d.position)) + 1 : 0;
      const { data, error: e } = await supabase.from("slide_decks").insert({ church_id: churchId, name: clean, position, created_by: userId }).select("id, name, position").single();
      if (e || !data) return e?.message ?? "Couldn't make the presentation.";
      setDecks((list) => [...list, data as SlideDeck]);
      openDeck((data as SlideDeck).id);
      // Straight on to its first slide.
      setAdding("choose");
    }
    setNaming(null);
  }

  async function removeDeck(d: SlideDeck) {
    const inIt = all.filter((x) => x.deck_id === d.id);
    const ok = await confirmDialog({
      title: `Delete "${d.name}"?`,
      body: inIt.length ? `Its ${inIt.length} slide${inIt.length === 1 ? "" : "s"} go too. This can't be undone.` : "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    // Pictures and videos through the server, so their files are deleted too.
    // If one can't be deleted, stop: the presentation stays, so nothing is left behind in storage.
    for (const x of inIt.filter((x) => x.kind !== "text")) {
      const res = await fetch(`/api/slides/${x.id}`, { method: "DELETE" });
      if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Couldn't delete "${nameOf(x)}". Try again.`);
      setSlides((list) => list.filter((y) => y.id !== x.id));
    }
    const { error: e } = await supabaseBrowser().from("slide_decks").delete().eq("id", d.id);
    if (e) return setError(e.message);
    if (liveRef.current && inIt.some((x) => x.id === selected)) void screen.current?.show(null);
    setSlides((list) => list.filter((x) => x.deck_id !== d.id));
    setDecks((list) => list.filter((x) => x.id !== d.id));
    if (deckId === d.id) openDeck(null);
  }

  // Choosing what a new slide is.
  const pickText = () => setAdding("text");
  const pickPicture = () => fileInput.current?.click();
  const pickVideo = () => (limits.videoSlides ? videoInput.current?.click() : setUpsell(true));

  // ---- Reordering: drag a slide onto another to put it there -----------------
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  async function move(id: string, before: string) {
    if (id === before) return;
    const order = slides.filter((s) => s.id !== id);
    const others = all.filter((x) => x.deck_id !== deckId);
    const at = order.findIndex((s) => s.id === before);
    const moved = slides.find((s) => s.id === id);
    if (!moved || at < 0) return;
    order.splice(at, 0, moved);
    const next = order.map((s, position) => ({ ...s, position }));
    const previous = slides;
    setSlides([...others, ...next]);
    // Only rows whose place changed are saved.
    const changed = next.filter((s) => previous.find((o) => o.id === s.id)?.position !== s.position);
    const supabase = supabaseBrowser();
    const results = await Promise.all(changed.map((s) => supabase.from("slides").update({ position: s.position }).eq("id", s.id)));
    const failed = results.find((r) => r.error);
    if (failed) {
      setSlides([...others, ...previous]);
      setError(failed.error!.message);
    }
  }

  const current = slides.find((s) => s.id === selected) ?? null;
  // Opening a presentation selects its first slide.
  useEffect(() => {
    setSelected((cur) => (cur && slides.some((x) => x.id === cur) ? cur : (slides[0]?.id ?? null)));
  }, [slides]);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  return (
    <div className="flex flex-col gap-4 px-4 pb-4 lg:grid lg:h-[calc(100dvh-4rem)] lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      {/* Preview and screen controls */}
      <div className="flex min-h-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 card px-4 py-3">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-negative">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-negative" /> Live
            </span>
          ) : (
            <span className="text-xs font-bold text-faint">{elsewhere ? "Not live · another computer is projecting" : "Not live · screen blank"}</span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={isLive}
            onClick={toggleLive}
            title={isLive ? "Live: the selected slide is on screen. Press L or Esc to blank it." : "Not live: slides only preview here. Press L to go live."}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-surface-2 pr-2 pl-3 text-sm font-semibold transition hover:bg-surface-3"
          >
            Live
            <Kbd>L</Kbd>
            <SwitchTrack on={isLive} tone="live" />
          </button>
          {/* The same height as the Live switch beside them. */}
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {projectorOpen && !projectorFull && (
              <Button size="sm" variant="outline" className="h-9!" onClick={fillProjectorScreen} title="The projector window isn't full screen yet. Click to fill it.">
                <Maximize size={14} /> Fill projector screen
              </Button>
            )}
            {projectorOpen ? (
              <Button size="sm" variant="secondary" className="h-9!" onClick={() => (closeProjector(), syncProjector())}>
                <MonitorOff size={14} /> Stop presenting
              </Button>
            ) : (
              <Button size="sm" className="h-9!" loading={presenting} disabled={!outputUrl} onClick={() => void present()}>
                <MonitorUp size={14} /> Present
              </Button>
            )}
          </div>
        </div>

        {upsell && (
          <Notice tone="info">
            Video slides are a Pro feature, on the Paid plan.{" "}
            {/* A new tab, so a service in progress here isn't left. */}
            <a href="/pricing" target="_blank" rel="noopener" className="font-semibold underline">
              See plans
            </a>
          </Notice>
        )}
        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex min-h-0 flex-1 flex-col card p-3">
          {current ? (
            <>
              <div className={`overflow-hidden rounded-lg ${onAir === current.id ? "ring-2 ring-negative" : "ring-1 ring-line"}`}>
                <div className="group relative aspect-video">
                  <SlideView slide={toSlide(current)} theme={current.kind === "text" ? display.scripture : undefined} muted />
                  {/* Picture slides: full height (the default) or full width. Always shown. */}
                  {current.kind === "image" && (
                    <button
                      type="button"
                      onClick={() => void setFit(current, current.fit === "width" ? "height" : "width")}
                      title={current.fit === "width" ? "Fit height: show each picture's full height" : "Fill width: stretch each picture across the screen"}
                      aria-label={current.fit === "width" ? "Fit height" : "Fill width"}
                      className="absolute right-2 bottom-2 z-10 inline-flex h-8 items-center gap-1.5 rounded-full bg-black/70 px-3 text-xs font-bold text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-black/85 active:scale-[0.97]"
                    >
                      {current.fit === "width" ? <StretchVertical size={14} /> : <StretchHorizontal size={14} />}
                      {current.fit === "width" ? "Fit height" : "Fill width"}
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-bold">{nameOf(current)}</p>
                {current.kind === "text" && (
                  <IconButton label="Edit" onClick={() => setEditing(current)}>
                    <Pencil size={16} />
                  </IconButton>
                )}
                <IconButton label="Delete" onClick={() => void remove(current)} className="hover:text-negative">
                  <Trash2 size={16} />
                </IconButton>
                {onAir === current.id && <Chip tone="live">On screen</Chip>}
              </div>
              {/* A picture slide's pictures: add up to the plan's number, or take one off. */}
              {current.kind === "image" && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(current.images ?? []).map((img) => (
                    <div key={img.public_id} className="group relative h-12 w-20 overflow-hidden rounded bg-black ring-1 ring-line">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail of the church's own picture */}
                      <img src={img.url} alt="" className="h-full w-full object-cover" />
                      {(current.images?.length ?? 0) > 1 && (
                        <button
                          type="button"
                          aria-label="Take this picture off the slide"
                          onClick={() => void removePicture(current, img.public_id)}
                          className="absolute top-0.5 right-0.5 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                  {(current.images?.length ?? 1) < limits.slideImages && (
                    <button
                      type="button"
                      disabled={uploading !== null}
                      onClick={() => addInput.current?.click()}
                      className="grid h-12 w-20 place-items-center rounded border-2 border-dashed border-line-strong text-muted transition hover:text-ink disabled:opacity-40"
                      title={`Add a picture beside it (up to ${limits.slideImages} on the ${planName(plan)} plan)`}
                    >
                      <Plus size={16} />
                    </button>
                  )}
                  <span className="text-xs text-faint">
                    {current.images?.length ?? 1} of {limits.slideImages} pictures on this slide
                  </span>
                </div>
              )}
              <p className="mt-2 text-xs text-muted">
                Click a slide or use the arrow keys to select it; while Live is on, it goes straight to the screen. Double-click a slide to go live with it.
              </p>
            </>
          ) : deck && !slides.length && adding !== "text" ? (
            <div className="grid flex-1 place-items-center p-4">
              <AddSlideChoice
                big
                first
                videoAllowed={limits.videoSlides}
                mediaFull={full}
                uploading={uploading}
                onText={pickText}
                onPicture={pickPicture}
                onVideo={pickVideo}
              />
            </div>
          ) : (
            <div className="grid flex-1 place-items-center text-center text-sm text-muted">
              <p className="max-w-xs">
                {deck
                  ? adding === "text"
                    ? "Write the slide's words on the right."
                    : "Pick a slide on the right."
                  : "Announcements, notices, welcome messages, flyers. Make a presentation, then add its slides: text, pictures or a video. They're kept for next week."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Presentations, or the open one's slides */}
      <aside className="flex min-h-[420px] flex-col gap-3 card p-3 lg:min-h-0">
        {!deck ? (
          <>
            <div className="flex items-center gap-2 px-1 pt-1">
              <h2 className="font-bold">Presentations</h2>
              <span className="text-sm text-faint tabular-nums">{decks.length}</span>
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto"
                disabled={decksFull}
                title={decksFull ? `The ${planName(plan)} plan has up to ${limits.decks} presentations` : "Make a presentation, then add its slides"}
                onClick={() => setNaming("new")}
              >
                <Plus size={14} /> New
              </Button>
            </div>
            {naming === "new" && <DeckName onCancel={() => setNaming(null)} onSave={saveDeck} />}
            {Number.isFinite(limits.decks) && (
              <p className={`px-1 text-xs ${decksFull ? "font-semibold text-warning" : "text-faint"}`}>
                {decks.length} of {limits.decks} presentations on the {planName(plan)} plan, up to {limits.deckSlides} slides each.
                {decksFull && " Delete one to make another, or upgrade."}
              </p>
            )}
            <ol className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
              {decks.map((d) => {
                const inIt = all.filter((x) => x.deck_id === d.id).sort((x, y) => x.position - y.position);
                return (
                  <li key={d.id} className="group flex items-center gap-1 rounded-lg transition hover:bg-surface-2">
                    <button type="button" onClick={() => openDeck(d.id)} className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left">
                      <Thumb slide={inIt[0]} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{d.name}</span>
                        <span className="block text-xs text-muted">
                          {inIt.length} slide{inIt.length === 1 ? "" : "s"}
                        </span>
                      </span>
                    </button>
                    <IconButton label="Delete presentation" onClick={() => void removeDeck(d)} className="mr-1 h-8 w-8 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-negative">
                      <Trash2 size={14} />
                    </IconButton>
                  </li>
                );
              })}
              {!decks.length && naming !== "new" && (
                <li className="px-4 py-10 text-center">
                  <p className="text-sm text-muted">No presentations yet.</p>
                  <Button size="sm" variant="secondary" className="mt-4" onClick={() => setNaming("new")}>
                    <Plus size={13} /> New
                  </Button>
                </li>
              )}
            </ol>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 pt-1">
              <IconButton label="All presentations" onClick={() => openDeck(null)} className="h-8 w-8">
                <ChevronLeft size={16} />
              </IconButton>
              {naming === "rename" ? (
                <div className="min-w-0 flex-1">
                  <DeckName initial={deck.name} onCancel={() => setNaming(null)} onSave={saveDeck} />
                </div>
              ) : (
                <>
                  <h2 className="min-w-0 truncate font-bold">{deck.name}</h2>
                  <span className="text-sm text-faint tabular-nums">
                    {slides.length}
                    {Number.isFinite(limits.deckSlides) ? `/${limits.deckSlides}` : ""}
                  </span>
                  <span className="ml-auto flex">
                    <IconButton label="Rename presentation" onClick={() => setNaming("rename")} className="h-8 w-8">
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton label="Delete presentation" onClick={() => void removeDeck(deck)} className="h-8 w-8 hover:text-negative">
                      <Trash2 size={14} />
                    </IconButton>
                  </span>
                </>
              )}
            </div>

            {editing && (
              <TextEditor key={editing.id} existing={editing} onCancel={() => setEditing(null)} onSave={(title, body) => saveText(title, body, editing)} />
            )}

            {/* The Free plan's allowance for pictures and videos; text is unlimited. */}
            {Number.isFinite(limit) && (
              <p className={`px-1 text-xs ${full ? "font-semibold text-warning" : "text-faint"}`}>
                {mediaCount} of {limit} picture slides on the {planName(plan)} plan, up to {limits.slideImages} pictures each, kept 7 days.
                {full ? " Delete one to upload another, or upgrade to keep more." : " Text slides are unlimited."}
              </p>
            )}

            <ol className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
              {slides.map((s, i) => (
                <li
                  key={s.id}
                  draggable
                  onDragStart={(e) => {
                    setDragging(s.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    setDropOn(s.id);
                  }}
                  onDragLeave={() => setDropOn((cur) => (cur === s.id ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragging) void move(dragging, s.id);
                    setDragging(null);
                    setDropOn(null);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setDropOn(null);
                  }}
                  className={`group relative rounded-lg ${dropOn === s.id && dragging !== s.id ? "ring-2 ring-accent" : ""} ${dragging === s.id ? "opacity-40" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => select(s)}
                    onDoubleClick={() => {
                      select(s);
                      if (!liveRef.current) void liveOn();
                    }}
                    title="Drag to reorder. Double-click to show."
                    className={`flex w-full cursor-grab items-center gap-3 rounded-lg p-2 text-left transition active:cursor-grabbing ${s.id === selected ? "bg-surface-3" : "hover:bg-surface-2"}`}
                  >
                    <span className="w-4 shrink-0 text-right text-xs font-bold text-faint tabular-nums">{i + 1}</span>
                    <Thumb slide={s} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{nameOf(s)}</span>
                      {s.kind === "text" ? (
                        <span className="block truncate text-xs text-muted">{s.body.split("\n").filter(Boolean).join(" · ")}</span>
                      ) : (
                        s.expires_at && <span className="block text-xs text-warning">{expiresIn(s.expires_at)}</span>
                      )}
                    </span>
                    {onAir === s.id && <span className="h-2 w-2 shrink-0 rounded-full bg-negative" title="On screen" />}
                  </button>
                </li>
              ))}

              {/* The next slide: what is it? Then its words, or its file. */}
              {slides.length > 0 && (
                <li className="pt-1">
                  {adding === "text" ? (
                    <TextEditor key="new" existing={null} onCancel={() => setAdding(null)} onSave={(title, body) => saveText(title, body, null)} />
                  ) : adding === "choose" || uploading !== null ? (
                    <AddSlideChoice
                      videoAllowed={limits.videoSlides}
                      mediaFull={full}
                      uploading={uploading}
                      onText={pickText}
                      onPicture={pickPicture}
                      onVideo={pickVideo}
                      onCancel={() => setAdding(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAdding("choose")}
                      disabled={deckFull}
                      title={deckFull ? `A presentation on the ${planName(plan)} plan has up to ${limits.deckSlides} slides` : "Add a slide: text, a picture or a video"}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-strong text-sm font-bold text-muted transition hover:border-ink/30 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
                    >
                      <Plus size={16} /> {deckFull ? `${limits.deckSlides} slides, the most on ${planName(plan)}` : "Add slide"}
                    </button>
                  )}
                </li>
              )}
              {/* The first slide's words, when Text was chosen in the preview. */}
              {!slides.length && adding === "text" && (
                <li>
                  <TextEditor key="first" existing={null} onCancel={() => setAdding(null)} onSave={(title, body) => saveText(title, body, null)} />
                </li>
              )}
              {!slides.length && adding !== "text" && <li className="px-2 py-6 text-center text-sm text-faint">No slides yet. Choose what the first one is.</li>}
            </ol>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length) void upload(files);
            e.target.value = "";
          }}
        />
        <input
          ref={videoInput}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload([f]);
            e.target.value = "";
          }}
        />
        <input
          ref={addInput}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            const sl = slides.find((x) => x.id === selected);
            if (files.length && sl) void addPictures(sl, files);
            e.target.value = "";
          }}
        />
      </aside>
    </div>
  );
}

/** A slide's little picture: its picture, its video, or a T for text. Nothing yet: an empty frame. */
function Thumb({ slide }: { slide?: SavedSlide }) {
  if (!slide) return <span className="aspect-video w-20 shrink-0 rounded border-2 border-dashed border-line-strong" />;
  return (
    <span className="grid aspect-video w-20 shrink-0 place-items-center overflow-hidden rounded bg-black">
      {slide?.kind === "image" && slide.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a thumbnail of the church's own picture
        <img src={slide.image_url} alt="" className="h-full w-full object-cover" />
      ) : slide?.kind === "video" && slide.image_url ? (
        <video src={slide.image_url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : (
        <Type size={16} className="text-white/60" />
      )}
    </span>
  );
}

/** A presentation's name, new or changed. Enter saves, Esc cancels. */
function DeckName({ initial = "", onSave, onCancel }: { initial?: string; onSave: (name: string) => Promise<string | void>; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-2 rounded-lg bg-surface-2 p-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        const err = await onSave(name);
        setSaving(false);
        if (err) setError(err);
      }}
    >
      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
          maxLength={80}
          placeholder="Title"
          aria-label="Presentation title"
          className="inset-field h-9 min-w-0 flex-1 rounded-md bg-bg px-3 text-sm"
        />
        <Button type="submit" size="sm" className="h-9!" loading={saving}>
          {!saving && !initial && <Plus size={14} />}
          {initial ? "Save" : "Create"}
        </Button>
        <IconButton label="Cancel" onClick={onCancel} className="h-9 w-9">
          <X size={16} />
        </IconButton>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </form>
  );
}

function TextEditor({
  existing,
  onCancel,
  onSave,
}: {
  existing: SavedSlide | null;
  onCancel: () => void;
  onSave: (title: string, body: string) => Promise<string | void>;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-2 rounded-lg bg-surface-2 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return setError("Write the words for the slide.");
        setSaving(true);
        const err = await onSave(title, body);
        setSaving(false);
        if (err) setError(err);
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">{existing ? "Edit text slide" : "New text slide"}</p>
        <IconButton label="Cancel" onClick={onCancel} className="h-8 w-8">
          <X size={15} />
        </IconButton>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Name, for the list (e.g. Welcome)"
        className="inset-field h-10 w-full rounded-md bg-bg px-3 text-sm"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        rows={5}
        autoFocus
        placeholder={"The words on screen, one line per line\ne.g. Welcome to church!\nService starts at 9am"}
        className="inset-field w-full resize-y rounded-md bg-bg px-3 py-2 text-sm"
      />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={saving}>
          {saving ? null : <Plus size={13} />} {existing ? "Save" : "Add slide"}
        </Button>
      </div>
    </form>
  );
}
