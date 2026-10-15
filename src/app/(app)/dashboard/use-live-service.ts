"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listInputs, startCapture, unlockInputLabels, type AudioInput, type Capture } from "@/lib/live/audio";
import { outbox } from "@/lib/live/outbox";
import { Transcriber, type SessionRequest, type TranscriberStatus } from "@/lib/live/transcriber";
import { shapeOf, type Translation } from "@/lib/scripture/bible";
import { detect, refKey, type Detection, type ParseContext, type VerseRef } from "@/lib/scripture/parser";
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

export type Phase = "idle" | "starting" | "live" | "ending";

const MAX_SUGGESTIONS = 40;
const MAX_SEGMENTS_SHOWN = 60;
const SILENT_RMS = 0.003;
const WARN_AFTER_MS = 10_000;
const DEVICE_KEY = "scripture.inputDevice";

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
}

export function useLiveService({ churchId, userId, bible, silenceEndMinutes, onHeard, onCommand, onText, session }: Options) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<TranscriberStatus>("closed");
  const [error, setError] = useState("");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [partial, setPartial] = useState<{ text: string; detections: Detection[] }>({ text: "", detections: [] });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
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

  const onHeardRef = useRef(onHeard);
  const onCommandRef = useRef(onCommand);
  const onTextRef = useRef(onText);
  const sessionRef = useRef(session);
  useEffect(() => {
    bibleRef.current = bible;
    onHeardRef.current = onHeard;
    onCommandRef.current = onCommand;
    onTextRef.current = onText;
    sessionRef.current = session;
  }, [bible, onHeard, onCommand, onText, session]);

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
    const dets = b ? detect(text, shapeOf(b), ctxRef.current).detections : [];
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
      const res = b ? detect(text, shapeOf(b), ctxRef.current) : { detections: [], context: ctxRef.current };
      ctxRef.current = res.context;
      if (res.detections.length) onHeardRef.current?.(res.detections, text, true, lagMs);
      setSegments((p) => [...p.slice(-MAX_SEGMENTS_SHOWN + 1), { seq, text, detections: res.detections }]);
      addSuggestions(res.detections, seq);
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
    [addSuggestions, churchId],
  );

  // ---- Start and end -------------------------------------------------------

  const start = useCallback(async () => {
    if (phase !== "idle") return;
    stopTest();
    setError("");
    setPhase("starting");
    const supabase = supabaseBrowser();

    const { data: svc, error: svcErr } = await supabase
      .from("services")
      .insert({ church_id: churchId, started_by: userId })
      .select("id, started_at")
      .single();
    if (svcErr || !svc) {
      setError(svcErr?.message ?? "Could not start the service.");
      setPhase("idle");
      return;
    }

    serviceRef.current = svc.id;
    startRef.current = Date.now();
    seqRef.current = 0;
    ctxRef.current = {};
    lastSpeech.current = Date.now();
    setServiceId(svc.id);
    setStartedAt(startRef.current);
    setSegments([]);
    setSuggestions([]);
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
        audio_seconds: Math.round(transcriber.current?.audioSeconds ?? 0),
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

  // ---- While live: save, track usage, end after long silence ---------------

  useEffect(() => {
    if (phase !== "live") return;
    const usage = setInterval(() => {
      const service = serviceRef.current;
      if (!service || !transcriber.current) return;
      void supabaseBrowser()
        .from("services")
        .update({ audio_seconds: Math.round(transcriber.current.audioSeconds) })
        .eq("id", service);
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

  // Stop everything if the console unmounts mid-service.
  useEffect(
    () => () => {
      capture.current?.stop();
      testCapture.current?.stop();
      transcriber.current?.stop();
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
