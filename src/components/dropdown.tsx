"use client";

import { Check, ChevronDown, Search, Star } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

// A styled replacement for <select>. Native option lists are drawn by the
// operating system (the blue Windows list) and can't be themed, so this
// renders its own menu in the design system: Spotify's raised menu surface,
// pill trigger, green check on the chosen item.
//
// Keyboard: Enter, Space or the arrows open it; arrows move; Enter picks;
// Esc closes; typing jumps to a match (or filters, when searchable). Every
// key it handles is preventDefault-ed, so page shortcuts (the console's
// arrows and Esc) stay out of the way while it is open.

export interface Option {
  value: string;
  label: string;
  /** Muted second part shown in the menu only, e.g. a full name after a code. */
  hint?: string;
}

export function Dropdown({
  value,
  options,
  onChange,
  placeholder = "Choose",
  disabled,
  searchable,
  required,
  name,
  ariaLabel,
  icon,
  className = "",
  menuClassName = "",
  align = "left",
  starred,
  onStar,
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Adds a filter box at the top of the menu; worth it for long lists. */
  searchable?: boolean;
  required?: boolean;
  name?: string;
  ariaLabel?: string;
  icon?: ReactNode;
  className?: string;
  menuClassName?: string;
  /** Which edge of the button the menu lines up with. */
  align?: "left" | "right";
  /** With onStar: a star on each row; starred rows show it filled. */
  starred?: ReadonlySet<string>;
  onStar?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const id = useId();

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // Names starting with what was typed come first: "gha" is Ghana before
    // Afghanistan, so Enter picks the obvious one.
    const starts: Option[] = [];
    const contains: Option[] = [];
    for (const o of options) {
      const l = o.label.toLowerCase();
      if (l.startsWith(q) || l.includes(` ${q}`)) starts.push(o);
      else if (l.includes(q)) contains.push(o);
    }
    return [...starts, ...contains];
  }, [options, query]);

  const selected = options.find((o) => o.value === value);

  function openMenu() {
    if (disabled) return;
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close(focusButton = true) {
    setOpen(false);
    if (focusButton) button.current?.focus();
  }

  function pick(o: Option | undefined) {
    if (!o) return;
    onChange(o.value);
    close();
  }

  // Focus the filter box, and keep the highlighted item in view.
  useEffect(() => {
    if (!open) return;
    if (searchable) search.current?.focus();
    else list.current?.focus();
  }, [open, searchable]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  // Click outside closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    const last = shown.length - 1;
    const move = (i: number) => {
      e.preventDefault();
      setActive(Math.max(0, Math.min(last, i)));
    };
    if (e.key === "ArrowDown") move(active + 1);
    else if (e.key === "ArrowUp") move(active - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(last);
    else if (e.key === "PageDown") move(active + 8);
    else if (e.key === "PageUp") move(active - 8);
    else if (e.key === "Enter") {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      close(false);
    } else if (!searchable && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Type-ahead: letters typed in quick succession jump to the first match.
      e.preventDefault();
      const now = Date.now();
      typed.current = { text: now - typed.current.at < 700 ? typed.current.text + e.key.toLowerCase() : e.key.toLowerCase(), at: now };
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  }

  return (
    <div ref={root} className={`relative ${className}`} onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        className="peer flex h-full w-full min-w-0 items-center gap-2 rounded-full bg-surface-2 pr-4 pl-4 text-left outline-none transition hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ink/80 disabled:pointer-events-none disabled:opacity-60"
      >
        {icon}
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-faint"}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} className={`shrink-0 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Lets the browser's own "please fill in" check cover this field. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden
          required
          name={name}
          value={value}
          onChange={() => {}}
          onInvalid={() => openMenu()}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0"
        />
      )}

      {open && (
        <div
          className={`absolute top-[calc(100%+6px)] ${align === "right" ? "right-0" : "left-0"} z-50 w-max max-w-[min(26rem,calc(100vw-2rem))] min-w-full overflow-hidden rounded-xl bg-menu p-1.5 shadow-pop ring-1 ring-line ${menuClassName}`}
        >
          {searchable && (
            <label className="mb-1.5 flex h-10 items-center gap-2 rounded-lg bg-surface-2 px-3">
              <Search size={16} className="shrink-0 text-muted" />
              <input
                ref={search}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Search"
                aria-label="Search options"
                aria-controls={`${id}-list`}
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
              />
            </label>
          )}
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}
            className="max-h-72 overflow-y-auto outline-none"
          >
            {shown.map((o, i) => {
              const isSel = o.value === value;
              return (
                <li
                  key={o.value}
                  id={`${id}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSel}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-[15px] ${i === active ? "bg-ink/10" : ""} ${
                    isSel ? "font-semibold text-accent" : "text-ink"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {o.label}
                    {o.hint && <span className="ml-2 font-normal text-muted">{o.hint}</span>}
                  </span>
                  {isSel && <Check size={16} className="shrink-0" />}
                  {onStar && (
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={starred?.has(o.value) ? `Unstar ${o.label}` : `Star ${o.label}`}
                      title={starred?.has(o.value) ? "Starred: kept at the top. Click to unstar." : "Star to keep it at the top"}
                      onClick={(e) => {
                        e.stopPropagation();
                        onStar(o.value);
                      }}
                      className={`-mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition hover:bg-ink/10 ${starred?.has(o.value) ? "text-warning" : "text-faint hover:text-ink"}`}
                    >
                      <Star size={15} fill={starred?.has(o.value) ? "currentColor" : "none"} />
                    </button>
                  )}
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-2.5 text-sm text-faint">No matches</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
