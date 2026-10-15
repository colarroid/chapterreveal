"use client";

import { Clock, Music, Pause, Play } from "lucide-react";
import type { ReactNode } from "react";
import { SlideView } from "@/components/slide-view";
import { Chip, PixelLoader, SignalBars } from "@/components/ui";
import { PRESETS, type DisplayTheme } from "@/lib/display/theme";
import type { Slide } from "@/lib/scripture/bible";
import { usePlayback } from "./use-playback";

// Feature cards, each with a small looping demo built from the app's own
// pieces, after terms.so's stacked product cards. The song in the demos is
// "Amazing Grace" (John Newton, 1779): public domain, so the public site
// never shows anyone's copyrighted lyrics.

const ROM_8_28 = "And we know that all things work together for good to them that love God, to them who are the called according to his purpose.";

const verse = (text: string, label = "Romans 8:28", n = 28): Slide => ({ label, lines: [{ verse: n, text }], translation: "KJV" });
const lyric = (text: string): Slide => ({ kind: "song", label: "Amazing Grace", lines: text.split("\n").map((t) => ({ verse: 0, text: t })), translation: "" });

const AMAZING_GRACE = [
  "Amazing grace, how sweet the sound\nThat saved a wretch like me",
  "I once was lost, but now am found\nWas blind, but now I see",
  "’Twas grace that taught my heart to fear\nAnd grace my fears relieved",
];

const theme = (id: string, patch: Partial<DisplayTheme> = {}): DisplayTheme => ({ ...PRESETS.find((p) => p.id === id)!.theme, ...patch });

