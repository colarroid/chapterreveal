import { memo, useEffect, useRef, type CSSProperties } from "react";
import { backgroundCss, DEFAULT_DISPLAY, FONTS, type Background, type DisplayTheme } from "@/lib/display/theme";
import type { Slide } from "@/lib/scripture/bible";

export type SlideLayout = "full" | "lower";

// Sizes are in container width units (cqw) so the console's small preview
// and the real 1920px output are the same picture at different scales.
function textSize(chars: number, layout: SlideLayout): number {
  if (layout === "lower") return chars < 140 ? 2.6 : chars < 220 ? 2.2 : 1.9;
  if (chars < 80) return 5.6;
  if (chars < 160) return 4.6;
  if (chars < 240) return 3.9;
  return 3.4;
}

function songSize(chars: number, lines: number, layout: SlideLayout): number {
  if (layout === "lower") return lines > 2 || chars > 90 ? 2.4 : 2.9;
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
  theme,
  chroma,
  muted = false,
}: {
  slide: Slide | null;
  layout?: SlideLayout;
  visible?: boolean;
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
}) {
  const t = themeFor(slide, theme);
  const font = FONTS.find((f) => f.key === t.font) ?? FONTS[0];
  const chars = slide ? slide.lines.reduce((n, l) => n + l.text.length, 0) : 0;
  const many = (slide?.lines.length ?? 0) > 1;
  const on = visible && !!slide;

  // The lower third keeps its own look: white words on a dark band (or, on
  // green, on nothing).
  const lower = layout === "lower";
  // On a key colour (green screen) nothing may be green: the keyer removes
  // green pixels wherever they are, so the reference would vanish. Words and
  // reference are white there, straight on the green (no band), with a hard
  // dark edge to stay readable over the video. The edge has no blur: a soft
  // shadow is half see-through, and comes out as a green haze once keyed.
  const chromaEdge = "0.045em 0.045em 0 #000, -0.02em -0.02em 0 #000, 0.02em -0.02em 0 #000, -0.02em 0.02em 0 #000";
  const textColor = lower || chroma ? "#ffffff" : t.textColor;
  const accent = chroma ? "#ffffff" : lower ? "#1ed760" : t.accentColor;
  const words: CSSProperties = {
    fontFamily: font.family,
    fontWeight: font.weight,
    textTransform: t.uppercase ? "uppercase" : undefined,
    textShadow: chroma ? chromaEdge : t.shadow && !lower ? "0 0.06em 0.3em rgba(0,0,0,0.7)" : undefined,
  };
  const scale = lower ? 1 : t.scale;
  const small = (n: number) => `${(lower ? n * 0.75 : n).toFixed(2)}cqw`;

  const body =
    slide?.kind === "song" || slide?.kind === "text" ? (
      // Lyrics: one line per line, larger, nothing else but the credit.
      <>
        <p className="leading-[1.25] text-balance" style={{ ...words, fontSize: `${songSize(chars, slide.lines.length, layout) * scale}cqw` }}>
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
          <p className="leading-[1.32] text-balance" style={{ ...words, fontSize: `${textSize(chars, layout) * scale}cqw` }}>
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

  if ((slide?.kind === "image" || slide?.kind === "video") && slide.image && !lower) {
    // A picture or video slide fills the screen as it is: no theme, no words.
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

  if (lower) {
    return (
      <div className="relative h-full w-full overflow-hidden [container-type:inline-size]" style={chroma ? { background: chroma } : undefined}>
        <div
          // On green (livestream output) there's no band at all: the words sit
          // on the key colour, so only they show over the video once keyed.
          className={`absolute inset-x-0 bottom-0 ${chroma ? "pt-[2.6cqw]" : "bg-gradient-to-t from-black/90 via-black/80 to-black/0 pt-[4cqw]"} px-[6cqw] pb-[3.2cqw] transition-opacity duration-150 ${on ? "opacity-100" : "opacity-0"}`}
          style={{ color: textColor }}
        >
          {body}
        </div>
      </div>
    );
  }

  const justify = t.position === "top" ? "justify-start" : t.position === "bottom" ? "justify-end" : "justify-center";
  return (
    // Blank (Live off, or nothing up) is plain black, background and all.
    <div className="relative h-full w-full overflow-hidden bg-black [container-type:inline-size]" style={chroma ? { background: chroma } : undefined}>
      <div className={`absolute inset-0 transition-opacity duration-200 ${on ? "opacity-100" : "opacity-0"}`}>
        {!chroma && <Backdrop background={t.background} dim={t.dim} />}
        <div className={`absolute inset-0 flex flex-col px-[7cqw] py-[5cqw] ${justify} ${t.align === "left" ? "items-start text-left" : "items-center text-center"}`}>
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
