"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listInputs, startCapture, unlockInputLabels, type AudioInput, type Capture } from "@/lib/live/audio";
import { outbox } from "@/lib/live/outbox";
import { Transcriber, type SessionRequest, type TranscriberStatus } from "@/lib/live/transcriber";
import { loadTranslation, shapeOf, type Translation } from "@/lib/scripture/bible";
import { detectWithCarry, formatRef, refKey, unfinishedTail, type Detection, type Missing, type ParseContext, type VerseRef } from "@/lib/scripture/parser";
import { VerseTextIndex, type VerseHit } from "@/lib/scripture/verse-text";
import { BUILT_IN_TRANSLATIONS, findTranslation } from "@/lib/scripture/translations";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLeaveWarning } from "@/lib/use-leave-warning";

export interface Segment {
  seq: number;
  text: string;
  detections: Detection[];
}

export interface Suggestion {
  key: string;
  ref: VerseRef;
  confidence: number;
  kind: Detection["kind"];
  /** When it was last heard. */
  at: number;
  /** Where it was spoken, for marking the saved transcript. */
  seq?: number;
  start?: number;
  end?: number;
}

/** A reference heard that isn't in the Bible: why nothing showed. */
export interface NotFound {
  key: string;
  /** "2 Peter 4:7" */
  label: string;
  /** "2 Peter has 3 chapters." */
  note: string;
}

export type Phase = "idle" | "starting" | "live" | "ending";

const MAX_SUGGESTIONS = 40;
const MAX_NOT_FOUND = 3;
const MAX_SEGMENTS_SHOWN = 60;
const SILENT_RMS = 0.003;
const WARN_AFTER_MS = 10_000;
/** Starting again within this long of the last service ending (same day) carries it on. */
const RESUME_WITHIN_MS = 60 * 60_000;
const DEVICE_KEY = "scripture.inputDevice";

// One console listens at a time. Scriptures and Song Lyrics stay mounted side
// by side (../workspace.tsx), and listening stays with the one that started
// it while you move between tabs (detection carries on while lyrics are
// prepared). Pressing Start in the other one takes it over: the first stops
// its microphone and transcriber and leaves the service open here, and the
// second carries it on: same service, same transcript, no gap in History.
interface Handoff {
  serviceId: string;
  startedAt: number;
  seq: number;
  audioSeconds: number;
  timer: ReturnType<typeof setTimeout>;
}
let handoff: Handoff | null = null;
/** The console listening now, so Start elsewhere can take over from it. */
let listening: { suspend: () => void } | null = null;

/** Whether a console in this tab is listening to a service now (the update notice waits for it to end). */
export const isListening = () => listening !== null;

function closeHandoff(reason: "silence" | "abandoned") {
  if (!handoff) return;
  clearTimeout(handoff.timer);
  outbox(supabaseBrowser()).updateService(handoff.serviceId, {
    ended_at: new Date().toISOString(),
    end_reason: reason,
    audio_seconds: Math.round(handoff.audioSeconds),
  });
  handoff = null;
}

/**
 * Called with every detection as soon as it is heard, partial or final.
 * `lagMs` is how long after being spoken the words reached the browser.
 */
export type HeardHandler = (detections: Detection[], text: string, final: boolean, lagMs: number) => void;

/** Spoken operator commands: "next verse", "previous verse". */
export type VoiceCommand = "next" | "prev";

const COMMAND_RE = /\b(next|previous|prev)\s+verse\b/gi;
const commandsIn = (text: string): VoiceCommand[] =>
  [...text.matchAll(COMMAND_RE)].map((m) => (m[1].toLowerCase() === "next" ? "next" : "prev"));

interface Options {
  churchId: string;
  userId: string;
  bible: Translation | null;
  silenceEndMinutes: number;
  onHeard?: HeardHandler;
  /** Called once per spoken "next verse" / "previous verse", as soon as it's heard. */
  onCommand?: (cmd: VoiceCommand) => void;
  /** Every transcript update, references or not: worship mode follows the singing with it. */
  onText?: (text: string, final: boolean, lagMs: number) => void;
  /** Hints for the transcriber, read when listening starts. */
  session?: () => SessionRequest;
  /** The verse on screen now, so a reading aloud is followed from it. */
  currentVerse?: () => { book: number; chapter: number; verse: number } | null;
}

