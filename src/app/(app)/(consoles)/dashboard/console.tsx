"use client";

import {
  ArrowUp,
  AudioLines,
  BookOpen,
  ChevronLeft,
  CloudUpload,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Mic,
  Play,
  Maximize,
  MonitorOff,
  MonitorUp,
  Search,
  Square,
  TriangleAlert,
  WifiOff,
  Timer,
  X,
  Zap,
  CircleOff,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { confirmDialog } from "@/components/confirm";
import { askToGoLive } from "@/lib/live/present-check";
import { DisplayQuick } from "@/components/display-quick";
import { Dropdown } from "@/components/dropdown";
import { SlideView } from "@/components/slide-view";
import { cleanDisplay, type DisplaySettings } from "@/lib/display/theme";
import { Button, Chip, IconButton, Kbd, PixelLoader, SignalBars } from "@/components/ui";
import { AUTO_REPEAT_MS, eligible, HOLD_MS, readiness } from "@/lib/live/auto-show";
import { outbox } from "@/lib/live/outbox";
import { lastSpokenTranslation, matchSpokenTranslation } from "@/lib/scripture/spoken-translations";
import { findTranslation, starredFirst, type TranslationInfo } from "@/lib/scripture/translations";
import { closeProjector, fillProjectorScreen, presentOnProjector, useProjectorOpen } from "@/lib/live/present";
import { CONSOLE_CHANNEL, SCREEN_TAKEN, ScreenSender, type ConsoleMessage } from "@/lib/live/screen";
import { buildSlides, loadTranslation, shapeOf, stepVerse, versesFor, type Slide, type Translation } from "@/lib/scripture/bible";
import { formatRef, parseSearch, refKey, type Detection, type VerseRef } from "@/lib/scripture/parser";
import { supabaseBrowser } from "@/lib/supabase/client";
import { HEADER_ACTIONS_ID } from "../../header";
import { useConsoleActive } from "../active";
import { useLiveService, type HeardHandler, type NotFound, type Suggestion, type VoiceCommand } from "./use-live-service";

const AUTO_KEY = "scripture.autoMode";
const TRANSLATION_KEY = "scripture.translation";

interface Props {
  churchId: string;
  userId: string;
  screenToken: string;
  translationId: string;
  /** Built-in translations plus the ones added on the admin site. */
  translations: TranslationInfo[];
  /** The ids this user starred: they sit at the top of the picker. */
  starred: string[];
  /** How the projector looks (Settings → Display). */
  display: DisplaySettings;
  /** Church admins can change the look from the console. */
  canEditDisplay: boolean;
  silenceEndMinutes: number;
}

/** What the operator has put up: a reference laid out as slides, and which slide is showing. */
interface Selection {
  ref: VerseRef;
  slides: Slide[];
  index: number;
}

type ShowSource = "detected" | "search" | "step";

export function Console({ churchId, userId, screenToken, translationId, translations, starred: initialStars, silenceEndMinutes, display: initialDisplay, canEditDisplay }: Props) {
  const active = useConsoleActive();
  const [bible, setBible] = useState<Translation | null>(null);
  const [bibleError, setBibleError] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  // Live: whether selections go to the screen. Off, the screen is blank and
  // selecting a verse only previews it here. Starts off, so nothing reaches the
  // screen until the operator chooses. L toggles it, Esc turns it off.
  const [isLive, setIsLive] = useState(false);
  const liveRef = useRef(false);
  const selectionRef = useRef<Selection | null>(null);
  const selectedSlide = selection ? (selection.slides[selection.index] ?? null) : null;
  const onAir = isLive ? selectedSlide : null;
  const [query, setQuery] = useState("");
  const searchBox = useRef<HTMLInputElement>(null);
  const screen = useRef<ScreenSender | null>(null);

  // The hook reports detections the instant they're heard; auto mode (below)
  // installs the real handler once showRef exists.
  const heardRef = useRef<HeardHandler | null>(null);
  const onHeard = useCallback<HeardHandler>((d, t, f, lag) => heardRef.current?.(d, t, f, lag), []);
  // "Next verse" / "previous verse" spoken, acted on while Auto is on.
  const commandRef = useRef<((cmd: VoiceCommand) => void) | null>(null);
  const onCommand = useCallback((cmd: VoiceCommand) => commandRef.current?.(cmd), []);
  // Everything heard, for translations named aloud ("…in the KJV").
  const textRef = useRef<((text: string) => void) | null>(null);
  const onText = useCallback((text: string) => textRef.current?.(text), []);
  // The last verse on screen, so a passage read aloud is followed from it.
  const currentVerse = useCallback(() => {
    const sel = selectionRef.current;
    if (!sel) return null;
    const lines = sel.slides[sel.index]?.lines ?? [];
    return { book: sel.ref.book, chapter: sel.ref.chapter, verse: lines[lines.length - 1]?.verse ?? sel.ref.verseStart ?? 1 };
  }, []);
  const live = useLiveService({ churchId, userId, bible, silenceEndMinutes, onHeard, onCommand, onText, currentVerse });

  // ---- Translation ----------------------------------------------------------
  // The church's default (Settings), unless this computer has picked another.
  const [translation, setTranslation] = useState(translationId);
  const [switching, setSwitching] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TRANSLATION_KEY);
      if (saved && translations.some((t) => t.id === saved)) setTranslation(saved);
    } catch {}
  }, [translations]);
  useEffect(() => {
    let cancelled = false;
    setSwitching(true);
    loadTranslation(findTranslation(translations, translation)).then(
      (b) => {
        if (cancelled) return;
        setBibleError("");
        setBible(b);
        setSwitching(false);
      },
      () => {
        if (cancelled) return;
        setBibleError("Could not load the Bible text. Check the connection and reload.");
        setSwitching(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [translation, translations]);
  // Stars: per user, saved to their account so they follow them to any computer.
  const [stars, setStars] = useState<ReadonlySet<string>>(() => new Set(initialStars));
  const pickerList = useMemo(() => starredFirst(translations, stars), [translations, stars]);
  const toggleStar = useCallback(
    async (id: string) => {
      const on = !stars.has(id);
      const flip = (add: boolean) =>
        setStars((s) => {
          const next = new Set(s);
          if (add) next.add(id);
          else next.delete(id);
          return next;
        });
      flip(on);
      const table = supabaseBrowser().from("translation_stars");
      const { error } = on ? await table.insert({ user_id: userId, translation_id: id }) : await table.delete().eq("user_id", userId).eq("translation_id", id);
      if (error) flip(!on);
    },
    [stars, userId],
  );
  const chooseTranslation = useCallback((id: string) => {
    setTranslation(id);
    try {
      localStorage.setItem(TRANSLATION_KEY, id);
    } catch {}
  }, []);

  // The output link's token. Follows "Replace link" in Settings straight away
  // when that happens in this browser.
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
      if ((e as CustomEvent).detail === screen.current) return;
      liveRef.current = false;
      setIsLive(false);
    };
    window.addEventListener(SCREEN_TAKEN, onTaken);
    return () => window.removeEventListener(SCREEN_TAKEN, onTaken);
  }, []);

  // Every slide goes out in the scripture look. When the look changes, the
  // verse on screen is sent again so the projector shows it straight away.
  const shownDisplay = useRef(display);
  useEffect(() => {
    if (!screen.current) return;
    screen.current.theme = display.scripture;
    if (shownDisplay.current === display) return;
    shownDisplay.current = display;
    const sel = selectionRef.current;
    const slide = sel?.slides[sel.index];
    if (liveRef.current && slide) void screen.current.show(slide);
  }, [display, token]);

  // ---- Present on projector -----------------------------------------------
  const [presenting, setPresenting] = useState(false);
  const [presentBlocked, setPresentBlocked] = useState(false);
  async function present() {
    if (!outputUrl) return;
    if (!liveRef.current && (await askToGoLive("verses"))) goLive(true);
    setPresenting(true);
    setPresentBlocked(false);
    const result = await presentOnProjector(outputUrl);
    setPresenting(false);
    setPresentBlocked(result === "blocked");
    syncProjector();
  }
  const [projectorOpen, syncProjector, projectorFull] = useProjectorOpen();
  function stopPresenting() {
    closeProjector();
    syncProjector();
  }

  // Built after mount: the server doesn't know the origin, and a mismatch breaks hydration.
  const [outputUrl, setOutputUrl] = useState("");
  useEffect(() => setOutputUrl(token ? `${location.origin}/screen/${token}` : ""), [token]);

  // ---- Putting verses on screen -------------------------------------------

  const logShown = useCallback(
    (slide: Slide, ref: VerseRef, source: ShowSource, s?: Suggestion) => {
      if (!live.serviceId || !bible) return;
      // Stored in this browser first and sent when the connection allows, so
      // verses shown during an outage still reach the service history.
      outbox(supabaseBrowser()).add("verses_shown", {
        client_id: crypto.randomUUID(),
        shown_at: new Date().toISOString(),
        service_id: live.serviceId,
        church_id: churchId,
        label: slide.label,
        book: ref.book,
        chapter: ref.chapter,
        verse_start: slide.lines[0].verse,
        verse_end: slide.lines[slide.lines.length - 1].verse,
        translation: bible.id,
        source,
        confidence: s?.confidence ?? null,
        segment_seq: s?.seq ?? null,
        char_start: s?.start ?? null,
        char_end: s?.end ?? null,
      });
    },
    [live.serviceId, bible, churchId],
  );

  const putUp = useCallback(
    (sel: Selection, source: ShowSource, s?: Suggestion) => {
      const slide = sel.slides[sel.index];
      if (!slide) return;
      if (liveRef.current) {
        // The screen first: the broadcast leaves before React re-renders here.
        void screen.current?.show(slide);
        shownRef.current = { key: refKey(sel.ref), ref: sel.ref };
        logShown(slide, sel.ref, source, s);
      }
      selectionRef.current = sel;
      setSelection(sel);
      // Follow-ups like "verse 17" now mean this chapter.
      live.ctxRef.current = { book: sel.ref.book, chapter: sel.ref.chapter };
    },
    [logShown, live.ctxRef],
  );

  const showRef = useCallback(
    (ref: VerseRef, source: ShowSource, s?: Suggestion) => {
      if (!bible) return;
      // A chapter on its own opens at verse 1.
      const r = ref.verseStart === undefined ? { ...ref, verseStart: 1, verseEnd: 1 } : ref;
      const slides = buildSlides(bible, r);
      if (slides.length) putUp({ ref: r, slides, index: 0 }, source, s);
    },
    [bible, putUp],
  );

  // Stable across renders so memoised cards don't re-render on every partial.
  const showRefLatest = useRef(showRef);
  const shownRef = useRef<{ key: string; ref: VerseRef } | null>(null);
  useEffect(() => {
    showRefLatest.current = showRef;
  }, [showRef]);
  const showCard = useCallback((s: Suggestion) => showRefLatest.current(s.ref, "detected", s), []);

  const step = useCallback(
    (dir: 1 | -1) => {
      if (!bible || !selection) return;
      const i = selection.index + dir;
      if (i >= 0 && i < selection.slides.length) {
        putUp({ ...selection, index: i }, "step");
        return;
      }
      // Past the end of this selection: move one verse on, or back.
      const cur = selection.slides[selection.index];
      const edge = dir === 1 ? cur.lines[cur.lines.length - 1].verse : cur.lines[0].verse;
      const next = stepVerse(bible, selection.ref.book, selection.ref.chapter, edge, dir);
      if (!next) return;
      const slides = buildSlides(bible, next);
      putUp({ ref: next, slides, index: dir === 1 ? 0 : slides.length - 1 }, "step");
    },
    [bible, selection, putUp],
  );

  const goLive = useCallback(
    (on: boolean) => {
      liveRef.current = on;
      setIsLive(on);
      if (!on) {
        void screen.current?.show(null);
        shownRef.current = null;
        return;
      }
      // Going live sends whatever is selected (the preview) to the screen.
      const sel = selectionRef.current;
      const slide = sel?.slides[sel.index] ?? null;
      void screen.current?.show(slide);
      if (sel && slide) {
        shownRef.current = { key: refKey(sel.ref), ref: sel.ref };
        logShown(slide, sel.ref, "step");
      }
    },
    [logShown],
  );
  const clear = useCallback(() => goLive(false), [goLive]);

  // Switching translation redraws what's selected in the new wording, and
  // updates the screen when live.
  useEffect(() => {
    const sel = selectionRef.current;
    if (!bible || !sel || sel.slides[0]?.translation === (bible.short ?? bible.id.toUpperCase())) return;
    const slides = buildSlides(bible, sel.ref);
    if (slides.length) putUp({ ref: sel.ref, slides, index: Math.min(sel.index, slides.length - 1) }, "step");
  }, [bible, putUp]);

  // ---- Chapter list and verse jumps ----------------------------------------
  // The chapter being browsed follows the selection; the arrows above the
  // list move it without changing what's selected.
  const [browse, setBrowse] = useState<{ book: number; chapter: number } | null>(null);
  useEffect(() => {
    if (selection) setBrowse({ book: selection.ref.book, chapter: selection.ref.chapter });
  }, [selection]);

  const moveChapter = useCallback(
    (dir: 1 | -1) => {
      if (!bible || !browse) return;
      let { book, chapter } = browse;
      chapter += dir;
      if (chapter < 1) {
        if (book === 0) return;
        book -= 1;
        chapter = bible.books[book].length;
      } else if (chapter > bible.books[book].length) {
        if (book === bible.books.length - 1) return;
        book += 1;
        chapter = 1;
      }
      setBrowse({ book, chapter });
    },
    [bible, browse],
  );

  const pickVerse = useCallback(
    (book: number, chapter: number, verse: number) => showRef({ book, chapter, verseStart: verse, verseEnd: verse }, "search"),
    [showRef],
  );

  // Typing a number (not in a text box) jumps to that verse in the chapter.
  // It waits briefly for a second digit, unless no longer number can exist.
  const [typedVerse, setTypedVerse] = useState("");
  // Shown for a moment after a jump, so the operator sees where it landed.
  const [jumpNote, setJumpNote] = useState<{ text: string; ok: boolean } | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typedRef = useRef("");
  const typedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeDigit = useCallback(
    (digit: string) => {
      if (!bible || !browse) return;
      const max = bible.books[browse.book][browse.chapter - 1].length;
      const next = (typedRef.current + digit).replace(/^0+/, "");
      if (!next) return;
      if (typedTimer.current) clearTimeout(typedTimer.current);
      const jump = (n: string) => {
        typedRef.current = "";
        setTypedVerse("");
        const v = Number(n);
        const ok = v >= 1 && v <= max;
        if (ok) pickVerse(browse.book, browse.chapter, v);
        setJumpNote({ ok, text: ok ? `Verse ${v}` : `No verse ${v} in ${formatRef({ book: browse.book, chapter: browse.chapter })}` });
        if (noteTimer.current) clearTimeout(noteTimer.current);
        noteTimer.current = setTimeout(() => setJumpNote(null), ok ? 1000 : 2000);
      };
      if (Number(next) * 10 > max) {
        jump(next);
        return;
      }
      typedRef.current = next;
      setJumpNote(null);
      setTypedVerse(next);
      typedTimer.current = setTimeout(() => jump(next), 600);
    },
    [bible, browse, pickVerse],
  );

  // Voice commands step through verses, only while Auto is on.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useEffect(() => {
    commandRef.current = (cmd) => {
      if (autoRef.current) stepRef.current(cmd === "next" ? 1 : -1);
    };
  });

  // ---- Auto mode ----------------------------------------------------------
  // Clear, explicit references go straight to the screen as they are heard,
  // without waiting for a click. See src/lib/live/auto-show.ts for when a
  // reference counts as finished.

  const [auto, setAuto] = useState(true);
  const [autoKey, setAutoKey] = useState<string | null>(null);
  /** Last measured time from the words being spoken to the verse being sent to the screens. */
  const [speechToScreen, setSpeechToScreen] = useState<number | null>(null);
  const autoRef = useRef(auto);
  const recentAuto = useRef(new Map<string, number>());
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const fireAuto = useCallback((d: Detection, lagMs: number, heardAt: number) => {
    const key = refKey(d.ref);
    const cur = shownRef.current;
    if (cur?.key === key) return;
    // "John 3:16" then "to 18": widen what is already up.
    const widens =
      !!cur &&
      cur.ref.book === d.ref.book &&
      cur.ref.chapter === d.ref.chapter &&
      cur.ref.verseStart === d.ref.verseStart &&
      (d.ref.verseEnd ?? 0) > (cur.ref.verseEnd ?? cur.ref.verseStart ?? 0);
    // Don't bring back something the operator just cleared or stepped past.
    const last = recentAuto.current.get(key);
    if (!widens && last && Date.now() - last < AUTO_REPEAT_MS) return;
    recentAuto.current.set(key, Date.now());
    showRefLatest.current(d.ref, "detected", { key, ref: d.ref, confidence: d.confidence, kind: d.kind, at: Date.now(), start: d.start, end: d.end });
    // Transcription lag, plus our own time (including any hold) up to the send.
    if (liveRef.current) setSpeechToScreen(Math.round(lagMs + (performance.now() - heardAt)));
    setAutoKey(key);
  }, []);

  useEffect(() => {
    heardRef.current = (dets, text, final, lagMs) => {
      const heardAt = performance.now();
      if (!autoRef.current || !bible) return;
      // Newer words replace any reference we were waiting on.
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
      const candidates = dets.filter(eligible);
      const d = candidates[candidates.length - 1];
      if (!d) return;
      const r = readiness(text, d, shapeOf(bible), final);
      if (r === "now") fireAuto(d, lagMs, heardAt);
      else if (r === "hold") holdTimer.current = setTimeout(() => fireAuto(d, lagMs, heardAt), HOLD_MS);
    };
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, [bible, fireAuto]);

  // ---- Translations named aloud ---------------------------------------------
  // "Mark 13:4 in the KJV": with Auto on, the console switches to it (just for
  // now, not as this computer's choice) and the verse redraws in it. With
  // Auto off, or a translation the church doesn't have, a note says what was
  // asked for.
  const [asked, setAsked] = useState<{ short: string; id: string | null; switched: boolean } | null>(null);
  const lastAsked = useRef({ short: "", at: 0 });
  const translationRef = useRef(translation);
  useEffect(() => {
    translationRef.current = translation;
  }, [translation]);
  useEffect(() => {
    textRef.current = (text) => {
      const said = lastSpokenTranslation(text);
      if (!said) return;
      // A partial transcript repeats itself as it grows: act once per request.
      const now = Date.now();
      if (lastAsked.current.short === said.short && now - lastAsked.current.at < 15_000) return;
      lastAsked.current = { short: said.short, at: now };
      const match = matchSpokenTranslation(translations, said.short);
      if (match && autoRef.current) {
        if (match.id !== translationRef.current) setTranslation(match.id);
        setAsked({ short: said.short, id: match.id, switched: true });
      } else {
        setAsked({ short: said.short, id: match?.id ?? null, switched: false });
      }
    };
  }, [translations]);
  useEffect(() => {
    if (!asked) return;
    const t = setTimeout(() => setAsked(null), asked.switched ? 6000 : 15000);
    return () => clearTimeout(t);
  }, [asked]);

  // ---- Manual search ------------------------------------------------------

  const searchRef = useMemo(() => (bible && query.trim() ? parseSearch(query, shapeOf(bible), live.ctxRef.current) : null), [bible, query, live.ctxRef]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchRef) return;
    showRef(searchRef, "search");
    setQuery("");
    searchBox.current?.blur();
  }

  // ---- Keyboard -----------------------------------------------------------

  useEffect(() => {
    // Only the console on screen answers the keyboard (see ../active.ts).
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      // Already handled, e.g. by an open dropdown using the arrows or Esc.
      if (e.defaultPrevented) return;
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
      if (e.key === "Escape") {
        if (typing) (e.target as HTMLElement).blur();
        clear();
        return;
      }
      // Alt + 1 to 9 shows the matching suggestion card.
      if (e.altKey && !typing && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const s = live.suggestions[Number(e.key) - 1];
        if (s) showRef(s.ref, "detected", s);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "l" || e.key === "L") {
        goLive(!liveRef.current);
      } else if (/^[0-9]$/.test(e.key)) {
        typeDigit(e.key);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "a" || e.key === "A") {
        setAuto((v) => !v);
      } else if (e.key === "/") {
        e.preventDefault();
        searchBox.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, clear, step, showRef, live.suggestions, goLive, typeDigit]);

  // ---- Render -------------------------------------------------------------

  const liveCards = live.partial.detections.filter((d) => !live.suggestions.some((s) => s.key === refKey(d.ref)));
  const onAirKey = selection && onAir ? refKey(selection.ref) : null;

  const warnings: { icon: typeof TriangleAlert; text: string }[] = [];
  if (bibleError) warnings.push({ icon: TriangleAlert, text: bibleError });
  if (presentBlocked)
    warnings.push({
      icon: TriangleAlert,
      text: "Chrome blocked the projector window. Click the pop-up icon at the right of the address bar, choose Always allow, then press Present again.",
    });
  if (live.error) warnings.push({ icon: TriangleAlert, text: live.error });
  if (live.warnings.offline)
    warnings.push({ icon: WifiOff, text: "You're offline. Search still works from the saved Bible; detection resumes when the connection is back." });
  if (live.phase === "live" && live.status === "reconnecting") warnings.push({ icon: WifiOff, text: "Transcription connection dropped. Reconnecting." });
  if (live.phase === "live" && live.warnings.silent) warnings.push({ icon: TriangleAlert, text: "No sound on the selected input for 10 seconds. Check the desk feed." });
  if (live.phase === "live" && live.warnings.clipping) warnings.push({ icon: TriangleAlert, text: "The input is clipping. Turn the feed down at the desk." });

  return (
    // Two columns on desktop: the console on the left, the Bible (search and
    // the chapter) in a sidebar on the right, both filling the window under
    // the header. On narrow screens everything stacks and the page scrolls.
    <div className="flex flex-col gap-2 px-2 pb-2 lg:grid lg:h-[calc(100dvh-4rem)] lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      <div className="flex min-h-0 flex-col gap-2">
        <ControlBar live={live} auto={auto} onToggleAuto={() => setAuto((v) => !v)} speechToScreen={speechToScreen} />
  
        {warnings.length > 0 && (
          <div className="space-y-1">
            {warnings.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5 rounded-lg bg-warning/12 px-4 py-2.5 text-sm font-semibold text-warning">
                <Icon size={17} className="shrink-0" />
                {text}
              </div>
            ))}
          </div>
        )}
  
        <EndServiceButton live={live} />
        <div className="relative grid min-h-0 flex-1 gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {(live.phase === "idle" || live.phase === "starting") && <StartOverlay live={live} ready={!!bible} />}
          {/* Suggestions */}
          <section className="flex min-h-0 flex-col rounded-lg bg-surface">
            <PanelTitle title="Heard references" right={<span className="hidden items-center gap-1.5 text-xs text-faint sm:flex"><Kbd>Alt</Kbd> + <Kbd>1</Kbd> to <Kbd>9</Kbd> to show</span>} />
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">
              {live.notFound.map((n) => (
                <NotFoundCard key={n.key} n={n} onDismiss={live.dismissNotFound} />
              ))}
              {liveCards.map((d) => (
                <SuggestionCard
                  key={`live-${refKey(d.ref)}`}
                  bible={bible}
                  s={{ key: refKey(d.ref), ref: d.ref, confidence: d.confidence, kind: d.kind, at: 0 }}
                  hearing
                  onShow={showCard}
                />
              ))}
              {live.suggestions.map((s, i) => (
                <SuggestionCard
                  key={s.key}
                  bible={bible}
                  s={s}
                  hotkey={i < 9 ? i + 1 : undefined}
                  onAir={onAirKey === s.key}
                  onShow={showCard}
                  onDismiss={live.dismiss}
                />
              ))}
              {liveCards.length === 0 && live.suggestions.length === 0 && live.notFound.length === 0 && <EmptyState phase={live.phase} />}
            </div>
          </section>
  
          {/* Screen control */}
          <section className="flex min-h-0 flex-col rounded-lg bg-surface">
            {/* Header: what the screen is doing on the left, the Live switch on the right. */}
            <div className="flex h-14 shrink-0 items-center gap-3 px-4">
              <h2 className="font-bold">On screen</h2>
              {isLive ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-negative">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-negative" /> Live
                </span>
              ) : (
                <span className="text-xs font-bold text-faint">Not live · screen blank</span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isLive}
                  onClick={() => goLive(!isLive)}
                  title={isLive ? "Live: selected verses go to the screen. Press L or Esc to blank it." : "Not live: verses only preview here. Press L to go live."}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-surface-2 pr-2 pl-3 text-sm font-semibold transition hover:bg-surface-3 active:scale-[0.97]"
                >
                  Live
                  <Kbd>L</Kbd>
                  <span className={`relative h-5 w-9 rounded-full transition ${isLive ? "bg-negative" : "bg-surface-3 ring-1 ring-line-strong"}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${isLive ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                </button>
              </div>
            </div>
  
          {/* The preview fills the panel at 16:9, with the stepper under it. */}
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">
            <div className="flex min-h-0 flex-col lg:flex-1">
              <div className="flex h-[60vw] items-center justify-center [container-type:size] lg:h-auto lg:min-h-[150px] lg:flex-1">
                  <div className="flex w-[min(100cqw,calc((100cqh-50px)*16/9))] flex-col gap-2.5">
                  {/* Like a broadcast monitor: red outline and LIVE when it is on
                      the screen, PREVIEW when it is not. Sized to leave room for
                      the stepper below it. */}
                  <div
                    className={`relative aspect-video w-full overflow-hidden rounded-lg shadow-pop ${
                      onAir ? "ring-2 ring-negative" : "ring-1 ring-line"
                    }`}
                  >
                    <SlideView slide={selectedSlide} theme={display.scripture} />
                    {!selectedSlide && (
                      <span className="absolute inset-0 grid place-items-center text-xs font-semibold text-white/30">Screen is clear</span>
                    )}
                    {selectedSlide && (
                      <span
                        className={`absolute top-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                          onAir ? "bg-negative text-white" : "bg-white/15 text-white/80"
                        }`}
                      >
                        {onAir ? "Live" : "Preview"}
                      </span>
                    )}
                  </div>
              {/* Under the preview, as wide as it: the stepper on the left,
                  sending the output to the projector on the right. */}
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div className="inline-flex h-10 items-center rounded-full bg-surface-2 p-0.5">
                  <IconButton label="Previous verse (←)" onClick={() => step(-1)} disabled={!selection} className="h-9 w-9 text-ink hover:bg-surface-3">
                    <ChevronLeft size={18} />
                  </IconButton>
                  <span className={`min-w-28 px-2 text-center text-sm font-bold tabular-nums ${selectedSlide ? "text-ink" : "text-faint"}`}>
                    {selectedSlide?.label ?? "No verse yet"}
                  </span>
                  <IconButton label="Next verse (→)" onClick={() => step(1)} disabled={!selection} className="h-9 w-9 text-ink hover:bg-surface-3">
                    <ChevronRight size={18} />
                  </IconButton>
                </div>
                {autoKey !== null && autoKey === onAirKey && (
                  <Chip>
                    <Zap size={12} className="fill-current" /> Auto
                  </Chip>
                )}
                {selection && selection.slides.length > 1 && (
                  <ol className="flex flex-wrap gap-1.5">
                    {selection.slides.map((sl, i) => (
                      <li key={sl.label + i}>
                        <button
                          onClick={() => putUp({ ...selection, index: i }, "step")}
                          className={`h-7 rounded-full px-3 text-xs font-bold transition ${
                            i === selection.index ? "bg-accent-fill text-on-accent" : "bg-surface-2 text-muted hover:text-ink"
                          }`}
                        >
                          {i + 1}/{selection.slides.length}
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                {outputUrl && (
                  <div className="ml-auto flex items-center gap-1">
                    <a
                      href={outputUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open the output page in a new tab"
                      title="Open the output page in a new tab"
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
                      <Button size="sm" className="h-10" loading={presenting} onClick={present} title="Open the output full screen on the projector (second monitor)">
                        <MonitorUp size={14} /> Present
                      </Button>
                    )}
                    {canEditDisplay && <DisplayQuick churchId={churchId} kind="scripture" display={display} onChange={setDisplay} />}
                  </div>
                )}
              </div>
                  </div>
                </div>
            </div>
          </div>
          </section>
        </div>

        <TranscriptStrip segments={live.segments} partial={live.partial} phase={live.phase} />
      </div>

      {/* Bible sidebar: find a verse, then browse its chapter. */}
      <aside className="flex min-h-[460px] flex-col gap-3 rounded-lg bg-surface p-3 lg:min-h-0">
        <div className="flex items-center gap-2 px-1 pt-1">
          <h2 className="font-bold">Bible</h2>
          <Dropdown
            ariaLabel="Translation"
            value={translation}
            onChange={chooseTranslation}
            options={pickerList.map((t) => ({ value: t.id, label: t.short, hint: t.name }))}
            starred={stars}
            onStar={(id) => void toggleStar(id)}
            icon={switching ? <LoaderCircle size={14} className="animate-spin text-muted" /> : undefined}
            className="ml-auto h-9 w-28 text-sm font-bold"
            align="right"
          />
        </div>
        {/* A translation the preacher named. */}
        {asked &&
          (asked.switched ? (
            <p className="flex items-center gap-2 rounded-lg bg-accent-fill/10 px-3 py-2 text-sm">
              <AudioLines size={15} className="shrink-0 text-accent" />
              <span>
                Heard <b>{asked.short}</b>, switched to it.
              </span>
            </p>
          ) : asked.id ? (
            <button
              type="button"
              onClick={() => {
                setTranslation(asked.id!);
                setAsked({ ...asked, switched: true });
              }}
              className="flex items-center gap-2 rounded-lg bg-accent-fill/10 px-3 py-2 text-left text-sm transition hover:bg-accent-fill/20"
            >
              <AudioLines size={15} className="shrink-0 text-accent" />
              <span className="flex-1">
                Preacher asked for <b>{asked.short}</b>
              </span>
              <span className="text-xs font-bold text-accent">Switch</span>
            </button>
          ) : (
            <p className="flex items-center gap-2 rounded-lg bg-warning/12 px-3 py-2 text-sm text-warning">
              <TriangleAlert size={15} className="shrink-0" />
              <span>
                Preacher asked for <b>{asked.short}</b>, which isn&apos;t available.
              </span>
            </p>
          ))}
        {/* Search, styled as a prompt bar. Equal 6px insets around the
            round icon on the left and the round button on the right. */}
        <form onSubmit={submitSearch} className="inset-field shrink-0 rounded-[26px] bg-surface-2">
          <label className="flex items-center gap-1.5 p-1.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center text-muted">
              <Search size={18} />
            </span>
            <span className="sr-only">Find a verse</span>
            <input
              ref={searchBox}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a verse: Jn 3 16, 1 cor 13:4-7, ps 23"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] outline-none placeholder:text-faint"
              autoComplete="off"
              spellCheck={false}
            />
            <Kbd>/</Kbd>
            <button
              type="submit"
              disabled={!searchRef}
              aria-label="Show this verse"
              className="ml-1.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-fill text-on-accent transition hover:scale-105 disabled:bg-surface-3 disabled:text-faint"
            >
              <ArrowUp size={18} />
            </button>
          </label>
          {query.trim() && (
            <div className="border-t border-line p-1.5 text-sm">
              {searchRef && bible ? (
                // Clicking the result does the same as pressing Enter.
                <button
                  type="submit"
                  className="flex w-full items-start gap-3 rounded-[20px] px-3 py-2.5 text-left transition hover:bg-ink/5 active:scale-[0.99]"
                >
                  <p className="line-clamp-2 min-w-0 flex-1">
                    <span className="font-bold text-accent">{formatRef(searchRef)}</span>{" "}
                    <span className="font-serif text-muted">
                      {versesFor(bible, searchRef.verseStart ? searchRef : { ...searchRef, verseStart: 1 })[0]?.text}
                    </span>
                  </p>
                  <Kbd>Enter</Kbd>
                </button>
              ) : (
                <p className="px-3 py-2.5 text-faint">No reference recognised yet.</p>
              )}
            </div>
          )}
        </form>
        {browse && bible ? (
          <ChapterList
            bible={bible}
            book={browse.book}
            chapter={browse.chapter}
            selected={selection && selection.ref.book === browse.book && selection.ref.chapter === browse.chapter ? selectedSlide : null}
            onPick={pickVerse}
            onMove={moveChapter}
            typed={typedVerse}
            note={jumpNote}
          />
        ) : (
          <div className="flex min-h-[200px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 text-center lg:min-h-0">
            <BookOpen size={20} className="text-faint" />
            <p className="mt-2 text-sm font-semibold">The chapter appears here</p>
            <p className="mt-0.5 max-w-60 text-xs leading-snug text-muted">
              Search a verse or click a heard reference, then click any verse or type its number.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ControlBar({
  live,
  auto,
  onToggleAuto,
  speechToScreen,
}: {
  live: ReturnType<typeof useLiveService>;
  auto: boolean;
  onToggleAuto: () => void;
  speechToScreen: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live.startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live.startedAt]);

  const elapsed = live.startedAt ? Math.max(0, Math.floor((now - live.startedAt) / 1000)) : 0;
  const clock = `${Math.floor(elapsed / 3600)}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg bg-surface px-4 py-3">
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
        // Checks the desk feed before the service: the meter moves with the
        // input, no transcription. Also unlocks the real device names.
        <Button
          variant={live.testing ? "secondary" : "outline"}
          size="sm"
          onClick={() => void live.toggleTest()}
          title={live.testing ? "Stop the mic test" : "Check the selected input before the service: the level meter moves with the sound"}
        >
          {live.testing ? <Square size={11} className="fill-current" /> : <Mic size={13} />}
          {live.testing ? "Stop test" : "Test mic"}
        </Button>
      )}

      <div className="ml-auto flex items-center gap-3">
        {speechToScreen !== null && (
          <span title="Last auto-shown verse: time from the words being spoken to the verse being sent to your screens">
            <Chip tone={speechToScreen < 1000 ? "ok" : "warn"}>
              <Timer size={13} /> {(speechToScreen / 1000).toFixed(2)} s
            </Chip>
          </span>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={auto}
          onClick={onToggleAuto}
          title={auto ? "Auto mode on: clear references go straight to the screen (A)" : "Auto mode off: every verse waits for your click (A)"}
          className={`inline-flex h-9 items-center gap-2 rounded-full pr-2 pl-3.5 text-sm font-bold transition ${auto ? "bg-accent-fill/15 text-accent" : "bg-surface-2 text-muted hover:text-ink"}`}
        >
          <Zap size={15} className={auto ? "fill-current" : ""} />
          Auto
          <span className={`relative h-5 w-9 rounded-full transition ${auto ? "bg-accent-fill" : "bg-surface-3"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${auto ? "left-[18px]" : "left-0.5"}`} />
          </span>
        </button>
        {live.phase === "live" &&
          (live.status === "live" ? (
            <Chip tone="live">
              <span className="h-2 w-2 animate-pulse rounded-full bg-negative" /> Live <span className="font-mono font-semibold tabular-nums">{clock}</span>
            </Chip>
          ) : (
            <Chip tone="warn">
              <WifiOff size={13} /> Reconnecting
            </Chip>
          ))}
        {live.unsaved > 0 && (
          <span title="Transcript lines and verses shown are stored on this computer and will be saved as soon as the connection allows.">
            <Chip tone="warn">
              <CloudUpload size={13} /> {live.unsaved} waiting to save
            </Chip>
          </span>
        )}
        {live.phase === "ending" && <PixelLoader label="Saving transcript" />}
      </div>
    </div>
  );
}

