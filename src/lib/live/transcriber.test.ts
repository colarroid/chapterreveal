import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BACKLOG_MAX_BYTES, Transcriber } from "./transcriber";

// A socket under the test's control: it opens, closes and receives when told.
class FakeSocket {
  static instances: FakeSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  binaryType = "";
  sent: (ArrayBuffer | string)[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: ArrayBuffer | string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: "" });
  }
  /** The audio it was sent, in bytes. */
  get audioBytes() {
    return this.sent.filter((d): d is ArrayBuffer => typeof d !== "string").reduce((n, b) => n + b.byteLength, 0);
  }
}

const chunk = (bytes: number) => new ArrayBuffer(bytes);
const events = () => ({ onPartial: vi.fn(), onFinal: vi.fn(), onStatus: vi.fn() });

describe("transcriber audio backlog", () => {
  beforeEach(() => {
    FakeSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ url: "wss://x", protocols: [], sampleRate: 16000 }) })));
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("holds audio until the socket opens, then sends it first", async () => {
    const t = new Transcriber(events());
    await t.start();
    const ws = FakeSocket.instances[0];
    t.send(chunk(100));
    t.send(chunk(200));
    expect(ws.audioBytes).toBe(0);
    expect(t.backlogSeconds).toBeCloseTo(300 / 32000);
    ws.open();
    expect(ws.audioBytes).toBe(300);
    expect(t.backlogSeconds).toBe(0);
    t.send(chunk(50));
    expect(ws.audioBytes).toBe(350);
    expect(t.audioSeconds).toBeCloseTo(350 / 32000);
  });

  it("keeps what was said during a reconnect and replays it on the new socket", async () => {
    const t = new Transcriber(events());
    await t.start();
    const first = FakeSocket.instances[0];
    first.open();
    t.send(chunk(100));
    first.drop();
    t.send(chunk(300));
    // The retry fires after 500 ms, then asks for a new token (a mocked fetch).
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(0);
    const second = FakeSocket.instances[1];
    expect(second).toBeDefined();
    expect(second.audioBytes).toBe(0);
    second.open();
    expect(second.audioBytes).toBe(300);
    expect(t.audioSeconds).toBeCloseTo(400 / 32000);
  });

  it("drops the oldest audio past the limit", async () => {
    const t = new Transcriber(events());
    await t.start();
    const ws = FakeSocket.instances[0];
    for (let i = 0; i < 40; i++) t.send(chunk(32000)); // 40 s
    expect(t.backlogSeconds).toBe(30);
    ws.open();
    expect(ws.audioBytes).toBe(BACKLOG_MAX_BYTES);
  });

  it("throws away the backlog on stop", async () => {
    const t = new Transcriber(events());
    await t.start();
    t.send(chunk(100));
    t.stop();
    expect(t.backlogSeconds).toBe(0);
    t.send(chunk(100));
    expect(t.backlogSeconds).toBe(0);
  });
});
