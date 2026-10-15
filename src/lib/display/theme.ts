// How the projector looks: a background behind the words, and how the words
// are set. Each church has one look for scripture and one for songs, kept in
// churches.settings.display. A theme travels with every slide to the output
// page, so the projector and vMix need nothing else to draw it.

export type Background =
  | { type: "color"; color: string }
  /** `animate`: the colours drift slowly behind the words. */
  | { type: "gradient"; from: string; to: string; angle: number; animate?: boolean }
  | { type: "image"; url: string }
  | { type: "video"; url: string };

export type FontKey = "serif" | "sans" | "bold" | "elegant";

export interface DisplayTheme {
  /** The ready-made theme it started from, for the picker. */
  preset: string;
  background: Background;
  /** Darkens the background behind the words, 0 to 0.8. */
  dim: number;
  font: FontKey;
  /** Text size, as a multiple of the automatic size (0.7 to 1.4). */
  scale: number;
  textColor: string;
  /** Verse numbers and the reference line. */
  accentColor: string;
  align: "center" | "left";
  position: "top" | "middle" | "bottom";
  /** A soft shadow under the words, for busy backgrounds. */
  shadow: boolean;
  uppercase: boolean;
}

export interface DisplaySettings {
  scripture: DisplayTheme;
  songs: DisplayTheme;
}

export const FONTS: { key: FontKey; label: string; family: string; weight: number }[] = [
  { key: "serif", label: "Serif (Source Serif)", family: "var(--font-serif-face), Georgia, serif", weight: 500 },
  { key: "sans", label: "Clean (Geist)", family: "var(--font-ui), system-ui, sans-serif", weight: 600 },
  { key: "bold", label: "Bold (Montserrat)", family: "var(--font-bold-face), system-ui, sans-serif", weight: 800 },
  { key: "elegant", label: "Elegant (Playfair)", family: "var(--font-elegant-face), Georgia, serif", weight: 600 },
];

const base: Omit<DisplayTheme, "preset" | "background"> = {
  dim: 0,
  font: "serif",
  scale: 1,
  textColor: "#ffffff",
  accentColor: "#1ed760",
  align: "center",
  position: "middle",
  shadow: false,
  uppercase: false,
};

/** Ready-made looks. "classic" is how the projector has always looked. */
export const PRESETS: { id: string; name: string; theme: DisplayTheme }[] = [
  { id: "classic", name: "Classic", theme: { ...base, preset: "classic", background: { type: "color", color: "#000000" } } },
  {
    id: "bold",
    name: "Bold",
    theme: { ...base, preset: "bold", background: { type: "color", color: "#000000" }, font: "bold", accentColor: "#ffffff", scale: 1.05 },
  },
  {
    id: "midnight",
    name: "Midnight",
    theme: { ...base, preset: "midnight", background: { type: "gradient", from: "#0b1a3a", to: "#020617", angle: 160 }, font: "sans", accentColor: "#7dd3fc" },
  },
  {
    id: "sunrise",
    name: "Sunrise",
    theme: { ...base, preset: "sunrise", background: { type: "gradient", from: "#7c2d12", to: "#1c0a05", angle: 170 }, font: "elegant", accentColor: "#fdba74", shadow: true },
  },
  {
    id: "forest",
    name: "Forest",
    theme: { ...base, preset: "forest", background: { type: "gradient", from: "#14532d", to: "#03140a", angle: 160 }, font: "bold", accentColor: "#86efac", shadow: true },
  },
  {
    id: "royal",
    name: "Royal",
    theme: { ...base, preset: "royal", background: { type: "gradient", from: "#4c1d95", to: "#0f0520", angle: 150 }, font: "bold", accentColor: "#e9d5ff", shadow: true },
  },
  {
    id: "paper",
    name: "Paper",
    theme: { ...base, preset: "paper", background: { type: "color", color: "#f5f1e8" }, textColor: "#1c1917", accentColor: "#b45309" },
  },
];

/**
 * One-click gradients in the editor ("to right" is 90°). The live list is the
 * shared_gradients table, managed on the admin site; these seeded it and stand
 * in when it can't be read.
 */