// Covers the cards until the service starts, so the one thing to do next is
// obvious. The input picker and mic test above it stay usable.
export function StartOverlay({
  live,
  ready,
  notReadyLabel = "Loading Bible",
  title = "Ready when the service starts",
  action = "Start service",
}: {
  live: ReturnType<typeof useLiveService>;
  ready: boolean;
  notReadyLabel?: string;
  title?: string;
  action?: string;
}) {
  const starting = live.phase === "starting";
  return (
    <div className="absolute inset-0 z-20 grid place-items-center rounded-lg bg-bg/70 p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="false" aria-labelledby="start-title" className="w-full max-w-sm rounded-xl bg-menu p-6 text-center shadow-pop ring-1 ring-line">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-muted">
          <AudioLines size={24} />
        </span>
        <h2 id="start-title" className="mt-4 text-lg font-bold">{title}</h2>
        <p className="mt-0.5 text-sm leading-snug text-muted">Pick the desk feed above, then start listening.</p>
        <Button className="mt-5 w-full" onClick={live.start} loading={starting} disabled={!ready}>
          {!starting && <Play size={15} className="fill-current" />}
          {starting ? "Connecting" : ready ? action : notReadyLabel}
        </Button>
      </div>
    </div>
  );
}

// End service lives in the app header, beside the account menu, while a
// service is running.
export function EndServiceButton({
  live,
  label = "End service",
  confirmTitle = "End this service?",
  confirmBody = "Listening stops. The transcript and the verses shown are saved to history.",
}: {
  live: ReturnType<typeof useLiveService>;
  label?: string;
  confirmTitle?: string;
  confirmBody?: string;
}) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(HEADER_ACTIONS_ID)), []);
  // Only one console listens at a time, so this is the only one: shown even
  // while another tab is open, to end the service from anywhere.
  if (!slot || (live.phase !== "live" && live.phase !== "ending")) return null;
  return createPortal(
    <Button
      variant="outline"
      size="sm"
      loading={live.phase === "ending"}
      onClick={async () => {
        if (await confirmDialog({ title: confirmTitle, body: confirmBody, confirmLabel: label })) void live.end("operator");
      }}
    >
      {live.phase !== "ending" && <Square size={11} className="fill-current" />}
      {live.phase === "ending" ? "Ending" : label}
    </Button>,
    slot,
  );
}

