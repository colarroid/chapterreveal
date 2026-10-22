"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { DisplayTheme, DisplaySettings } from "@/lib/display/theme";
import type { Slide } from "@/lib/scripture/bible";

// The output page and the console share one realtime channel per church,
// named by the secret token in the output URL. The console broadcasts each
// change straight down the socket (the fast path) and also saves it to the
// screens table, so a projector that reloads mid-service picks up whatever
// is showing now.

export interface ScreenPayload {
  /** Changes on every update; the output page ignores repeats. */
  id: string;
  /** Milliseconds since epoch, so the newest update wins. */
  at: number;
  slide: Slide | null;
  /** The browser tab that sent it (see DEVICE). Missing from older consoles. */
  from?: string;
}

/**
 * This page load. The consoles in one tab share it; another tab or another
 * laptop has its own, so a console can tell when someone else took the screen.
 */
const DEVICE = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random());

/** SCREEN_TAKEN's detail when another computer (or tab) took the screen. */
export const TAKEN_ELSEWHERE = "elsewhere";

/** Something left up longer ago than this is from a service long over: no need to ask. */
const STALE_MS = 2 * 60 * 60_000;

export const screenTopic = (token: string) => `screen:${token}`;
/** Same-browser channel: a projector tab in the operator's Chrome gets updates in ~1 ms. */
export const localScreenChannel = (token: string) => `scripture-screen:${token}`;
export const SCREEN_EVENT = "show";

/** Tells open consoles in this browser that the output link was replaced. */
export const CONSOLE_CHANNEL = "scripture-console";
export type ConsoleMessage = { type: "screen-token"; token: string } | { type: "display"; display: DisplaySettings };

/** Fired on window when a console puts something on the screen; detail is its ScreenSender. */
export const SCREEN_TAKEN = "reedark:screen-taken";

export class ScreenSender {
  private channel: RealtimeChannel;
  private local: BroadcastChannel | null;
  /** What is on screen now, for catching other screens up after an outage. */
  private last: ScreenPayload | null = null;
  /** The newest update seen from anyone, this console included. */
  private seen: ScreenPayload | null = null;
  /** Update ids seen, with the order they arrived in. */
  private order = new Map<string, number>();
  private count = 0;
  private lastSaved = true;
  private connected = false;
  private onOnline = () => void this.catchUp();
  /** The look every slide is sent with, unless the slide brings its own. */
  theme: DisplayTheme | null = null;

  constructor(
    private supabase: SupabaseClient,
    private churchId: string,
    private token: string,
  ) {
    // Private: only signed-in members of the church may send to its screen
    // (migration 0019), so the connection carries the operator's sign-in.
    this.channel = supabase
      .channel(screenTopic(token), { config: { private: true, broadcast: { ack: false, self: false } } })
      // What other laptops put up, so this one knows when the screen was taken.
      .on("broadcast", { event: SCREEN_EVENT }, ({ payload }) => this.observe(payload as ScreenPayload, true));
    // When the socket comes back after a drop, vMix and other PCs missed
    // whatever went up meanwhile: send the current slide again.
    void supabase.realtime
      .setAuth()
      .catch(() => {})
      .then(() =>
        this.channel.subscribe((status) => {
          const up = status === "SUBSCRIBED";
          if (up && !this.connected) void this.catchUp();
          this.connected = up;
        }),
      );
    this.local = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(localScreenChannel(token));
    if (this.local) this.local.onmessage = (e: MessageEvent<ScreenPayload>) => this.observe(e.data, true);
    window.addEventListener("online", this.onOnline);
    // What is up right now, from whichever computer put it there.
    void this.current().then((p) => this.observe(p, false));
  }

  private async current(): Promise<ScreenPayload | null> {
    const { data } = await this.supabase.rpc("screen_state", { p_token: this.token });
    return (data as { payload: ScreenPayload | null } | null)?.payload ?? null;
  }

  /** Notes an update; `announce`: tell this tab when another computer took the screen. */
  private observe(p: ScreenPayload | null, announce: boolean) {
    // Order of arrival, not timestamps: each laptop stamps updates with its
    // own clock, and two laptops' clocks can be seconds apart.
    if (!p || this.order.has(p.id)) return;
    this.note(p.id);
    this.seen = p;
    // Anything another computer sends, blanking included, means it has the
    // screen now: this one's Live goes off so the two never fight.
    if (announce && p.from !== DEVICE && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SCREEN_TAKEN, { detail: TAKEN_ELSEWHERE }));
    }
  }

  /** Remembers that an update was seen, and in what order (the latest 200). */
  private note(id: string) {
    this.order.set(id, ++this.count);
    if (this.order.size > 200) this.order.delete(this.order.keys().next().value!);
  }

  /**
   * What another computer has on the screen now, if anything: words or a
   * picture, put up recently. Nothing when the screen is blank or cleared,
   * or when this tab put it there.
   */
  otherOnScreen(): Slide | null {
    const p = this.seen;
    if (!p?.slide || p.from === DEVICE || Date.now() - p.at > STALE_MS) return null;
    return p.slide.lines?.length || p.slide.image ? p.slide : null;
  }

  private async catchUp() {
    const p = this.last;
    if (!p) return;
    // Another laptop may have taken the screen while this one was cut off:
    // then what this one had is old news, and must not knock theirs off.
    // Newer means: never seen here, or seen after this one's was sent.
    const now = await this.current().catch(() => null);
    const mine = this.order.get(p.id) ?? 0;
    if (now && now.id !== p.id && (this.order.get(now.id) ?? Infinity) > mine) {
      this.observe(now, true);
      return;
    }
    if (this.last !== p) return;
    void this.channel.send({ type: "broadcast", event: SCREEN_EVENT, payload: p });
    if (!this.lastSaved) this.persist(p);
  }

  private persist(payload: ScreenPayload) {
    this.lastSaved = false;
    void this.supabase
      .from("screens")
      .update({ payload, updated_at: new Date(payload.at).toISOString() })
      .eq("church_id", this.churchId)
      .then(({ error }) => {
        // Only the newest slide matters; an older save finishing late doesn't count.
        if (this.last === payload) this.lastSaved = !error;
      });
  }

  async show(slide: Slide | null): Promise<ScreenPayload> {
    const themed = slide && !slide.theme && this.theme ? { ...slide, theme: this.theme } : slide;
    // The other consoles in this tab hear that this one took the screen.
    if (slide && typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SCREEN_TAKEN, { detail: this }));
    const payload: ScreenPayload = { id: crypto.randomUUID(), at: Date.now(), slide: themed, from: DEVICE };
    this.seen = payload;
    this.note(payload.id);
    // Fastest path first: a tab in this browser, then every other screen
    // (vMix, a projector PC) over realtime. The save can trail behind.
    this.last = payload;
    this.local?.postMessage(payload);
    void this.channel.send({ type: "broadcast", event: SCREEN_EVENT, payload });
    this.persist(payload);
    return payload;
  }

  /**
   * Takes the words off and leaves the background up (picture, video, colour
   * or gradient), unlike show(null), which blanks the screen. Sent as a slide
   * with no lines, so an output page from before this change shows just the
   * background too.
   */
  clearWords(kind?: "song"): Promise<ScreenPayload> {
    return this.show({ label: "", lines: [], translation: "", kind });
  }

  close() {
    window.removeEventListener("online", this.onOnline);
    this.local?.close();
    void this.supabase.removeChannel(this.channel);
  }
}