export function useLiveService({ churchId, userId, bible, silenceEndMinutes, onHeard, onCommand, onText, session, currentVerse }: Options) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<TranscriberStatus>("closed");
  const [error, setError] = useState("");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [partial, setPartial] = useState<{ text: string; detections: Detection[] }>({ text: "", detections: [] });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [notFound, setNotFound] = useState<NotFound[]>([]);
  const [silent, setSilent] = useState(false);
  const [clipping, setClipping] = useState(false);
  const [offline, setOffline] = useState(false);
  const [inputs, setInputs] = useState<AudioInput[]>([]);
  const [deviceId, setDeviceIdState] = useState<string>("");

  // Input level, written at ~10 Hz by the audio thread. Kept out of React
  // state on purpose: the meter reads it each animation frame, so the rest
  // of the console does not re-render with every audio chunk.
  const levelRef = useRef({ rms: 0, peak: 0 });
  // Live objects and values read inside callbacks.
  const bibleRef = useRef(bible);
  const ctxRef = useRef<ParseContext>({});
  // The end of the last stretch when it stopped mid-reference ("…Psalm
  // ninety"), read again with the next one ("one…") so it comes out whole.
  const carryRef = useRef<string | null>(null);
  // Verses recognised from their words (lib/scripture/verse-text): the
  // translation on screen, and the KJV too, the one most quoted from memory.
  const verseIndexes = useRef<VerseTextIndex[]>([]);
  const lastFinal = useRef("");
  const lastQuote = useRef({ key: "", at: 0 });
  const currentVerseRef = useRef(currentVerse);
  // Audio seconds from earlier parts of a reopened service.
  const audioBaseRef = useRef(0);
  const seqRef = useRef(0);
  const serviceRef = useRef<string | null>(null);
  const startRef = useRef(0);
  const transcriber = useRef<Transcriber | null>(null);
  const capture = useRef<Capture | null>(null);
  const lastSpeech = useRef(0);
  const segStart = useRef(0);
  const quietSince = useRef<number | null>(null);
  const clipSince = useRef<number | null>(null);
  const lastClip = useRef(0);
  const endRef = useRef<(reason: "operator" | "silence") => Promise<void>>(async () => {});
  // This console, as the other one sees it when taking over listening (see Handoff).
  const suspendFn = useRef<() => void>(() => {});
  const self = useRef({ suspend: () => suspendFn.current() });

  const onHeardRef = useRef(onHeard);
  const onCommandRef = useRef(onCommand);
  const onTextRef = useRef(onText);
  const sessionRef = useRef(session);
  useEffect(() => {
    bibleRef.current = bible;
    currentVerseRef.current = currentVerse;
    onHeardRef.current = onHeard;
    onCommandRef.current = onCommand;
    onTextRef.current = onText;
    sessionRef.current = session;
  }, [bible, onHeard, onCommand, onText, session, currentVerse]);

  // Index the translation's words for recognising verses from what's said,
  // and the KJV's when another translation is on screen. Built in the
  // background (about a second); recognition starts once they're ready.
  useEffect(() => {
    if (!bible) return;
    let live = true;
    const build = async () => {
      const own = await VerseTextIndex.build(bible);
      if (!live) return;
      verseIndexes.current = [own];
      if (bible.id === "kjv") return;
      const kjv = await loadTranslation(findTranslation(BUILT_IN_TRANSLATIONS, "kjv")).catch(() => null);
      if (!kjv || !live) return;
      const kjvIndex = await VerseTextIndex.build(kjv);
      if (live) verseIndexes.current = [own, kjvIndex];
    };
    void build();
    return () => {
      live = false;
    };
  }, [bible]);

  /**
   * A verse recognised from its words, when the text named no reference:
   * a reading aloud (followed from the verse on screen, or the chapter last
   * named) goes up by itself; a quotation from anywhere else is suggested.
   */
  const quoteDetection = useCallback((text: string): Detection | null => {
    if (!verseIndexes.current.length) return null;
    const ctx = ctxRef.current;
    const near = currentVerseRef.current?.() ?? (ctx.book !== undefined && ctx.chapter !== undefined ? { book: ctx.book, chapter: ctx.chapter } : null);
    const heard = `${lastFinal.current} ${text}`;
    let hit: VerseHit | null = null;
    for (const index of verseIndexes.current) {
      const h = index.match(heard, near);
      if (h?.confident && (!hit || h.score > hit.score)) hit = h;
    }
    if (!hit) return null;
    const key = `${hit.book}:${hit.chapter}:${hit.verse}`;
    const now = Date.now();
    if (lastQuote.current.key === key && now - lastQuote.current.at < 30_000) return null;
    lastQuote.current = { key, at: now };
    const inPassage = near !== null && near.book === hit.book && near.chapter === hit.chapter;
    return {
      ref: { book: hit.book, chapter: hit.chapter, verseStart: hit.verse },
      start: 0,
      end: text.length,
      // Following the passage in hand: safe to show. Anywhere else: a suggestion.
      confidence: inPassage ? 0.9 : 0.7,
      kind: "quote",
    };
  }, []);

  // Voice commands are acted on from the live (partial) text, the moment
  // they're heard. The partial grows and gets revised, so count how many
  // commands this stretch of speech has had and only act on new ones.
  const commandsFired = useRef(0);
  const fireCommands = (text: string) => {
    const cmds = commandsIn(text);
    for (let i = commandsFired.current; i < cmds.length; i++) onCommandRef.current?.(cmds[i]);
    commandsFired.current = Math.max(commandsFired.current, cmds.length);
  };

  // ---- Input devices -------------------------------------------------------

  const refreshInputs = useCallback(async () => {
    try {
      const list = await listInputs();
      setInputs(list);
      const saved = localStorage.getItem(DEVICE_KEY) ?? "";
      setDeviceIdState((cur) => {
        if (cur && list.some((d) => d.deviceId === cur)) return cur;
        if (saved && list.some((d) => d.deviceId === saved)) return saved;
        return list[0]?.deviceId ?? "";
      });
    } catch {
      setInputs([]);
    }
  }, []);

  useEffect(() => {
    void refreshInputs();
    navigator.mediaDevices?.addEventListener("devicechange", refreshInputs);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", refreshInputs);
  }, [refreshInputs]);

  // ---- Mic test ------------------------------------------------------------
  // Opens the chosen input for the level meter only (no transcription), so
  // the operator can check the desk feed before the service.
  const testCapture = useRef<Capture | null>(null);
  const [testing, setTesting] = useState(false);
  const stopTest = useCallback(() => {
    testCapture.current?.stop();
    testCapture.current = null;
    levelRef.current = { rms: 0, peak: 0 };
    setTesting(false);
  }, []);
  const toggleTest = useCallback(async () => {
    if (testCapture.current) {
      stopTest();
      return;
    }
    setError("");
    try {
      testCapture.current = await startCapture(deviceId || undefined, {
        onChunk: () => {},
        onLevel: (rms, peak) => {
          levelRef.current = { rms, peak };
        },
      });
      setTesting(true);
      // Permission is granted now, so the real device names can show.
      void refreshInputs();
    } catch {
      setError("The browser blocked the microphone. Allow it from the icon in the address bar, then try again.");
    }
  }, [deviceId, refreshInputs, stopTest]);

  const setDeviceId = (id: string) => {
    // A test runs on one input; switching inputs ends it.
    stopTest();
    setDeviceIdState(id);
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {}
  };

  const unlock = async () => {
    try {
      await unlockInputLabels();
      await refreshInputs();
    } catch {
      setError("The browser blocked the microphone. Allow it from the icon in the address bar, then try again.");
    }
  };

  // ---- Network -------------------------------------------------------------

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // ---- Suggestions ---------------------------------------------------------

  const addSuggestions = useCallback((dets: Detection[], seq: number) => {
    if (dets.length === 0) return;
    const now = Date.now();
    setSuggestions((prev) => {
      let next = prev;
      for (const d of dets) {
        const key = refKey(d.ref);
        const s: Suggestion = { key, ref: d.ref, confidence: d.confidence, kind: d.kind, at: now, seq, start: d.start, end: d.end };
        next = [s, ...next.filter((x) => x.key !== key)];
      }
      return next.slice(0, MAX_SUGGESTIONS);
    });
  }, []);

  const dismiss = useCallback((key: string) => setSuggestions((p) => p.filter((s) => s.key !== key)), []);

  // Newest first. One per book and chapter, so "2 Peter 4" said at a pause
  // becomes "2 Peter 4:7" once the verse arrives.
  const addNotFound = useCallback((list: Missing[]) => {
    if (list.length === 0) return;
    setNotFound((prev) => {
      let next = prev;
      for (const m of list) {
        const key = `${m.book}:${m.chapter}`;
        const label = formatRef({ book: m.book, chapter: m.chapter, verseStart: m.verse });
        next = [{ key, label, note: m.note }, ...next.filter((x) => x.key !== key)];
      }
      return next.slice(0, MAX_NOT_FOUND);
    });
  }, []);
  const dismissNotFound = useCallback((key: string) => setNotFound((p) => p.filter((n) => n.key !== key)), []);

  // ---- Saving the record -----------------------------------------------------
  // Transcript lines and the end of the service go through the outbox: stored
  // in this browser first, sent when the connection allows. See outbox.ts.

  const [unsaved, setUnsaved] = useState(0);
  useEffect(() => {
    const ob = outbox(supabaseBrowser());
    ob.onPending = setUnsaved;
    setUnsaved(ob.pending);
    return () => {
      ob.onPending = undefined;
    };
  }, []);

  // ---- Transcription events ------------------------------------------------

  const onPartial = useCallback((text: string, lagMs: number) => {
    const b = bibleRef.current;
    if (!text) {
      setPartial({ text: "", detections: [] });
      return;
    }
    if (segStart.current === 0) segStart.current = Date.now();
    lastSpeech.current = Date.now();
    fireCommands(text);
    onTextRef.current?.(text, false, lagMs);
    const dets = b ? detectWithCarry(text, shapeOf(b), ctxRef.current, carryRef.current).detections : [];
    // Auto mode acts before React renders anything.
    if (dets.length) onHeardRef.current?.(dets, text, false, lagMs);
    setPartial({ text, detections: dets });
  }, []);

  const onFinal = useCallback(
    (text: string, lagMs: number) => {
      const b = bibleRef.current;
      const seq = ++seqRef.current;
      const now = Date.now();
      lastSpeech.current = now;
      fireCommands(text);
      onTextRef.current?.(text, true, lagMs);
      // The next stretch of speech starts counting from zero.
      commandsFired.current = 0;
      const res = b ? detectWithCarry(text, shapeOf(b), ctxRef.current, carryRef.current) : { detections: [], context: ctxRef.current, missing: [] };
      // No reference named: maybe scripture read or quoted from memory.
      if (b && !res.detections.length) {
        const quote = quoteDetection(text);
        if (quote) res.detections = [quote];
      }
      ctxRef.current = res.context;
      // Chained, so a reference cut twice ("second" | "Peter chapter four verse" | "seven") keeps its start.
      carryRef.current = unfinishedTail(carryRef.current ? `${carryRef.current} ${text}` : text);
      lastFinal.current = text;
      if (res.detections.length) onHeardRef.current?.(res.detections, text, true, lagMs);
      setSegments((p) => [...p.slice(-MAX_SEGMENTS_SHOWN + 1), { seq, text, detections: res.detections }]);
      addSuggestions(res.detections, seq);
      addNotFound(res.missing);
      const begin = segStart.current || now;
      const service = serviceRef.current;
      if (service) {
        outbox(supabaseBrowser()).add("transcript_segments", {
          service_id: service,
          church_id: churchId,
          seq,
          start_ms: begin - startRef.current,
          end_ms: now - startRef.current,
          text,
        });
      }
      segStart.current = 0;
    },
    [addSuggestions, addNotFound, churchId, quoteDetection],
  );

  // ---- Start and end -------------------------------------------------------

  const start = useCallback(async () => {
    if (phase !== "idle") return;
    stopTest();
    setError("");
    setPhase("starting");
    const supabase = supabaseBrowser();

    // Stopping and starting again during the same service (a restart, a
    // switch between Scriptures and Song Lyrics) carries on the same History
    // entry: the church's last service is reopened if it ended within the
    // hour, today. Otherwise a new one starts.
    let svc: { id: string; started_at: string } | null = null;
    let resumed = false;
    let resumedSeq = 0;
    let resumedAudio = 0;
    // Listening in the other console: take it over, same service.
    if (listening && listening !== self.current) listening.suspend();
    const taken = handoff;
    if (taken) {
      clearTimeout(taken.timer);
      handoff = null;
      svc = { id: taken.serviceId, started_at: new Date(taken.startedAt).toISOString() };
      resumed = true;
      resumedSeq = taken.seq;
      resumedAudio = taken.audioSeconds;
    }
    const { data: last } = svc ? { data: null } : await supabase
      .from("services")
      .select("id, started_at, ended_at, audio_seconds")
      .eq("church_id", churchId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const endedAt = last?.ended_at ? new Date(last.ended_at) : null;
    if (last && endedAt && Date.now() - endedAt.getTime() < RESUME_WITHIN_MS && endedAt.toDateString() === new Date().toDateString()) {
      const [{ error: reopenErr }, { data: lastSeg }] = await Promise.all([
        supabase.from("services").update({ ended_at: null, end_reason: null }).eq("id", last.id),
        supabase.from("transcript_segments").select("seq").eq("service_id", last.id).order("seq", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!reopenErr) {
        svc = last;
        resumed = true;
        resumedSeq = lastSeg?.seq ?? 0;
        resumedAudio = last.audio_seconds ?? 0;
      }
    }
    if (!svc) {
      const { data, error: svcErr } = await supabase.from("services").insert({ church_id: churchId, started_by: userId }).select("id, started_at").single();
      if (svcErr || !data) {
        setError(svcErr?.message ?? "Could not start the service.");
        setPhase("idle");
        return;
      }
      svc = data;
    }

    serviceRef.current = svc.id;
    // Times in the transcript count from the service's first start.
    startRef.current = resumed ? new Date(svc.started_at).getTime() : Date.now();
    seqRef.current = resumedSeq;
    audioBaseRef.current = resumedAudio;
    ctxRef.current = {};
    carryRef.current = null;
    lastFinal.current = "";
    lastSpeech.current = Date.now();
    setServiceId(svc.id);
    setStartedAt(startRef.current);
    setSegments([]);
    setSuggestions([]);
    setNotFound([]);
    setPartial({ text: "", detections: [] });

    const t = new Transcriber({ onPartial, onFinal, onStatus: (s) => setStatus(s) }, sessionRef.current?.() ?? {});
    transcriber.current = t;
    try {
      await t.start();
      capture.current = await startCapture(deviceId || undefined, {
        onChunk: (pcm) => t.send(pcm),
        onLevel: (rms, peak) => {
          levelRef.current = { rms, peak };
          const now = Date.now();
          if (rms < SILENT_RMS) quietSince.current ??= now;
          else quietSince.current = null;
          setSilent(quietSince.current !== null && now - quietSince.current > WARN_AFTER_MS);
          if (peak >= 0.98) {
            clipSince.current ??= now;
            lastClip.current = now;
          } else if (now - lastClip.current > 1500) {
            clipSince.current = null;
          }
          setClipping(clipSince.current !== null && now - clipSince.current > WARN_AFTER_MS);
        },
      });
      setPhase("live");
    } catch (e) {
      t.stop();
      capture.current?.stop();
      capture.current = null;
      await supabase.from("services").update({ ended_at: new Date().toISOString(), end_reason: "abandoned" }).eq("id", svc.id);
      serviceRef.current = null;
      setServiceId(null);
      setStartedAt(null);
      setError((e as Error).message || "Could not start listening.");
      setPhase("idle");
    }
  }, [phase, churchId, userId, deviceId, onPartial, onFinal, stopTest]);

  const end = useCallback(
    async (reason: "operator" | "silence") => {
      const service = serviceRef.current;
      if (!service) return;
      setPhase("ending");
      capture.current?.stop();
      capture.current = null;
      transcriber.current?.stop();
      // Give the transcriber a moment to send its last words.
      await new Promise((r) => setTimeout(r, 1200));
      // Queued, so ending during an outage still closes the service later.
      outbox(supabaseBrowser()).updateService(service, {
        ended_at: new Date().toISOString(),
        end_reason: reason,
        audio_seconds: Math.round(audioBaseRef.current + (transcriber.current?.audioSeconds ?? 0)),
      });
      transcriber.current = null;
      serviceRef.current = null;
      setServiceId(null);
      setStartedAt(null);
      levelRef.current = { rms: 0, peak: 0 };
      setSilent(false);
      setClipping(false);
      setPartial({ text: "", detections: [] });
      setPhase("idle");
    },
    [],
  );

  useEffect(() => {
    endRef.current = end;
  }, [end]);

  // Hidden mid-service: stop listening here and leave the service for the
  // console that's now on screen (see Handoff).
  const suspend = useCallback(() => {
    const service = serviceRef.current;
    if (!service) return;
    capture.current?.stop();
    capture.current = null;
    const t = transcriber.current;
    t?.stop();
    transcriber.current = null;
    closeHandoff("abandoned");
    handoff = {
      serviceId: service,
      startedAt: startRef.current,
      seq: seqRef.current,
      audioSeconds: audioBaseRef.current + (t?.audioSeconds ?? 0),
      timer: setTimeout(() => closeHandoff("silence"), silenceEndMinutes * 60_000),
    };
    serviceRef.current = null;
    setServiceId(null);
    setStartedAt(null);
    levelRef.current = { rms: 0, peak: 0 };
    setSilent(false);
    setClipping(false);
    setPartial({ text: "", detections: [] });
    setPhase("idle");
  }, [silenceEndMinutes]);

  useEffect(() => {
    suspendFn.current = suspend;
  });
  // Registered while listening, for the other console's Start.
  useEffect(() => {
    if (phase !== "live") return;
    const me = self.current;
    listening = me;
    return () => {
      if (listening === me) listening = null;
    };
  }, [phase]);

  // ---- While live: save, track usage, end after long silence ---------------

  useEffect(() => {
    if (phase !== "live") return;
    const usage = setInterval(() => {
      const service = serviceRef.current;
      if (!service || !transcriber.current) return;
      // .then() sends it: a Supabase query does nothing until it's awaited.
      void supabaseBrowser()
        .from("services")
        .update({ audio_seconds: Math.round(audioBaseRef.current + transcriber.current.audioSeconds) })
        .eq("id", service)
        .then(() => {});
    }, 30_000);
    const silence = setInterval(() => {
      if (Date.now() - lastSpeech.current > silenceEndMinutes * 60_000) void endRef.current("silence");
    }, 30_000);
    return () => {
      clearInterval(usage);
      clearInterval(silence);
    };
  }, [phase, silenceEndMinutes]);

  // Ask before a refresh or close while a service is starting, live or ending.
  useLeaveWarning(phase !== "idle");

  // Stop everything if the console unmounts mid-service (switching between
  // Scriptures and Song Lyrics, say), and close the service: otherwise it
  // stays "Live now" until the History page tidies it up.
  useEffect(
    () => () => {
      closeHandoff("abandoned");
      capture.current?.stop();
      testCapture.current?.stop();
      transcriber.current?.stop();
      const service = serviceRef.current;
      if (service) {
        outbox(supabaseBrowser()).updateService(service, {
          ended_at: new Date().toISOString(),
          end_reason: "abandoned",
          audio_seconds: Math.round(audioBaseRef.current + (transcriber.current?.audioSeconds ?? 0)),
        });
        serviceRef.current = null;
      }
    },
    [],
  );

  return {
    phase,
    status,
    error,
    setError,
    serviceId,
    startedAt,
    segments,
    partial,
    suggestions,
    dismiss,
    notFound,
    dismissNotFound,
    levelRef,
    warnings: { silent, clipping, offline },
    /** Records stored in this browser, waiting for the connection. */
    unsaved,
    inputs,
    deviceId,
    setDeviceId,
    unlock,
    testing,
    toggleTest,
    start,
    end,
    ctxRef,
  };
}