// Draws straight to the DOM on each animation frame from the hook's level
// ref, so audio-rate updates never re-render React.
export function LevelMeter({ levelRef, active }: { levelRef: React.RefObject<{ rms: number; peak: number }>; active: boolean }) {
  const bar = useRef<HTMLDivElement>(null);
  const tick = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Speech sits around -30 to -12 dBFS; map -60..0 dB onto the bar.
    const pct = (v: number) => (v > 0 ? Math.max(0, Math.min(100, ((20 * Math.log10(v) + 60) / 60) * 100)) : 0);
    if (!active) {
      if (bar.current) bar.current.style.width = "0%";
      if (tick.current) tick.current.style.left = "0%";
      return;
    }
    let raf = 0;
    let wasHot = false;
    const draw = () => {
      const { rms, peak } = levelRef.current;
      const hot = peak >= 0.98;
      if (bar.current) bar.current.style.width = `${pct(rms)}%`;
      if (tick.current) tick.current.style.left = `${pct(peak)}%`;
      if (hot !== wasHot) {
        wasHot = hot;
        bar.current?.classList.toggle("bg-negative", hot);
        bar.current?.classList.toggle("bg-accent-fill", !hot);
        if (label.current) {
          label.current.textContent = hot ? "Clipping" : "Level";
          label.current.classList.toggle("text-negative", hot);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, levelRef]);

  return (
    <div className="flex items-center gap-2.5" title="Input level">
      <div className="relative h-1.5 w-32 overflow-hidden rounded-full bg-surface-3">
        <div ref={bar} className="absolute inset-y-0 left-0 w-0 rounded-full bg-accent-fill" />
        <div ref={tick} className="absolute inset-y-0 w-0.5 bg-ink/60" />
      </div>
      <span ref={label} className="text-xs font-semibold text-faint">
        Level
      </span>
    </div>
  );
}

function PanelTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between px-4">
      <h2 className="font-bold">{title}</h2>
      {right}
    </div>
  );
}

