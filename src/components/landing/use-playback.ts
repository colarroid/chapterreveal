"use client";

import { useEffect, useRef, useState } from "react";

/** True when the viewer asked the OS for less motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * A looping clock for a landing-page demo. Runs only while the element is on
 * screen and not paused. With reduced motion it parks on `stillAt`, the
 * moment that best shows the finished state.
 */
export function usePlayback(loopMs: number, stillAt: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(stillAt);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced) {
      setT(stillAt);
      return;
    }
    if (paused || !visible) return;
    // About 20 updates a second is plenty for these demos and keeps the
    // landing page light on slow machines.
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const dt = now - last;
      if (dt >= 50) {
        setT((prev) => (prev + dt) % loopMs);
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, visible, reduced, loopMs, stillAt]);

  return { ref, t, paused: paused || reduced, toggle: () => setPaused((p) => !p), canPlay: !reduced };
}