export const GRADIENTS: { name: string; from: string; to: string; angle: number }[] = [
  { name: "Sunburst", from: "#ffc500", to: "#c21500", angle: 90 },
  { name: "Olive", from: "#999966", to: "#666600", angle: 90 },
  { name: "Crimson", from: "#7a2828", to: "#a73737", angle: 90 },
  { name: "Deep sea", from: "#182848", to: "#4b6cb7", angle: 90 },
  { name: "Plum", from: "#480048", to: "#c04848", angle: 90 },
  { name: "Midnight", from: "#0b1a3a", to: "#020617", angle: 160 },
  { name: "Forest", from: "#14532d", to: "#03140a", angle: 160 },
  { name: "Royal", from: "#4c1d95", to: "#0f0520", angle: 150 },
];

export const DEFAULT_DISPLAY: DisplaySettings = {
  scripture: PRESETS[0].theme,
  songs: { ...PRESETS[1].theme },
};

// ---------------------------------------------------------------------------
// Settings come from the database and travel to an unauthenticated page, so
// everything is checked: colours are hex, numbers are clamped, and pictures
// and videos must come from this app's own storage.

const HEX = /^#[0-9a-f]{6}$/i;
const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);
const clamp = (v: unknown, lo: number, hi: number, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Whether a background file URL is one of this app's uploads. */
export function isOwnMedia(url: unknown): url is string {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (typeof url !== "string" || !cloud) return false;
  // This account's Cloudinary, delivered from the backgrounds folder (after
  // any size and quality settings in the path).
  const root = new RegExp(`^https://res\\.cloudinary\\.com/${cloud.replace(/[^\w-]/g, "")}/(image|video)/upload/([\\w,]+/)?scriptures/backgrounds/[\\w-]+/[\\w-]+(\\.mp4)?$`);
  return root.test(url);
}

function cleanBackground(v: unknown, fallback: Background): Background {
  const b = (v ?? {}) as Record<string, unknown>;
  if (b.type === "color") return { type: "color", color: color(b.color, "#000000") };
  if (b.type === "gradient") {
    const g = { type: "gradient" as const, from: color(b.from, "#000000"), to: color(b.to, "#000000"), angle: clamp(b.angle, 0, 360, 160) };
    return b.animate === true ? { ...g, animate: true } : g;
  }
  if ((b.type === "image" || b.type === "video") && isOwnMedia(b.url)) return { type: b.type, url: b.url };
  return fallback;
}

export function cleanTheme(v: unknown, fallback: DisplayTheme): DisplayTheme {
  if (!v || typeof v !== "object") return fallback;
  const t = v as Record<string, unknown>;
  return {
    preset: typeof t.preset === "string" ? t.preset.slice(0, 40) : "custom",
    background: cleanBackground(t.background, fallback.background),
    dim: clamp(t.dim, 0, 0.8, fallback.dim),
    font: FONTS.some((f) => f.key === t.font) ? (t.font as FontKey) : fallback.font,
    scale: clamp(t.scale, 0.7, 1.4, fallback.scale),
    textColor: color(t.textColor, fallback.textColor),
    accentColor: color(t.accentColor, fallback.accentColor),
    align: t.align === "left" ? "left" : "center",
    position: t.position === "top" || t.position === "bottom" ? t.position : "middle",
    shadow: t.shadow === true,
    uppercase: t.uppercase === true,
  };
}

export function cleanDisplay(v: unknown): DisplaySettings {
  const d = (v ?? {}) as Record<string, unknown>;
  return {
    scripture: cleanTheme(d.scripture, DEFAULT_DISPLAY.scripture),
    songs: cleanTheme(d.songs, DEFAULT_DISPLAY.songs),
  };
}

/** The CSS for a background, for colours and gradients. */
export function backgroundCss(b: Background): string {
  if (b.type === "color") return b.color;
  if (b.type === "gradient") return `linear-gradient(${b.angle}deg, ${b.from}, ${b.to})`;
  return "#000000";
}