function confidence(c: number): { level: 1 | 2 | 3; label: string } {
  if (c >= 0.85) return { level: 3, label: "Clear" };
  if (c >= 0.6) return { level: 2, label: "Likely" };
  return { level: 1, label: "Check" };
}

// After beautifului.dev's recommendation card: the suggestion, a confidence
// meter, and the actions. Memoised, with stable handlers from the console,
// so a new partial transcript re-renders only the cards that changed.
const SuggestionCard = memo(
  function SuggestionCard({
    bible,
    s,
    hearing,
    hotkey,
    onAir,
    onShow,
    onDismiss,
  }: {
    bible: Translation | null;
    s: Suggestion;
    hearing?: boolean;
    hotkey?: number;
    onAir?: boolean;
    onShow: (s: Suggestion) => void;
    onDismiss?: (key: string) => void;
  }) {
    const refx = s.ref;
    const preview = bible ? versesFor(bible, refx.verseStart ? refx : { ...refx, verseStart: 1 }) : [];
    const text = preview.map((v) => v.text).join(" ");
    const conf = confidence(s.confidence);
    const show = () => onShow(s);
    return (
      <article
        className={`rounded-lg p-4 transition ${
          onAir ? "bg-surface-2 shadow-[inset_0_0_0_2px_var(--accent-fill)]" : hearing ? "bg-surface-2/60" : "bg-surface-2 hover:bg-surface-3"
        }`}
      >
        <div className="flex items-start gap-3">
          <button onClick={show} className="min-w-0 flex-1 text-left">
            <h3 className="flex items-center gap-2 text-lg leading-tight font-bold">
              {formatRef(refx)}
              {onAir && <Chip tone="ok">On screen</Chip>}
            </h3>
            {text && <p className="mt-1 line-clamp-2 font-serif text-[15px] leading-snug text-muted">{text}</p>}
            {refx.verseStart === undefined && <p className="mt-1 text-xs text-faint">Chapter only. Shows verse 1; step on with Next.</p>}
          </button>
          {onDismiss && (
            <IconButton label="Dismiss" onClick={() => onDismiss(s.key)} className="-mt-1 -mr-1 h-8 w-8">
              <X size={16} />
            </IconButton>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          {hearing ? (
            <PixelLoader label="Hearing" />
          ) : (
            <>
              <SignalBars level={conf.level} label={conf.label} />
              {s.kind === "followup" && <Chip>Follow-up</Chip>}
              {s.kind === "quote" && <Chip>From its words</Chip>}
            </>
          )}
          <Button size="sm" onClick={show} className="ml-auto">
            Show {hotkey && <span className="rounded-full bg-black/15 px-1.5 text-[10px]">{hotkey}</span>}
          </Button>
        </div>
      </article>
    );
  },
  // A live card's object is rebuilt on every partial; compare what it shows.
  (a, b) =>
    a.s.key === b.s.key &&
    a.s.confidence === b.s.confidence &&
    a.s.kind === b.s.kind &&
    a.hearing === b.hearing &&
    a.hotkey === b.hotkey &&
    a.onAir === b.onAir &&
    a.bible === b.bible &&
    a.onShow === b.onShow &&
    a.onDismiss === b.onDismiss,
);

// The chapter being browsed, verse by verse. Click a verse (or type its number
// anywhere) to select it. Only verses on the current slide are highlighted.
const ChapterList = memo(function ChapterList({
  bible,
  book,
  chapter,
  selected,
  onPick,
  onMove,
  typed,
  note,
}: {
  bible: Translation;
  book: number;
  chapter: number;
  selected: Slide | null;
  onPick: (book: number, chapter: number, verse: number) => void;
  onMove: (dir: 1 | -1) => void;
  /** Digits typed so far for a verse jump. */
  typed: string;
  /** Where the last jump landed, shown briefly. */
  note: { text: string; ok: boolean } | null;
}) {
  const verses = bible.books[book]?.[chapter - 1] ?? [];
  const on = new Set(selected?.lines.map((l) => l.verse) ?? []);
  const first = selected?.lines[0]?.verse;
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (first) list.current?.querySelector<HTMLElement>(`[data-verse="${first}"]`)?.scrollIntoView({ block: "nearest" });
  }, [first, book, chapter]);

  return (
    <div className="flex min-h-[200px] flex-1 flex-col overflow-hidden rounded-lg bg-surface-2 lg:min-h-0">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line pr-1.5 pl-4">
        <span className="font-bold">{formatRef({ book, chapter })}</span>
        {/* What's typed shows here as it's typed, then where it landed. */}
        {typed ? (
          <span className="inline-flex h-6 items-center rounded-full bg-accent-fill px-2.5 text-xs font-bold text-on-accent tabular-nums">
            Verse {typed}
            <span className="ml-0.5 inline-block h-3 w-[2px] animate-pulse bg-on-accent" />
          </span>
        ) : note ? (
          <span
            className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-bold ${note.ok ? "bg-accent-fill/15 text-accent" : "bg-negative/15 text-negative"}`}
          >
            {note.ok ? "→ " : ""}
            {note.text}
          </span>
        ) : (
          <span className="hidden text-xs text-faint sm:inline">Type a verse number to jump</span>
        )}
        <IconButton label="Previous chapter" onClick={() => onMove(-1)} className="ml-auto h-8 w-8">
          <ChevronLeft size={17} />
        </IconButton>
        <IconButton label="Next chapter" onClick={() => onMove(1)} className="h-8 w-8">
          <ChevronRight size={17} />
        </IconButton>
      </div>
      <ol ref={list} className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {verses.map((text, i) => {
          const v = i + 1;
          const active = on.has(v);
          return (
            <li key={v}>
              <button
                type="button"
                data-verse={v}
                onClick={() => onPick(book, chapter, v)}
                className={`flex w-full gap-3 rounded-md px-2.5 py-1.5 text-left text-sm leading-snug transition ${
                  active ? "bg-accent-fill/15 text-ink shadow-[inset_0_0_0_1px_var(--accent-fill)]" : "text-muted hover:bg-ink/5 hover:text-ink"
                }`}
              >
                <span className={`w-6 shrink-0 text-right text-xs font-bold tabular-nums ${active ? "text-accent" : "text-faint"}`}>{v}</span>
                {text ? <span className="font-serif">{text}</span> : <span className="text-faint italic">Not included in this translation</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
});

// Heard, but not in the Bible: says why nothing showed, so the operator
// knows the preacher misspoke rather than the app missing it.
function NotFoundCard({ n, onDismiss }: { n: NotFound; onDismiss: (key: string) => void }) {
  return (
    <article className="flex items-start gap-3 rounded-lg bg-warning/10 px-4 py-3">
      <CircleOff size={17} className="mt-0.5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <h3 className="font-bold leading-tight">{n.label}</h3>
        <p className="mt-0.5 text-sm text-muted">Not in the Bible. {n.note}</p>
      </div>
      <IconButton label="Dismiss" onClick={() => onDismiss(n.key)} className="-mt-1 -mr-1 h-8 w-8">
        <X size={16} />
      </IconButton>
    </article>
  );
}

function EmptyState({ phase }: { phase: string }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 text-center">
      {phase === "live" ? (
        <>
          <PixelLoader label="Listening" />
          <p className="mt-3 max-w-xs text-sm text-muted">References appear here the moment they are spoken.</p>
        </>
      ) : null}
    </div>
  );
}

function TranscriptStrip({
  segments,
  partial,
  phase,
}: {
  segments: { seq: number; text: string; detections: Detection[] }[];
  partial: { text: string; detections: Detection[] };
  phase: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [segments, partial]);

  return (
    <section className="shrink-0 rounded-lg bg-surface">
      <PanelTitle title="Live transcript" />
      <div ref={box} className="h-24 overflow-y-auto px-4 pb-3 text-[15px] leading-relaxed">
        {segments.length === 0 && !partial.text && (
          <p className="text-faint">{phase === "live" ? "Waiting for speech." : "The sermon transcript scrolls here during a service."}</p>
        )}
        {segments.map((s) => (
          <Highlighted key={s.seq} text={s.text} detections={s.detections} />
        ))}
        {partial.text && <Highlighted text={partial.text} detections={partial.detections} dim />}
      </div>
    </section>
  );
}

// Memoised so finished segments are not re-rendered for each partial.
const Highlighted = memo(function Highlighted({ text, detections, dim }: { text: string; detections: Detection[]; dim?: boolean }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  const spans = [...new Map(detections.map((d) => [`${d.start}-${d.end}`, d])).values()].sort((a, b) => a.start - b.start);
  for (const d of spans) {
    if (d.start < at) continue;
    parts.push(text.slice(at, d.start));
    parts.push(
      <mark key={d.start} className="rounded bg-accent-fill/20 px-0.5 font-semibold text-accent">
        {text.slice(d.start, d.end)}
      </mark>,
    );
    at = d.end;
  }
  parts.push(text.slice(at));
  return <span className={dim ? "text-muted" : ""}>{parts} </span>;
});
