import { memo, useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { backgroundCss, DEFAULT_DISPLAY, DEFAULT_LOWER, FONTS, type Background, type DisplayTheme } from "@/lib/display/theme";
import type { Slide } from "@/lib/scripture/bible";

/**
 * "full": the whole screen, in the church's look. "lower": a lower third on
 * a 16:9 screen. "frame": the words alone, filling whatever box they're given
 * (an OBS browser source sized to the text area of the church's own design).
 */
export type SlideLayout = "full" | "lower" | "frame";

// Sizes are in container width units (cqw) so the console's small preview
// and the real 1920px output are the same picture at different scales.
/**
 * Lower thirds: the words fill a box the church sizes (width and height, see
 * LowerThird). They start at the largest size allowed (LOWER_MAX times the
 * Size setting), wrap across the box's width, and come down until they fit
 * its height, so a short verse is large and a long one never runs off.
 */
const LOWER_MAX = 3.6; // cqw at Size 100%
const MIN_FIT = 0.2;

function textSize(chars: number, layout: SlideLayout): number {
  if (layout !== "full") return LOWER_MAX;
  if (chars < 80) return 5.6;
  if (chars < 160) return 4.6;
  if (chars < 240) return 3.9;
  return 3.4;
}


function songSize(chars: number, lines: number, layout: SlideLayout): number {
  if (layout !== "full") return LOWER_MAX;
  if (lines <= 2 && chars < 70) return 6;
  if (lines <= 3 && chars < 130) return 5;
  if (lines <= 4 && chars < 200) return 4.2;
  return 3.5;
}

/** The theme a slide is drawn with: the one passed in, the one it carries, or the default for its kind. */
export function themeFor(slide: Slide | null, theme?: DisplayTheme): DisplayTheme {
  return theme ?? slide?.theme ?? (slide?.kind === "song" ? DEFAULT_DISPLAY.songs : DEFAULT_DISPLAY.scripture);
}

// The background on its own, so changing the words never reloads a picture
// or restarts a looping video.
export const Backdrop = memo(function Backdrop({ background, dim }: { background: Background; dim: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: backgroundCss(background) }}>
      {background.type === "gradient" && background.animate && (
        // A layer three screens wide (from, to, from) sliding back and forth.
        // Moving it is a transform, which the graphics card does on its own.
        <div
          className="animate-gradient-drift absolute inset-y-0 left-0 w-[300%]"
          style={{ background: `linear-gradient(${background.angle}deg, ${background.from}, ${background.to}, ${background.from})` }}
        />
      )}
      {background.type === "image" && background.url && (
        // eslint-disable-next-line @next/next/no-img-element -- a full-bleed background from storage, not a layout image
        <img src={background.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {background.type === "video" && background.url && (
        <video src={background.url} autoPlay muted loop playsInline preload="auto" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {dim > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: dim }} />}
    </div>
  );
});

// Memoised: the console re-renders on every partial transcript, the slide
// only when the operator changes it.
export const SlideView = memo(function SlideView({
  slide,
  layout = "full",
  visible = true,
  showWords = true,
  theme,
  chroma,
  muted = false,
  look = false,
}: {
  slide: Slide | null;
  layout?: SlideLayout;
  visible?: boolean;
  /** Off: the words are cleared but the background stays up. */
  showWords?: boolean;
  /** Overrides the slide's own theme (the console preview, the theme editor). */
  theme?: DisplayTheme;
  /**
   * The livestream output: a flat key colour (chroma green) behind
   * everything, blank screen included, for vMix or OBS to key out. The
   * slide's own background isn't drawn.
   */
  chroma?: string;
  /** Video slides: a preview (the console) stays silent and still. */
  muted?: boolean;
  /**
   * Frame layout only: the projector's own look (background, font, colours,
   * capitals, alignment) instead of the lower third's plain words.
   */
  look?: boolean;
}) {
  const t = themeFor(slide, theme);
  const font = FONTS.find((f) => f.key === t.font) ?? FONTS[0];
  const chars = slide ? slide.lines.reduce((n, l) => n + l.text.length, 0) : 0;
  const many = (slide?.lines.length ?? 0) > 1;
  const on = visible && !!slide;
  // The words, which can go while the background stays.
  const text = on && showWords && (slide?.lines.length ?? 0) > 0;

  // The lower third keeps its own look: white words on a dark band (or, on
  // green, on nothing).
  const frame = layout === "frame";
  // The frame takes the lower third's settings (capitals, size, alignment, colour).
  const lower = layout === "lower" || frame;
  // Its own position, size and capitals (a look saved before it had them gets the defaults).
  const lt = t.lower ?? DEFAULT_LOWER;
  // A frame in the projector's look styles its words like the projector.
  const styled = frame && look;
  // On a key colour (green screen) nothing may be green: the keyer removes
  // green pixels wherever they are, so the reference would vanish. Words and
  // reference are white there, straight on the green (no band), with a hard
  // dark edge to stay readable over the video. The edge has no blur: a soft
  // shadow is half see-through, and comes out as a green haze once keyed.
  const chromaEdge = "0.045em 0.045em 0 #000, -0.02em -0.02em 0 #000, 0.02em -0.02em 0 #000, -0.02em 0.02em 0 #000";
  // A frame's words are the colour the church picks, to match its design.
  const textColor = styled ? t.textColor : frame ? lt.color : lower || chroma ? "#ffffff" : t.textColor;
  const accent = styled ? t.accentColor : frame ? lt.color : chroma ? "#ffffff" : lower ? "#1ed760" : t.accentColor;
  const words: CSSProperties = {
    fontFamily: font.family,
    fontWeight: font.weight,
    textTransform: (lower && !styled ? lt.uppercase : t.uppercase) ? "uppercase" : undefined,
    textShadow: chroma ? chromaEdge : t.shadow && (!lower || styled) ? "0 0.06em 0.3em rgba(0,0,0,0.7)" : undefined,
  };
  // Lower third: the largest size (--fit, 0.2 to 1) at which the words fit
  // the box, found by measuring before the screen paints (a few quick
  // layouts, no re-render), so a wrong size never shows.
  const box = useRef<HTMLDivElement>(null);
  const fitKey = lower && slide ? `${slide.label}|${slide.lines.map((l) => l.text).join("|")}|${JSON.stringify(lt)}|${t.font}` : "";
  useLayoutEffect(() => {
    const el = box.current;
    if (!lower || !el) return;
    const fitText = () => {
      const fits = () => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
      el.style.setProperty("--fit", "1");
      if (fits()) return;
      let lo = MIN_FIT;
      let hi = 1;
      for (let i = 0; i < 10; i++) {
        const mid = (lo + hi) / 2;
        el.style.setProperty("--fit", String(mid));
        if (fits()) lo = mid;
        else hi = mid;
      }
      el.style.setProperty("--fit", String(lo));
    };
    fitText();
    // Measured again when a font finishes loading (its widths differ from the
    // stand-in), and once more on the next frame in case anything shifted.
    const fonts = document.fonts;
    fonts?.addEventListener("loadingdone", fitText);
    let frame = requestAnimationFrame(() => {
      frame = 0;
      if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) fitText();
    });
    void fonts?.ready.then(fitText);
    // And when the screen or frame changes size (a resized OBS source). Its
    // size never depends on the words, so fitting can't set this off again.
    const root = el.closest("[data-slide-root]");
    let last = "";
    const resized = new ResizeObserver(([e]) => {
      const size = `${Math.round(e.contentRect.width)}x${Math.round(e.contentRect.height)}`;
      if (last && size !== last) fitText();
      last = size;
    });
    if (root) resized.observe(root);
    return () => {
      resized.disconnect();
      fonts?.removeEventListener("loadingdone", fitText);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [lower, fitKey]);
  const scale = lower && !styled ? lt.scale : t.scale;
  // Lower-third sizes follow --fit; the projector's are plain. A frame can be
  // any shape (long and thin, or square), so its words start from whichever
  // of its height or width is tighter.
  const sized = (cqw: number) =>
    frame
      ? `calc(min(40cqh, 9cqw) * ${(cqw / LOWER_MAX).toFixed(3)} * var(--fit, 1))`
      : lower
        ? `calc(${cqw.toFixed(3)}cqw * var(--fit, 1))`
        : `${cqw}cqw`;
  const small = (n: number) => sized(lower ? n * 0.75 : n);

  const body =
    slide?.kind === "song" || slide?.kind === "text" ? (
      // Lyrics: one line per line, larger, nothing else but the credit.
      <>
        <p className="leading-[1.25] text-balance" style={{ ...words, fontSize: sized(songSize(chars, slide.lines.length, layout) * scale) }}>
          {slide.lines.map((l, i) => (
            <span key={i} className="block">
              {l.text}
            </span>
          ))}
        </p>
        {slide.copyright && (
          <p className="mt-[1.6cqw] font-sans" style={{ fontSize: small(1.1), opacity: chroma ? 1 : 0.45, textShadow: chroma ? chromaEdge : undefined }}>
            {slide.copyright}
          </p>
        )}
      </>
    ) : (
      slide && (
        <>
          <p className="leading-[1.32] text-balance" style={{ ...words, fontSize: sized(textSize(chars, layout) * scale) }}>
            {slide.lines.map((l) => (
              <span key={`${l.verse}-${l.text.slice(0, 12)}`}>
                {many && (
                  <sup className="mr-[0.25em] align-[0.5em] font-sans text-[0.5em] font-semibold" style={{ color: accent }}>
                    {l.verse}
                  </sup>
                )}
                {l.text}{" "}
              </span>
            ))}
          </p>
          <p
            className="mt-[1.6cqw] font-sans font-semibold tracking-wide"
            style={{ color: accent, fontSize: small(2), textShadow: chroma ? chromaEdge : undefined }}
          >
            {/* Solid on green: see-through text comes out green-tinted once keyed. */}
            {slide.label} <span className={`ml-[0.6em] font-medium ${chroma ? "" : "opacity-60"}`} style={{ color: textColor }}>{slide.translation}</span>
          </p>
          {slide.copyright && (
            // Small, but the licence asks for it to be readable.
            <p className="mt-[0.8cqw] font-sans" style={{ fontSize: small(1.1), opacity: chroma ? 1 : 0.45, textShadow: chroma ? chromaEdge : undefined }}>
              {slide.copyright}
            </p>
          )}
        </>
      )
    );

  if ((slide?.kind === "image" || slide?.kind === "video") && slide.image && (!lower || frame)) {
    // A picture or video slide fills the screen (or the frame) as it is: no theme, no words.
    return (
      <div className="relative h-full w-full overflow-hidden bg-black" style={chroma ? { background: chroma } : undefined}>
        <div className={`absolute inset-0 transition-opacity duration-200 ${on ? "opacity-100" : "opacity-0"}`}>
          {slide.kind === "video" ? (
            <SlideVideo src={slide.image} playing={on && !muted} muted={muted} />
          ) : (slide.images?.length ?? 0) > 1 ? (
            // Several pictures: side by side, each whole, on black.
            <div className="flex h-full w-full items-center gap-[1.2cqw] p-[1.2cqw]">
              {slide.images!.map((src, i) => (
                <div key={`${i}-${src}`} className="flex h-full min-w-0 flex-1 items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element -- pictures from the church's own storage */}
                  <img src={src} alt="" className="max-h-full max-w-full object-contain" />
                </div>
              ))}
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a full-screen picture from the church's own storage
            <img src={slide.image} alt="" className="h-full w-full object-contain" />
          )}
        </div>
      </div>
    );
  }

  const align = styled ? t.align : lt.align;
  const alignText = align === "center" ? "text-center" : align === "right" ? "text-right" : "";

  if (frame) {
    // The words filling the frame: on green or see-through (OBS browser
    // sources show the page's transparency), or in the projector's look, its
    // background behind them and its top/middle/bottom placement.
    const place = styled && t.position === "top" ? "justify-start" : styled && t.position === "bottom" ? "justify-end" : "justify-center";
    return (
      <div data-slide-root className="relative h-full w-full overflow-hidden [container-type:size]" style={{ background: chroma ?? (styled ? "#000000" : "transparent") }}>
        {styled && (
          <div className={`absolute inset-0 transition-opacity duration-200 ${on ? "opacity-100" : "opacity-0"}`}>
            <Backdrop background={t.background} dim={t.dim} />
          </div>
        )}
        <div
          ref={box}
          className={`relative flex h-full w-full flex-col ${place} overflow-hidden px-[3cqw] py-[6cqh] ${alignText} transition-opacity duration-150 ${text ? "opacity-100" : "opacity-0"}`}
          style={{ color: textColor }}
        >
          {body}
        </div>
      </div>
    );
  }

  if (lower) {
    const top = lt.position === "top";
    // On green (livestream output) there's no band at all: the words sit on
    // the key colour, so only they show over the video once keyed. Off green,
    // a dark fade from the edge the words sit on.
    const band = chroma
      ? top ? "pb-[2.6cqw]" : "pt-[2.6cqw]"
      : top
        ? "bg-gradient-to-b from-black/90 via-black/80 to-black/0 pb-[4cqw]"
        : "bg-gradient-to-t from-black/90 via-black/80 to-black/0 pt-[4cqw]";
    return (
      <div data-slide-root className="relative h-full w-full overflow-hidden [container-type:inline-size]" style={chroma ? { background: chroma } : undefined}>
        <div
          className={`absolute inset-x-0 ${top ? "top-0 pt-[3.2cqw]" : "bottom-0 pb-[3.2cqw]"} ${band} ${alignText} px-[6cqw] transition-opacity duration-150 ${text ? "opacity-100" : "opacity-0"}`}
          style={{ color: textColor }}
        >
          {/* The text box: its width (of the space between the margins) and
              height (of the screen's, 56.25cqw on 16:9) come from the settings. */}
          <div
            ref={box}
            className={`overflow-hidden ${lt.align === "center" ? "mx-auto" : lt.align === "right" ? "ml-auto" : ""}`}
            style={{ width: `${lt.width}%`, maxHeight: `${((lt.height / 100) * 56.25).toFixed(2)}cqw` }}
          >
            {body}
          </div>
        </div>
      </div>
    );
  }

  const justify = t.position === "top" ? "justify-start" : t.position === "bottom" ? "justify-end" : "justify-center";
  return (
    // Blank (Live off, or nothing up) is plain black, background and all.
    // Words cleared: the background stays and only the words fade.
    <div className="relative h-full w-full overflow-hidden bg-black [container-type:inline-size]" style={chroma ? { background: chroma } : undefined}>
      <div className={`absolute inset-0 transition-opacity duration-200 ${on ? "opacity-100" : "opacity-0"}`}>
        {!chroma && <Backdrop background={t.background} dim={t.dim} />}
        <div className={`absolute inset-0 flex flex-col px-[7cqw] py-[5cqw] ${justify} transition-opacity duration-300 ${text ? "opacity-100" : "opacity-0"} ${t.align === "left" ? "items-start text-left" : "items-center text-center"}`}>
          <div className="max-w-[86cqw]" style={{ color: textColor }}>
            {body}
          </div>
        </div>
      </div>
    </div>
  );
});

/**
 * A video slide on the output: plays once from the start, with sound when
 * the browser allows it (it may insist on starting muted until someone has
 * clicked the window; Present's click usually counts).
 */
function SlideVideo({ src, playing, muted }: { src: string; playing: boolean; muted: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (!playing) {
      v.pause();
      return;
    }
    v.currentTime = 0;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      void v.play().catch(() => {});
    });
  }, [playing, src]);
  return <video ref={ref} src={src} playsInline preload="auto" muted={muted} className="h-full w-full object-contain" />;
}
