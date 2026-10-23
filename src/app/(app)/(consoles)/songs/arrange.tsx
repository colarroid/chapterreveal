"use client";

import { CopyPlus, GripVertical, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button, IconButton } from "@/components/ui";
import type { Order } from "@/lib/songs/order";
import type { SongSlide } from "@/lib/songs/songs";

// Arranging a song by hand: the order the church sings it, parts repeated
// where they come back. Drag a part to move it (or Alt+↑/↓ on a focused
// part), Repeat adds it again after itself, and the parts below add any
// part at the end. Saved for the church; the next time the song opens it's
// in this order, and following and the arrow keys go by it.

interface Item {
  key: number;
  slide: number;
}

const firstLine = (s: SongSlide) => s.text.split("\n").find((l) => l.trim())?.trim() ?? "";
const partName = (s: SongSlide, i: number) => s.label || `Slide ${i + 1}`;

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
  const nextKey = useRef(initial.length);
  const [items, setItems] = useState<Item[]>(() => initial.map((slide, key) => ({ key, slide })));
  const [dragging, setDragging] = useState<number | null>(null);
  // Where a dragged part would land: before this index (items.length: at the end).
  const [dropAt, setDropAt] = useState<number | null>(null);
  const list = useRef<HTMLOListElement>(null);

  const add = (slide: number, at = items.length) => setItems((l) => [...l.slice(0, at), { key: nextKey.current++, slide }, ...l.slice(at)]);
  const remove = (i: number) => setItems((l) => (l.length > 1 ? l.filter((_, j) => j !== i) : l));
  const move = (from: number, to: number) =>
    setItems((l) => {
      if (to < 0 || to > l.length) return l;
      const next = [...l];
      const [it] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, it);
      return next;
    });
  // After a keyboard move the part keeps focus, so it can move again.
  const focusAt = (i: number) => requestAnimationFrame(() => list.current?.querySelectorAll<HTMLElement>("[data-part]")[i]?.focus());

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-3">
      <p className="px-1 pb-2 text-xs leading-snug text-muted">
        Drag the parts into the order your church sings them, and repeat a part where it comes back. Alt+↑ and ↓ move the part you&apos;re on.
      </p>
      <ol
        ref={list}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto"
        onDragOver={(e) => {
          // Below the last part: drop at the end.
          if (dragging === null || e.target !== e.currentTarget) return;
          e.preventDefault();
          setDropAt(items.length);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragging !== null && dropAt !== null) move(dragging, dropAt);
          setDragging(null);
          setDropAt(null);
        }}
      >
        {items.map((it, i) => {
          const s = slides[it.slide];
          const repeat = items.findIndex((x) => x.slide === it.slide) < i;
          return (
            <li
              key={it.key}
              data-part
              tabIndex={0}
              draggable
              onDragStart={(e) => {
                setDragging(i);
                e.dataTransfer.effectAllowed = "move";
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
                if (dragging !== null && dropAt !== null) move(dragging, dropAt);
                setDragging(null);
                setDropAt(null);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDropAt(null);
              }}
              onKeyDown={(e) => {
                if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                  e.preventDefault();
                  const to = e.key === "ArrowUp" ? i - 1 : i + 2;
                  if (to < 0 || to > items.length) return;
                  move(i, to);
                  focusAt(e.key === "ArrowUp" ? i - 1 : i + 1);
                } else if (e.key === "Delete" || e.key === "Backspace") {
                  e.preventDefault();
                  remove(i);
                }
              }}
              className={`group flex h-11 cursor-grab items-center gap-2 rounded-lg bg-surface-2 pr-1 pl-1.5 text-sm transition outline-none hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ink/70 active:cursor-grabbing ${
                dragging === i ? "opacity-40" : ""
              } ${dropAt === i && dragging !== null ? "shadow-[0_-2px_0_0_var(--accent-fill)]" : ""} ${
                dropAt === i + 1 && i === items.length - 1 && dragging !== null ? "shadow-[0_2px_0_0_var(--accent-fill)]" : ""
              }`}
            >
              <GripVertical size={15} className="shrink-0 text-faint" aria-hidden />
              <span className="w-5 shrink-0 text-right text-xs font-bold text-faint tabular-nums">{i + 1}</span>
              <span className={`shrink-0 text-xs font-bold ${s?.label === "Chorus" ? "text-accent" : "text-muted"}`}>
                {s ? partName(s, it.slide) : "Missing"}
                {repeat && <span className="font-semibold text-faint"> · again</span>}
              </span>
              <span className="min-w-0 flex-1 truncate">{s ? firstLine(s) : ""}</span>
              <IconButton label="Repeat this part after itself" onClick={() => add(it.slide, i + 1)} className="h-8 w-8 opacity-60 group-hover:opacity-100 hover:bg-ink/10!">
                <CopyPlus size={14} />
              </IconButton>
              <IconButton label="Take this part out" onClick={() => remove(i)} disabled={items.length < 2} className="h-8 w-8 opacity-60 group-hover:opacity-100 hover:bg-ink/10! hover:text-negative">
                <X size={14} />
              </IconButton>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 border-t border-line pt-3">
        <p className="px-1 text-[11px] font-bold tracking-wider text-faint uppercase">Add a part</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {slides.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => add(i)}
              title={`Add "${firstLine(s)}" at the end`}
              className="inline-flex h-8 max-w-56 items-center gap-1.5 rounded-full bg-surface-2 pr-3 pl-2 text-xs transition hover:bg-surface-3 active:scale-[0.97]"
            >
              <Plus size={13} className="shrink-0 text-muted" />
              <b className={`shrink-0 ${s.label === "Chorus" ? "text-accent" : ""}`}>{partName(s, i)}</b>
              <span className="min-w-0 truncate text-muted">{firstLine(s)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onSave(items.map((it) => it.slide))}>
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
