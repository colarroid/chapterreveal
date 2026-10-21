"use client";

// Small animated pieces for the consoles. The feel (the switch thumb's
// spring, the tab highlight's glide, the tooltip's quick fade and scale) is
// after beUI (https://beui.dev, MIT, Copyright (c) 2026 Saurabh Chauhan),
// rebuilt with plain CSS transitions instead of an animation library, so
// they add next to nothing to what the console downloads. Reduced motion is
// honoured by globals.css.

import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

/** A spring-like ease that overshoots a touch, then settles. */
const SPRINGY = "cubic-bezier(0.34, 1.4, 0.64, 1)";
/** beUI's strong ease-out. */
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * The track and thumb of a switch, inside a button that owns the click and
 * its label (Live, Auto, Follow). "live" is red (the screen), "accent" green
 * (a helper switched on).
 */
export function SwitchTrack({ on, tone = "accent" }: { on: boolean; tone?: "live" | "accent" }) {
  const fill = on ? (tone === "live" ? "bg-negative" : "bg-accent-fill") : tone === "live" ? "bg-surface-3 ring-1 ring-line-strong" : "bg-surface-3";
  return (
    <span aria-hidden className={`relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${fill}`}>
      <span
        className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-300 motion-reduce:transition-none"
        style={{ transform: on ? "translateX(16px)" : "translateX(0)", transitionTimingFunction: SPRINGY }}
      />
    </span>
  );
}

/**
 * One highlight that glides to the active item of the row it sits in (the
 * console tabs): the element with data-pill-key equal to activeKey. It finds
 * the row through itself, since its own effects run before the row's ref is
 * attached, and measures again when the row changes size (the font loading
 * in, a narrower window).
 */
export function GlidingPill({ activeKey, onShown }: { activeKey: string | null; onShown?: (shown: boolean) => void }) {
  const self = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);
  const [moved, setMoved] = useState(false);
  const lastKey = useRef(activeKey);
  useLayoutEffect(() => {
    const row = self.current?.parentElement;
    if (!row) return;
    const measure = () => {
      const el = row.querySelector<HTMLElement>(`[data-pill-key="${activeKey}"]`);
      const next = el && el.offsetWidth > 0 ? { x: el.offsetLeft, w: el.offsetWidth } : null;
      setBox((prev) => (prev && next && prev.x === next.x && prev.w === next.w ? prev : next));
    };
    // Glide only when the tab changes, not when the row re-measures.
    setMoved(lastKey.current !== activeKey);
    lastKey.current = activeKey;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [activeKey]);
  useEffect(() => onShown?.(!!box), [box, onShown]);
  return (
    <span
      ref={self}
      aria-hidden
      className="absolute top-1 bottom-1 left-0 rounded-full bg-surface-3 motion-reduce:transition-none"
      style={{
        display: box ? undefined : "none",
        width: box?.w,
        transform: `translateX(${box?.x ?? 0}px)`,
        // No glide on the first draw, only between tabs.
        transition: moved ? `transform 320ms ${EASE_OUT}, width 320ms ${EASE_OUT}` : "none",
      }}
    />
  );
}

const OPEN_DELAY = 120; // beUI's default
const WARM_MS = 300; // moving straight to the next button shows it at once
let warmUntil = 0;

/**
 * A label above a control on hover or keyboard focus, for buttons that are
 * only an icon (or become one on a narrow panel). Rendered on the page body,
 * so a panel's edge never clips it. The child keeps its own aria-label.
 */
export function Tooltip({ label, children, side = "top" }: { label: string; children: ReactElement<Record<string, unknown>>; side?: "top" | "bottom" }) {
  const id = useId();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    const el = trigger.current;
    if (!el) return;
    const open = () => {
      const r = el.getBoundingClientRect();
      setAt({ x: r.left + r.width / 2, y: side === "top" ? r.top : r.bottom });
    };
    if (timer.current) clearTimeout(timer.current);
    if (Date.now() < warmUntil) open();
    else timer.current = setTimeout(open, OPEN_DELAY);
  }, [side]);
  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setAt((cur) => {
      if (cur) warmUntil = Date.now() + WARM_MS;
      return null;
    });
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  // Scrolling or a click moves on from it.
  useEffect(() => {
    if (!at) return;
    window.addEventListener("scroll", hide, true);
    window.addEventListener("pointerdown", hide, true);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("pointerdown", hide, true);
    };
  }, [at, hide]);

  const child = cloneElement(children, {
    ref: (el: HTMLElement | null) => {
      trigger.current = el;
    },
    onPointerEnter: show,
    onPointerLeave: hide,
    onFocus: (e: FocusEvent) => {
      // Keyboard focus only: a click focuses the button too.
      if ((e.target as HTMLElement).matches?.(":focus-visible")) show();
    },
    onBlur: hide,
    "aria-describedby": at ? id : undefined,
  });

  return (
    <>
      {child}
      {at &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="tooltip-in pointer-events-none fixed z-[100] rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-bg shadow-pop"
            style={{
              left: at.x,
              top: at.y,
              translate: side === "top" ? "-50% calc(-100% - 8px)" : "-50% 8px",
              transformOrigin: side === "top" ? "bottom center" : "top center",
            }}
          >
            {label}
          </span>,
          document.body,
        )}
    </>
  );
}
