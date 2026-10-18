"use client";

import { useEffect, useRef, useState } from "react";
import { SlideView, type SlideLayout } from "@/components/slide-view";
import { cleanTheme, DEFAULT_DISPLAY, isOwnMedia } from "@/lib/display/theme";
import type { Slide } from "@/lib/scripture/bible";
import { PRESENT_MESSAGE } from "@/lib/live/present";
import { localScreenChannel, SCREEN_EVENT, screenTopic, type ScreenPayload } from "@/lib/live/screen";
import { supabaseBrowser } from "@/lib/supabase/client";

// The page vMix loads as a browser input and the projector shows full
// screen. No login: the token in the URL is the key. It listens on the
// church's realtime channel, and re-reads the saved state whenever the
// socket (re)connects and every 15 s, so it heals after any network blip.

/** The key colour behind the livestream output: standard chroma green. */
export const CHROMA_GREEN = "#00b140";

export function OutputScreen({
  token,
  layout,
  present = false,
  online = false,
  only,
  chroma,
}: {
  token: string;
  layout: SlideLayout;
  present?: boolean;
  /**
   * The livestream output (/screen/<address>/online): chroma green behind
   * everything for vMix or OBS to key out; lyrics in a lower third so the
   * camera shot stays visible, scripture full screen.
   */
  online?: boolean;
  /** Only scripture or only lyrics; blank while the other is on screen (separate vMix/OBS inputs). */
  only?: "scripture" | "song";
  /** A key colour behind everything (lower thirds on green). */
  chroma?: string;
}) {
  const [slide, setSlide] = useState<Slide | null>(null);
  const [visible, setVisible] = useState(false);
  const [lost, setLost] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const latest = useRef(0);
  const replacedRef = useRef(false);

  // Opened by "Present on projector": go fullscreen, by the console's request
  // when Chrome allows it, otherwise on the first click or key press here.
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!present) return;
    const go = () => {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => {});
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin === location.origin && e.data === PRESENT_MESSAGE) go();
    };
    const onChange = () => {
      const full = !!document.fullscreenElement;
      setFullscreen(full);
      // The console shows "Fill projector screen" until this says it's full.
      window.opener?.postMessage(`${PRESENT_MESSAGE}:${full ? "full" : "windowed"}`, location.origin);
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("pointerdown", go);
    window.addEventListener("keydown", go);
    document.addEventListener("fullscreenchange", onChange);
    onChange();
    // Tell the console we're listening, so it can pass on its click.
    window.opener?.postMessage(`${PRESENT_MESSAGE}:ready`, location.origin);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pointerdown", go);
      window.removeEventListener("keydown", go);
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, [present]);
  const needsClick = present && !fullscreen;

  useEffect(() => {
    // vMix keys out a transparent page for the lower-third layout; the online
    // output is keyed on its green instead.
    if (layout === "lower" && !online) {
      document.documentElement.style.background = "transparent";
      document.body.style.background = "transparent";
    }
    // The online output is green to the very edge, blank screen included.
    const key = online ? CHROMA_GREEN : chroma;
    if (key) {
      document.documentElement.style.background = key;
      document.body.style.background = key;
    }
  }, [layout, online, chroma]);

  // No cursor on the projector, except while it needs that one click.
  useEffect(() => {
    document.body.style.cursor = needsClick ? "pointer" : "none";
  }, [needsClick]);

  useEffect(() => {
    const supabase = supabaseBrowser();

    const apply = (p: ScreenPayload | null) => {
      // A replaced link stays blank, even if an old console still sends to it.
      if (replacedRef.current) return;
      if (!p || p.at <= latest.current) return;
      latest.current = p.at;
      if (p.slide && only && (p.slide.kind === "song" ? "song" : p.slide.kind === "text" || p.slide.kind === "image" || p.slide.kind === "video" ? "slide" : "scripture") !== only) {
        // The other kind went up: this output goes blank.
        setVisible(false);
      } else if (p.slide) {
        // The look comes with the slide; only safe colours and this app's own
        // uploaded backgrounds get through.
        const base = p.slide.kind === "song" ? DEFAULT_DISPLAY.songs : DEFAULT_DISPLAY.scripture;
        // Pictures only from this app's own storage, like backgrounds.
        const image = (p.slide.kind === "image" || p.slide.kind === "video") && isOwnMedia(p.slide.image) ? p.slide.image : undefined;
        setSlide({ ...p.slide, image, theme: cleanTheme(p.slide.theme, base) });
        setVisible(true);
      } else {
        // Keep the old text so it can fade out.
        setVisible(false);
      }
    };

    const refresh = async () => {
      const { data, error } = await supabase.rpc("screen_state", { p_token: token });
      if (error) {
        // Before migration 0004 there is no screen_state: use the older call.
        const old = await supabase.rpc("get_screen", { p_token: token });
        if (!old.error) apply(old.data as ScreenPayload | null);
        return;
      }
      // No row: an admin replaced this link. Go blank so a leaked or old link
      // stops showing anything.
      if (data === null) {
        replacedRef.current = true;
        setReplaced(true);
        setVisible(false);
        return;
      }
      replacedRef.current = false;
      setReplaced(false);
      apply((data as { payload: ScreenPayload | null }).payload);
    };

    // Private channel: anyone may receive (this page isn't signed in), only
    // the church's members may send (migration 0019).
    const channel = supabase
      .channel(screenTopic(token), { config: { private: true } })
      .on("broadcast", { event: SCREEN_EVENT }, ({ payload }) => apply(payload as ScreenPayload))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLost(false);
          void refresh();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setLost(true);
        }
      });

    // When this page runs in the operator's own browser (projector on a
    // second monitor), updates arrive here first, in about a millisecond.
    const local = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(localScreenChannel(token));
    if (local) local.onmessage = (e: MessageEvent<ScreenPayload>) => apply(e.data);

    const poll = setInterval(refresh, 15000);
    return () => {
      local?.close();
      clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [token, only]);

  return (
    <div className="fixed inset-0">
      <SlideView
        slide={slide}
        layout={online ? (slide?.kind === "song" ? "lower" : "full") : layout}
        visible={visible}
        chroma={online ? CHROMA_GREEN : chroma}
      />
      {/* A dot the operator can see on the projector; invisible to the room from a distance. */}
      {lost && !replaced && <div className="absolute right-3 bottom-3 h-2 w-2 rounded-full bg-warning" title="Reconnecting" />}
      {needsClick && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
          <span className="rounded-full bg-white/10 px-4 py-2 font-sans text-sm text-white/60">Click anywhere or press any key to fill the screen</span>
        </div>
      )}
      {replaced && (
        // Small and dim: readable by the operator up close, not distracting to the room.
        <p className="absolute bottom-4 left-5 font-sans text-sm text-white/40">This output link was replaced. Load the new one from Settings.</p>
      )}
    </div>
  );
}
