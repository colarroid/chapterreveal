"use client";

import { CopyPlus, GripVertical, Plus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui";
import { orderFromParts, partsFromOrder, songParts, type Order, type Part } from "@/lib/songs/order";
import type { SongSlide } from "@/lib/songs/songs";

// Arranging a song by hand, part by part (Chorus, Verse 1: see songParts):
// the order the church sings it, parts repeated where they come back. Drag
// a part to move it (or Alt+↑/↓ on a focused part), Repeat adds it again
// after itself, and the parts below add any part at the end. Saved for the
// church; the next time the song opens it's in this order, and following
// and the arrow keys go by it.

interface Item {
  key: number;
  part: number;
}

export function ArrangeOrder({
  slides,
  initial,
  canReset,
  onSave,
  onReset,
  onCancel,
}: {
  slides: SongSlide[];
  initial: Order;
  /** The church has its own order: offer going back to the written one. */
  canReset: boolean;
  onSave: (order: Order) => void;
  onReset: () => void;
  onCancel: () => void;
}) {
  // The song's parts, and the order on screen now read as parts. An order
  // that doesn't split into whole parts (rare) is arranged slide by slide.
  const { parts, start } = useMemo(() => {
    const found = songParts(slides);
    const seq = partsFromOrder(found.parts, initial, slides);
    if (seq) return { parts: found.parts, start: seq };
    const single: Part[] = slides.map((s, i) => ({ name: s.label || `Slide ${i + 1}`, slides: [i], keys: [s.text], firstLine: s.text.split("\n")[0] ?? "" }));
    return { parts: single, start: initial };
  }, [slides, initial]);

  const nextKey = useRef(start.length);
  const [items, setItems] = useState<Item[]>(() => start.map((part, key) => ({ key, part })));
  const [dragging, setDragging] = useState<number | null>(null);
  // Where a dragged part would land: before this index (items.length: at the end).
  const [dropAt, setDropAt] = useState<number | null>(null);
  const list = useRef<HTMLOListElement>(null);

  const add = (part: number, at = items.length) => {
    setItems((l) => [...l.slice(0, at), { key: nextKey.current++, part }, ...l.slice(at)]);
    // Show what was added at the end.
    if (at >= items.length) requestAnimationFrame(() => list.current?.lastElementChild?.scrollIntoView({ block: "nearest" }));
  };
  const remove = (i: number) => setItems((l) => (l.length > 1 ? l.filter((_, j) => j !== i) : l));
  const move = (from: number, to: number) =>
    setItems((l) => {
      if (to < 0 || to > l.length || to === from || to === from + 1) return l;
      const next = [...l];
      const [it] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, it);
      return next;
    });
  const drop = () => {
    if (dragging !== null && dropAt !== null) move(dragging, dropAt);
    setDragging(null);
    setDropAt(null);
  };
  // After a keyboard move the part keeps focus, so it can move again.
  const focusAt = (i: number) => requestAnimationFrame(() => list.current?.querySelectorAll<HTMLElement>("[data-part]")[i]?.focus());

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
      <p className="shrink-0 px-1 pb-2 text-xs leading-snug text-muted">
        Drag the parts into the order your church sings them. Repeat a part where it comes back; Alt+↑ and ↓ move the part you&apos;re on.
      </p>

      {/* The order: gets the room, scrolls when long. */}
      <ol
        ref={list}
        className="min-h-36 flex-1 space-y-1 overflow-y-auto"
        onDragOver={(e) => {
          // Below the last part: drop at the end.
          if (dragging === null || e.target !== e.currentTarget) return;
          e.preventDefault();
          setDropAt(items.length);
        }}
        onDrop={(e) => {
          e.preventDefault();
          drop();
        }}
      >
        {items.map((it, i) => {
          const part = parts[it.part];
          const again = items.findIndex((x) => x.part === it.part) < i;
          const line = (above: boolean) => dragging !== null && dragging !== i && (above ? dropAt === i : dropAt === i + 1 && i === items.length - 1);
          return (
            <li
              key={it.key}
              data-part
              tabIndex={0}
              draggable
              onDragStart={(e) => {
                setDragging(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", part.name);
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                drop();
              }}
              onDragEnd={() => {
                setDragging(null);
                setDropAt(null);
              }}
              onKeyDown={(e) => {
                if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                  e.preventDefault();
                  const up = e.key === "ArrowUp";
                  if (up ? i === 0 : i === items.length - 1) return;
                  move(i, up ? i - 1 : i + 2);
                  focusAt(up ? i - 1 : i + 1);
                } else if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  remove(i);
                }
              }}
              className={`group flex h-12 cursor-grab items-center gap-2 rounded-lg bg-surface-2 pr-1 pl-1.5 text-sm transition outline-none select-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ink/70 active:cursor-grabbing ${
                dragging === i ? "opacity-40" : ""
              } ${line(true) ? "shadow-[0_-3px_0_0_var(--accent-fill)]" : line(false) ? "shadow-[0_3px_0_0_var(--accent-fill)]" : ""}`}
            >
              <GripVertical size={15} className="shrink-0 text-faint" aria-hidden />
              <span className="w-5 shrink-0 text-right text-xs font-bold text-faint tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5 text-xs font-bold">
                  <span className={part.name.startsWith("Chorus") ? "text-accent" : "text-ink"}>{part.name}</span>
                  {again && <span className="font-semibold text-faint">again</span>}
                  <span className="font-semibold text-faint">
                    · {part.slides.length} slide{part.slides.length === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="block truncate text-xs text-muted">{part.firstLine}</span>
              </span>
              <IconButton label="Repeat this part after itself" onClick={() => add(it.part, i + 1)} className="h-8 w-8 opacity-60 group-hover:opacity-100 hover:bg-ink/10!">
                <CopyPlus size={14} />
              </IconButton>
              <IconButton
                label="Take this part out"
                onClick={() => remove(i)}
                disabled={items.length < 2}
                className="h-8 w-8 opacity-60 group-hover:opacity-100 hover:bg-ink/10! hover:text-negative"
              >
                <X size={14} />
              </IconButton>
            </li>
          );
        })}
      </ol>

      {/* Every part of the song, to add one at the end. Kept short: it scrolls. */}
      <div className="mt-3 shrink-0 border-t border-line pt-2.5">
        <p className="px-1 text-[11px] font-bold tracking-wider text-faint uppercase">Add a part</p>
        <div className="mt-1.5 flex max-h-[5.25rem] flex-wrap gap-1.5 overflow-y-auto">
          {parts.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => add(i)}
              title={`Add ${p.name} ("${p.firstLine}") at the end`}
              className="inline-flex h-8 max-w-60 items-center gap-1.5 rounded-full bg-surface-2 pr-3 pl-2 text-xs transition hover:bg-surface-3 active:scale-[0.97]"
            >
              <Plus size={13} className="shrink-0 text-muted" />
              <b className={`shrink-0 ${p.name.startsWith("Chorus") ? "text-accent" : ""}`}>{p.name}</b>
              <span className="min-w-0 truncate text-muted">{p.firstLine}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onSave(orderFromParts(parts, items.map((it) => it.part)))}>
          Save order
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {canReset && (
          <button type="button" onClick={onReset} className="ml-auto text-xs font-bold text-muted hover:text-ink">
            Back to the written order
          </button>
        )}
      </div>
    </div>
  );
}