function FeatureCard({
  eyebrow,
  title,
  body,
  loopMs,
  stillAt,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  loopMs: number;
  stillAt: number;
  children: (t: number) => ReactNode;
}) {
  const { ref, t, paused, toggle, canPlay } = usePlayback(loopMs, stillAt);
  return (
    // The media-desk frame: a page-coloured 6 px frame holding the header and
    // the demo as two grey blocks, 4 px apart.
    <div ref={ref} className="flex flex-col gap-1 rounded-3xl bg-bg p-1.5 shadow-[0_4px_30px_rgba(18,18,17,0.04)]">
      <div className="flex items-start gap-4 rounded-t-2xl bg-surface px-6 pt-6 pb-5 sm:px-8 sm:pt-7">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold tracking-wider text-accent uppercase">{eyebrow}</p>
          <h3 className="mt-1 text-xl leading-tight font-bold tracking-tight">{title}</h3>
          <p className="mt-0.5 max-w-md text-[17px] leading-snug text-muted">{body}</p>
        </div>
        {canPlay && (
          <button
            type="button"
            onClick={toggle}
            aria-label={paused ? "Play demo" : "Pause demo"}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2 text-ink transition hover:scale-105 hover:bg-surface-3"
          >
            {paused ? <Play size={17} className="fill-current" /> : <Pause size={17} className="fill-current" />}
          </button>
        )}
      </div>
      <div className="rounded-b-2xl bg-surface px-4 py-6 sm:px-8 sm:py-8">{children(t)}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Scripture: hearing a reference

const SPOKEN = "So this morning, turn with me to Romans chapter eight verse twenty eight. And we know that all things";
const REF = "Romans chapter eight verse twenty eight";
const REF_START = SPOKEN.indexOf(REF);
const REF_END = REF_START + REF.length;
const TYPE_FROM = 400;
const PER_CHAR = 45;
const heardAt = TYPE_FROM + REF_END * PER_CHAR;

function HearDemo({ t }: { t: number }) {
  const typed = Math.max(0, Math.min(SPOKEN.length, Math.floor((t - TYPE_FROM) / PER_CHAR)));
  const heard = typed >= REF_END;
  const sinceHeard = t - heardAt;
  return (
    <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <div className="space-y-3">
        <div className="rounded-lg bg-bg p-4 ring-1 ring-line">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-negative" /> Hearing the sermon
          </p>
          <p className="min-h-[4.8em] text-[15px] leading-relaxed">
            {typed <= REF_START ? (
              SPOKEN.slice(0, typed)
            ) : (
              <>
                {SPOKEN.slice(0, REF_START)}
                <mark className={`rounded px-0.5 transition-colors duration-300 ${heard ? "bg-accent-fill/20 font-semibold text-accent" : "bg-transparent text-ink"}`}>
                  {SPOKEN.slice(REF_START, Math.min(typed, REF_END))}
                </mark>
                {SPOKEN.slice(REF_END, typed)}
              </>
            )}
            <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-pulse bg-ink/60" />
          </p>
        </div>
        <div className={`flex items-center gap-2 transition duration-500 ${heard ? "opacity-100" : "opacity-0"}`}>
          {sinceHeard < 700 ? <PixelLoader label="Finding the verse" /> : <SignalBars level={3} label="Romans 8:28" />}
          {sinceHeard >= 700 && (
            <Chip tone="ok">
              <Clock size={12} /> Under a second
            </Chip>
          )}
        </div>
      </div>
      <Projector slide={verse(ROM_8_28)} visible={sinceHeard >= 700} caption="Straight to the projector and livestream" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Worship: following the singing

const SUNG = "Amazing grace how sweet the sound that saved a wretch like me I once was lost but now am found";
const SUNG_FROM = 300;
const SUNG_PER_CHAR = 70;
// Where in the singing each slide is recognised.
const SLIDE_AT = [SUNG.indexOf("how sweet"), SUNG.indexOf("lost but")];

function FollowDemo({ t }: { t: number }) {
  const typed = Math.max(0, Math.min(SUNG.length, Math.floor((t - SUNG_FROM) / SUNG_PER_CHAR)));
  const active = typed >= SLIDE_AT[1] ? 1 : typed >= SLIDE_AT[0] ? 0 : -1;
  const words = SUNG.slice(0, typed).split(" ").slice(-9).join(" ");
  return (
    <div className="grid items-center gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <div className="space-y-3">
        <div className="rounded-lg bg-bg p-4 ring-1 ring-line">
          <p className="mb-2 flex items-center gap-2 text-xs font-bold text-muted">
            <Music size={13} /> Hearing the worship team
          </p>
          <p className="min-h-[1.6em] truncate text-[15px] text-muted italic">
            {words}
            <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] animate-pulse bg-ink/60" />
          </p>
        </div>
        <ol className="grid gap-2">
          {AMAZING_GRACE.slice(0, 2).map((s, i) => (
            <li
              key={i}
              className={`rounded-lg p-3 text-sm leading-snug whitespace-pre-line transition duration-300 ${
                i === active ? "bg-negative/10 shadow-[inset_0_0_0_2px_var(--color-negative)]" : "bg-bg ring-1 ring-line"
              }`}
            >
              <span className="mb-0.5 block text-[11px] font-bold text-faint">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </div>
      <Projector slide={active >= 0 ? lyric(AMAZING_GRACE[active]) : null} visible={active >= 0} theme={theme("royal")} caption="The slide moves with the singing" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Your church's look

const LOOKS: { name: string; slide: Slide; theme: DisplayTheme }[] = [
  { name: "Classic", slide: verse(ROM_8_28), theme: theme("classic") },
  {
    name: "Animated gradient",
    slide: lyric(AMAZING_GRACE[0]),
    theme: theme("bold", { background: { type: "gradient", from: "#ffc500", to: "#c21500", angle: 90, animate: true }, shadow: true }),
  },
  { name: "Midnight", slide: verse(ROM_8_28), theme: theme("midnight") },
  { name: "Forest", slide: lyric(AMAZING_GRACE[1]), theme: theme("forest") },
  { name: "Paper", slide: verse(ROM_8_28), theme: theme("paper") },
];
const LOOK_MS = 2600;

function LookDemo({ t }: { t: number }) {
  const i = Math.floor(t / LOOK_MS) % LOOKS.length;
  const look = LOOKS[i];
  return (
    <div className="space-y-4">
      <Projector slide={look.slide} visible theme={look.theme} />
      <div className="flex flex-wrap items-center gap-2">
        {LOOKS.map((l, j) => (
          <span
            key={l.name}
            className={`inline-flex h-8 items-center rounded-full px-3.5 text-sm transition ${j === i ? "bg-ink font-bold text-bg" : "bg-surface-2 text-muted"}`}
          >
            {l.name}
          </span>
        ))}
        <span className="text-sm text-muted">… or your own pictures and videos</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Every service, saved

const LINES = [
  { at: "0:04:10", text: "Worship: ", ref: "Amazing Grace", after: "", song: true },
  { at: "0:31:02", text: "Church, turn with me to ", ref: "Romans 8:28", after: "." },
  { at: "0:36:15", text: "Then Paul writes in ", ref: "Philippians 4:13", after: ", I can do all things." },
  { at: "0:44:51", text: "Let's close with ", ref: "Psalm 23", after: ". The Lord is my shepherd." },
];

function HistoryDemo({ t }: { t: number }) {
  const count = Math.min(LINES.length, Math.floor((t - 300) / 1500) + 1);
  return (
    <div className="rounded-lg bg-bg p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">Sunday 12 October</span>
        <Chip>
          <Clock size={12} /> 1 h 42 min
        </Chip>
        <Chip>4 shown</Chip>
      </div>
      <div className="mt-3 space-y-2 text-[15px] leading-relaxed">
        {LINES.map((l, i) => (
          <p key={l.at} className={`grid grid-cols-[4.2rem_1fr] gap-2 transition duration-500 ${i < count ? "opacity-100" : "translate-y-1 opacity-0"}`}>
            <span className="pt-0.5 font-mono text-xs text-faint">{l.at}</span>
            <span>
              {l.text}
              <mark className={`rounded px-0.5 font-semibold ${l.song ? "bg-ink/10 text-ink" : "bg-accent-fill/20 text-accent"}`}>{l.ref}</mark>
              {l.after}
            </span>
          </p>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Projector({ slide, visible, theme: look, caption }: { slide: Slide | null; visible: boolean; theme?: DisplayTheme; caption?: string }) {
  return (
    <div>
      <div className="overflow-hidden rounded-lg shadow-pop ring-1 ring-black/40">
        <div className="aspect-video">
          <SlideView slide={slide} visible={visible} theme={look} />
        </div>
      </div>
      {caption && <p className="mt-2 text-xs text-muted">{caption}</p>}
    </div>
  );
}

export function Features() {
  return (
    <div className="space-y-6">
      <FeatureCard
        eyebrow="Scripture"
        title="Hears the reference"
        body="As the preacher cites a verse, it's picked out of the sermon and put up in the translation they asked for."
        loopMs={9000}
        stillAt={8200}
      >
        {(t) => <HearDemo t={t} />}
      </FeatureCard>
      <FeatureCard
        eyebrow="Worship"
        title="Follows the singing"
        body="Start worship and the lyrics follow the team, line by line. Pick songs by hand any time, or plan the set in a playlist."
        loopMs={9500}
        stillAt={8000}
      >
        {(t) => <FollowDemo t={t} />}
      </FeatureCard>
      <FeatureCard
        eyebrow="Display"
        title="In your church's look"
        body="Themes, fonts and backgrounds for scripture and songs, from a calm colour to a moving gradient or your own video."
        loopMs={LOOK_MS * LOOKS.length}
        stillAt={LOOK_MS + 100}
      >
        {(t) => <LookDemo t={t} />}
      </FeatureCard>
      <FeatureCard
        eyebrow="History"
        title="Every service, saved"
        body="The songs sung and the verses shown, each marked where it happened, for every service."
        loopMs={8000}
        stillAt={7500}
      >
        {(t) => <HistoryDemo t={t} />}
      </FeatureCard>
    </div>
  );
}
