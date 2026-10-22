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
}

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
  private lastSaved = true;
  private connected = false;
  private onOnline = () => this.catchUp();
  /** The look every slide is sent with, unless the slide brings its own. */
  theme: DisplayTheme | null = null;

  constructor(
    private supabase: SupabaseClient,
    private churchId: string,
    token: string,
  ) {
    // Private: only signed-in members of the church may send to its screen
    // (migration 0019), so the connection carries the operator's sign-in.
    this.channel = supabase.channel(screenTopic(token), { config: { private: true, broadcast: { ack: false, self: false } } });
    // When the socket comes back after a drop, vMix and other PCs missed
    // whatever went up meanwhile: send the current slide again.
    void supabase.realtime
      .setAuth()
      .catch(() => {})
      .then(() =>
        this.channel.subscribe((status) => {
          const up = status === "SUBSCRIBED";
          if (up && !this.connected) this.catchUp();
          this.connected = up;
        }),
      );
    this.local = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(localScreenChannel(token));
    window.addEventListener("online", this.onOnline);
  }

  private catchUp() {
    const p = this.last;
    if (!p) return;
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
    const payload: ScreenPayload = { id: crypto.randomUUID(), at: Date.now(), slide: themed };
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
