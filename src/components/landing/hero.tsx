"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "./use-playback";

// The headline types itself out, one line after another. Finished lines dim
// so the eye follows the newest, and the last line stays bright.

const CHAR_MS = 34;
const LINE_PAUSE_MS = 380;


export function TypedHeadline({
  lines,
  size = "leading-[1.0] text-[2.6rem] sm:text-[3.6rem] lg:text-[4.1rem]",
}: {
  lines: string[];
  /** Line height and font size classes, small screens up. */
  size?: string;
}) {
  const reduced = useReducedMotion();
  const total = lines.reduce((n, l) => n + l.length, 0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduced) {
      setShown(total);
      return;
    }
    let count = 0;
    let timer: ReturnType<typeof setTimeout>;
    const ends = lines.reduce<number[]>((acc, l) => [...acc, (acc.at(-1) ?? 0) + l.length], []);
    const step = () => {
      count += 1;
      setShown(count);
      if (count >= total) return;
      timer = setTimeout(step, ends.includes(count) ? LINE_PAUSE_MS : CHAR_MS);
    };
    timer = setTimeout(step, 500);
    return () => clearTimeout(timer);
  }, [lines, total, reduced]);

  const last = lines.length - 1;
  // Where each line ends in the running character count, and which line the
  // caret is on: the first one not yet past `shown`.
  const ends = lines.reduce<number[]>((acc, l) => [...acc, (acc.at(-1) ?? 0) + l.length], []);
  const caretLine = Math.max(0, ends.findIndex((e) => e >= shown));
  return (
    <h1 className={`font-medium tracking-[-0.03em] ${size}`}>
      {/* The full sentence for screen readers, whatever the animation is doing. */}
      <span className="sr-only">{lines.join(" ")}</span>
      <span aria-hidden>
        {lines.map((line, i) => {
          const start = i === 0 ? 0 : ends[i - 1];
          const n = Math.max(0, Math.min(line.length, shown - start));
          return (
            <span key={line} className={`block ${i === last ? "text-white" : "text-white/40"}`}>
              {line.slice(0, n)}
              {i === caretLine && <span className="ml-1 inline-block h-[0.8em] w-[3px] translate-y-[0.08em] animate-pulse rounded-full bg-[#1ed760]" />}
              {/* Keep the line's height so the layout doesn't jump while typing. */}
              {n === 0 && <span className="invisible">.</span>}
            </span>
          );
        })}
      </span>
    </h1>
  );
}

// Things preachers say and congregations sing, drifting in the margins of
// the hero. Each one types itself in with a CSS steps() reveal on a monospace
// font. The hymn lines are public domain (Newton 1779, Heber 1826, Crosby
// 1873, Spafford 1873).
const FRAGMENTS = [
  { text: "turn with me to Romans 8:28", side: "left", top: 14, delay: 0.4 },
  { text: "♪ amazing grace, how sweet the sound", side: "right", top: 20, delay: 2.2 },
  { text: "John three sixteen, in the KJV", side: "left", top: 44, delay: 4.1 },
  { text: "♪ holy, holy, holy! Lord God Almighty", side: "right", top: 50, delay: 1.3 },
  { text: "♪ blessed assurance, Jesus is mine", side: "left", top: 72, delay: 3.2 },
  { text: "Proverbs 3, 5 and 6", side: "right", top: 78, delay: 5.0 },
] as const;

export function AmbientFragments() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden xl:block">
      {FRAGMENTS.map((f) => (
        <span
          key={f.text}
          className="ambient-fragment absolute font-mono text-[11px] text-white/45"
          style={
            {
              top: `${f.top}%`,
              [f.side]: "2.2rem",
              "--chars": f.text.length,
              animationDelay: `${f.delay}s`,
            } as React.CSSProperties
          }
        >
          {f.text}
        </span>
      ))}
    </div>
  );
}
