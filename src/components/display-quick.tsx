"use client";

import { Palette, SlidersHorizontal } from "lucide-react";
import { Tooltip } from "./motion";
import { useEffect, useRef, useState } from "react";
import { backgroundCss, FONTS, PRESETS, type Background, type DisplaySettings, type DisplayTheme } from "@/lib/display/theme";
import { listBackgrounds } from "@/lib/display/backgrounds";
import { CONSOLE_CHANNEL, type ConsoleMessage } from "@/lib/live/screen";
import { supabaseBrowser } from "@/lib/supabase/client";
import { DisplayEditor } from "./display-editor";
import { Button } from "./ui";

const SAVE_AFTER_MS = 700;

/**
 * The look of the projector, changed from the console without leaving it:
 * themes, the church's backgrounds, darken and size. Changes show at once
 * (the console re-sends what's up) and save themselves a moment later.
 */
export function DisplayQuick({
  churchId,
  kind,
  display,
  onChange,
  labelClassName = "",
}: {
  churchId: string;
  kind: keyof DisplaySettings;
  display: DisplaySettings;
  onChange: (d: DisplaySettings) => void;
  /** Lets a console hide the button's word on narrow panels (the icon and title stay). */
  labelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uploads, setUploads] = useState<{ url: string; video: boolean; shared: boolean }[] | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = display[kind];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Close this panel; don't let the console treat Esc as "blank the screen".
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || uploads) return;
    void listBackgrounds().then((list) => setUploads(list.map((b) => ({ url: b.url, video: b.kind === "video", shared: b.shared }))));
  }, [open, uploads]);

  // Saved a moment after the last change: the newest settings are read and
  // merged, so nothing else in them is overwritten.
  const save = (next: DisplaySettings) => {
    if (timer.current) clearTimeout(timer.current);
    setSaving("saving");
    timer.current = setTimeout(async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase.from("churches").select("settings").eq("id", churchId).single();
      const { error } = await supabase
        .from("churches")
        .update({ settings: { ...((data?.settings as Record<string, unknown>) ?? {}), display: next } })
        .eq("id", churchId);
      setSaving(error ? "error" : "saved");
      if (!error && typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel(CONSOLE_CHANNEL);
        bc.postMessage({ type: "display", display: next } satisfies ConsoleMessage);
        bc.close();
      }
    }, SAVE_AFTER_MS);
  };

  const set = (patch: Partial<DisplayTheme>) => {
    const next = { ...display, [kind]: { ...theme, ...patch, preset: patch.preset ?? "custom" } };
    onChange(next);
    save(next);
  };
  const isBg = (b: Background) => JSON.stringify(b) === JSON.stringify(theme.background);

  return (
    <div ref={root} className="relative">
      <Tooltip label="Design: background and text for the projector">
        <Button
          variant={open ? "secondary" : "outline"}
          size="sm"
          className="h-10"
          aria-expanded={open}
          aria-label="Design"
          onClick={() => setOpen((o) => !o)}
        >
          <Palette size={14} /> <span className={labelClassName}>Design</span>
        </Button>
      </Tooltip>
      {open && (
        <div role="dialog" aria-label="Display" className="absolute right-0 bottom-[calc(100%+8px)] z-40 w-[340px] max-w-[calc(100vw-32px)] space-y-3 rounded-xl bg-menu p-3 shadow-pop ring-1 ring-line">
          <div className="flex items-center gap-2 px-1">
            <span className="text-sm font-bold">{kind === "scripture" ? "Scripture look" : "Song look"}</span>
            <span className="ml-auto text-xs text-faint">
              {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : saving === "error" ? "Couldn't save" : ""}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {PRESETS.map((p) => {
              const f = FONTS.find((x) => x.key === p.theme.font)!;
              return (
                <button
                  key={p.id}
                  type="button"
                  title={p.name}
                  onClick={() => set({ ...p.theme, uppercase: theme.uppercase })}
                  className={`overflow-hidden rounded-md ${theme.preset === p.id ? "ring-2 ring-accent" : "ring-1 ring-line hover:ring-line-strong"}`}
                >
                  <span className="grid aspect-video place-items-center" style={{ background: backgroundCss(p.theme.background) }}>
                    <span style={{ fontFamily: f.family, fontWeight: f.weight, color: p.theme.textColor, fontSize: 12 }}>Aa</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* The admin site's shared backgrounds, then the church's own uploads. */}
          {uploads &&
            ([
              ["Library", uploads.filter((u) => u.shared)],
              ["Your backgrounds", uploads.filter((u) => !u.shared)],
            ] as const).map(([title, list]) =>
              list.length > 0 ? (
                <div key={title}>
                  <p className="mb-1.5 px-1 text-xs font-bold text-muted">{title}</p>
                  <div className="grid max-h-28 grid-cols-4 gap-1.5 overflow-y-auto">
                    {list.map((u) => {
                      const bg: Background = u.video ? { type: "video", url: u.url } : { type: "image", url: u.url };
                      return (
                        <button key={u.url} type="button" onClick={() => set({ background: bg })} className={`overflow-hidden rounded-md ${isBg(bg) ? "ring-2 ring-accent" : "ring-1 ring-line"}`}>
                          {u.video ? (
                            <video src={u.url} muted playsInline preload="metadata" className="aspect-video w-full object-cover" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element -- thumbnail of a background
                            <img src={u.url} alt="" className="aspect-video w-full object-cover" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null,
            )}

          <QuickSlider label="Darken" value={Math.round(theme.dim * 100)} min={0} max={80} step={5} suffix="%" onChange={(v) => set({ dim: v / 100 })} />
          <QuickSlider label="Size" value={Math.round(theme.scale * 100)} min={70} max={140} step={5} suffix="%" onChange={(v) => set({ scale: v / 100 })} />

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setEditing(true);
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-surface-2 py-2 text-xs font-bold text-muted transition hover:text-ink"
          >
            <SlidersHorizontal size={12} /> All display settings
          </button>
        </div>
      )}
      {editing && (
        <EditorModal
          churchId={churchId}
          kind={kind}
          display={display}
          onClose={() => setEditing(false)}
          onSaved={(d) => onChange(d)}
        />
      )}
    </div>
  );
}

// The full editor over the console, so a running service isn't interrupted.
function EditorModal({
  churchId,
  kind,
  display,
  onClose,
  onSaved,
}: {
  churchId: string;
  kind: keyof DisplaySettings;
  display: DisplaySettings;
  onClose: () => void;
  onSaved: (d: DisplaySettings) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label="Display"
      // Esc closes the editor; it never reaches the console (where Esc blanks the projector).
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className="m-auto max-h-[calc(100dvh-32px)] w-[min(1180px,calc(100vw-32px))] overflow-y-auto rounded-xl bg-bg p-0 text-ink shadow-pop ring-1 ring-line backdrop:bg-black/60"
    >
      <DisplayEditor churchId={churchId} display={display} initialKind={kind} variant="modal" onClose={onClose} onSaved={onSaved} />
    </dialog>
  );
}

function QuickSlider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 px-1">
      <span className="w-14 text-xs font-bold">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-[var(--color-accent-fill)]" />
      <span className="w-10 text-right text-xs text-muted tabular-nums">
        {value}
        {suffix}
      </span>
    </label>
  );
}
