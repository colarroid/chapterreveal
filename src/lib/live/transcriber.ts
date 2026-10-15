"use client";

// A live transcription socket that survives network blips. On an unexpected
// close it asks the backend for a new token and reconnects, so a dropped
// connection costs a few seconds of transcript, not the service.

export type TranscriberStatus = "connecting" | "live" | "reconnecting" | "closed";

export interface TranscriberEvents {
  /**
   * Words heard so far in the current, unfinished stretch of speech.
   * `lagMs` is how far the text trails the audio we have sent: the time from
   * a word being spoken to it reaching us.
   */
  onPartial(text: string, lagMs: number): void;
  /** A stretch of speech the transcriber will not revise again. */
  onFinal(text: string, lagMs: number): void;
  onStatus(status: TranscriberStatus, detail?: string): void;
}

interface SessionInfo {
  url: string;
  protocols: string[];
  sampleRate: number;
}

/** What the session is for: sermons get Bible book names as hints, worship gets the setlist's words. */
export interface SessionRequest {
  mode?: "sermon" | "worship";
  /** Words and short phrases the transcriber should expect. */
  keyterms?: string[];
}

async function fetchSession(request: SessionRequest): Promise<SessionInfo> {
  const res = await fetch("/api/transcription/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Transcription session failed (${res.status})`);
  return body as SessionInfo;
}

interface DeepgramResult {
  type: string;
  is_final?: boolean;
  /** Seconds into this connection's audio where the result starts, and its length. */
  start?: number;
  duration?: number;
  channel?: { alternatives: { transcript: string }[] };
}

export class Transcriber {
  private ws: WebSocket | null = null;
  private closing = false;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private lastSend = 0;
  /** Bytes of audio sent, for usage tracking. */
  bytesSent = 0;
  /** Bytes sent on the current connection; Deepgram's timestamps restart with each one. */
  private connBytes = 0;
  sampleRate = 16000;

  constructor(
    private ev: TranscriberEvents,
    private request: SessionRequest = {},
  ) {}

  async start(): Promise<void> {
    this.closing = false;
    this.ev.onStatus("connecting");
    await this.connect();
  }

  private async connect(): Promise<void> {
    let info: SessionInfo;
    try {
      info = await fetchSession(this.request);
    } catch (e) {
      if (this.attempt === 0 && !this.ws) {
        this.ev.onStatus("closed", (e as Error).message);
        throw e;
      }
      this.scheduleRetry();
      return;
    }
    if (this.closing) return;
    this.sampleRate = info.sampleRate;

    const ws = new WebSocket(info.url, info.protocols);
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.connBytes = 0;
      // Deepgram closes a socket that hears nothing for about 10 s. When no
      // audio is flowing (waiting for a click, a dropped desk feed), keep it
      // open so speech is picked up the moment audio returns.
      if (this.keepAlive) clearInterval(this.keepAlive);
      this.keepAlive = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN && Date.now() - this.lastSend > 4000) ws.send(JSON.stringify({ type: "KeepAlive" }));
      }, 4000);
      this.ev.onStatus("live");
    };
    ws.onmessage = (m) => {
      if (typeof m.data !== "string") return;
      let msg: DeepgramResult;
      try {
        msg = JSON.parse(m.data);
      } catch {
        return;
      }
      if (msg.type !== "Results") return;
      const text = msg.channel?.alternatives?.[0]?.transcript ?? "";
      const heardTo = (msg.start ?? 0) + (msg.duration ?? 0);
      const lagMs = Math.max(0, Math.round((this.connBytes / 2 / this.sampleRate - heardTo) * 1000));
      if (msg.is_final) {
        this.ev.onPartial("", lagMs);
        if (text.trim()) this.ev.onFinal(text.trim(), lagMs);
      } else {
        this.ev.onPartial(text, lagMs);
      }
    };
    ws.onclose = (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.closing) {
        this.ev.onStatus("closed");
        return;
      }
      console.warn("Transcription socket closed", e.code, e.reason);
      this.scheduleRetry();
    };
    ws.onerror = () => {
      // onclose follows and handles the retry.
    };
  }

  private scheduleRetry() {
    if (this.closing) return;
    this.ev.onStatus("reconnecting");
    const delay = Math.min(500 * 2 ** this.attempt, 5000);
    this.attempt += 1;
    this.retryTimer = setTimeout(() => void this.connect(), delay);
  }

  send(pcm: ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(pcm);
      this.lastSend = Date.now();
      this.bytesSent += pcm.byteLength;
      this.connBytes += pcm.byteLength;
    }
  }

  /** Seconds of audio sent so far (16-bit mono). */
  get audioSeconds(): number {
    return this.bytesSent / 2 / this.sampleRate;
  }

  stop() {
    this.closing = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.keepAlive) clearInterval(this.keepAlive);
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      // Ask for the last words, then close.
      ws.send(JSON.stringify({ type: "CloseStream" }));
      setTimeout(() => ws.close(), 1500);
    } else {
      ws?.close();
      this.ev.onStatus("closed");
    }
  }
}
