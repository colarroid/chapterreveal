"use client";

import { ArrowLeft, Check, ImagePlus, LoaderCircle, Plus, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { confirmDialog } from "@/components/confirm";
import { Dropdown } from "@/components/dropdown";
import { SlideView } from "@/components/slide-view";
import { Button, IconButton, Notice } from "@/components/ui";
import { backgroundCss, FONTS, PRESETS, type Background, type DisplaySettings, type DisplayTheme, type FontKey } from "@/lib/display/theme";
import { churchPlan, deleteBackground, deleteGradient, listBackgrounds, listGradients, saveGradient, uploadBackground, VIDEO_MAX, VIDEO_SECONDS, type GradientPreset, type UploadedBackground } from "@/lib/display/backgrounds";
import { limitText, PLAN_LIMITS, planName, type Plan } from "@/lib/plans";
import { CONSOLE_CHANNEL, type ConsoleMessage } from "@/lib/live/screen";
import type { Slide } from "@/lib/scripture/bible";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLeaveWarning } from "@/lib/use-leave-warning";

type Kind = keyof DisplaySettings;

const SAMPLE: Record<Kind, Slide> = {
  scripture: {
    label: "Psalm 23:1-2",
    translation: "KJV",
    lines: [
      { verse: 1, text: "The LORD is my shepherd; I shall not want." },
      { verse: 2, text: "He maketh me to lie down in green pastures: he leadeth me beside the still waters." },
    ],
  },
  songs: {
    kind: "song",
    label: "Sample",
    translation: "",
    lines: [{ verse: 0, text: "Great is Thy faithfulness" }, { verse: 0, text: "Morning by morning new mercies I see" }],
  },
};

interface Upload {
  id: string;
  url: string;
  video: boolean;
  shared: boolean;
  name: string;
}

const toUpload = (b: UploadedBackground): Upload => ({ id: b.id, url: b.url, video: b.kind === "video", shared: b.shared, name: b.name });

/**
 * The full display editor: the Settings → Display page, and the modal the
 * consoles open from Design so the service keeps running.
 */
export function DisplayEditor({
  churchId,
  display,
  initialKind = "scripture",
  variant = "page",
  onClose,
  onSaved,
}: {
  churchId: string;
  display: DisplaySettings;
  initialKind?: Kind;
  variant?: "page" | "modal";
  onClose?: () => void;
  /** After a save, with what was saved (the console switches to it). */
  onSaved?: (display: DisplaySettings) => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [draft, setDraft] = useState(display);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const theme = draft[kind];
  const changed = JSON.stringify(draft) !== JSON.stringify(display);

  const set = (patch: Partial<DisplayTheme>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [kind]: { ...d[kind], ...patch, preset: patch.preset ?? "custom" } }));
  };
  const setBackground = (background: Background) => set({ background });

  // ---- Uploaded backgrounds ------------------------------------------------
  // Stored in Cloudinary; the list comes from the backgrounds table.
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  // Ask before a refresh or close cuts off an upload.
  useLeaveWarning(progress !== null);
  // The plan decides how many backgrounds the church can keep.
  const [plan, setPlan] = useState<Plan>("free");
  useEffect(() => {
    void churchPlan(churchId).then(setPlan);
  }, [churchId]);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    void listBackgrounds().then((list) => setUploads(list.map(toUpload)));
  }, [churchId]);

  async function upload(file: File) {
    setError("");
    setProgress(0);
    try {
      const item = toUpload(await uploadBackground(file, setProgress));
      setUploads((u) => [item, ...u]);
      setBackground({ type: item.video ? "video" : "image", url: item.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  }

  async function removeUpload(u: Upload) {
    const inUse = (["scripture", "songs"] as Kind[]).filter((k) => {
      const b = draft[k].background;
      return (b.type === "image" || b.type === "video") && b.url === u.url;
    });
    const ok = await confirmDialog({
      title: "Delete this background?",
      body: inUse.length ? `It's in use for ${inUse.join(" and ")}; those go back to black.` : "It's removed from your church's backgrounds.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteBackground(u.id);
    } catch (e) {
      return setError(e instanceof Error ? e.message : "Couldn't delete it.");
    }
    setUploads((all) => all.filter((x) => x.id !== u.id));
    for (const k of inUse) setDraft((d) => ({ ...d, [k]: { ...d[k], background: { type: "color", color: "#000000" } } }));
  }

  async function save() {
    const missing = (["scripture", "songs"] as Kind[]).find((k) => {
      const b = draft[k].background;
      return (b.type === "image" || b.type === "video") && !b.url;
    });
    if (missing) {
      setKind(missing);
      return setError(`Pick or upload a ${draft[missing].background.type === "video" ? "video" : "picture"} for ${missing}, or choose a colour.`);
    }
    setSaving(true);
    setError("");
    // The newest settings, read now, so nothing else in them is overwritten.
    const supabase = supabaseBrowser();
    const { data: current } = await supabase.from("churches").select("settings").eq("id", churchId).single();
    const { error } = await supabase
      .from("churches")
      .update({ settings: { ...((current?.settings as Record<string, unknown>) ?? {}), display: draft } })
      .eq("id", churchId);
    setSaving(false);
    if (error) return setError(error.message);
    // Consoles open in this browser switch to the new look at once; others on their next reload.
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(CONSOLE_CHANNEL);
      bc.postMessage({ type: "display", display: draft } satisfies ConsoleMessage);
      bc.close();
    }
    setSaved(true);
    onSaved?.(draft);
    if (variant === "page") router.refresh();
  }

  const bgType = theme.background.type;
  const media = useMemo(() => uploads.filter((u) => u.video === (bgType === "video")), [uploads, bgType]);
  const library = media.filter((u) => u.shared);
  const own = media.filter((u) => !u.shared);
  // The plan's allowance for this kind. Only the church's own uploads count; the shared library is free.
  const mediaKind = bgType === "video" ? "video" : "image";
  const limit = PLAN_LIMITS[plan][mediaKind];
  const ownCount = own.length;
  const full = ownCount >= limit;
  const thumb = (u: Upload) => {
    const active = (theme.background.type === "image" || theme.background.type === "video") && theme.background.url === u.url;
    return (
      <div key={u.id} className={`group relative overflow-hidden rounded-lg ${active ? "ring-2 ring-accent" : "ring-1 ring-line"}`}>
        <button
          type="button"
          title={u.name || undefined}
          onClick={() => setBackground({ type: u.video ? "video" : "image", url: u.url })}
          className="block aspect-video w-full bg-black"
        >
          {u.video ? (
            <video src={u.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a thumbnail of an uploaded background
            <img src={u.url} alt="" className="h-full w-full object-cover" />
          )}
        </button>
        {!u.shared && (
          <button
            type="button"
            aria-label="Delete this background"
            onClick={() => void removeUpload(u)}
            className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
          >
            <X size={13} />
          </button>
        )}
      </div>
    );
  };

  return (
    <Shell variant={variant}>
      {variant === "page" && (
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} /> Settings
        </Link>
      )}
      <div className={`flex flex-wrap items-end gap-3 ${variant === "page" ? "mt-2" : ""}`}>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">Display</h1>
          <p className="mt-1 text-sm text-muted">How the projector looks behind the words. Scripture and songs each have their own look.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={!changed || saving} onClick={() => setDraft(display)}>
            <RotateCcw size={14} /> Undo changes
          </Button>
          <Button loading={saving} disabled={!changed} onClick={() => void save()}>
            {saved && !changed ? <Check size={15} /> : null}
            {saved && !changed ? "Saved" : "Save"}
          </Button>
          {onClose && (
            <IconButton label="Close" onClick={onClose} className="h-11 w-11">
              <X size={18} />
            </IconButton>
          )}
        </div>
      </div>

      {/* Scripture / Songs */}
      <div className="mt-5 inline-flex rounded-full bg-surface p-1">
        {(["scripture", "songs"] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`h-8 rounded-full px-4 text-sm transition ${kind === k ? "bg-surface-3 font-bold text-ink" : "text-muted hover:text-ink"}`}
          >
            {k === "scripture" ? "Scripture" : "Songs"}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-start">
        {/* Controls */}
        <div className="space-y-4">
          <Panel title="Start from">
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-4">
              {PRESETS.map((p) => {
                const f = FONTS.find((x) => x.key === p.theme.font)!;
                const active = theme.preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => set({ ...p.theme, uppercase: kind === "songs" ? theme.uppercase : false })}
                    title={p.name}
                    className={`overflow-hidden rounded-lg text-left ring-offset-2 ring-offset-surface transition ${active ? "ring-2 ring-accent" : "ring-1 ring-line hover:ring-line-strong"}`}
                  >
                    <span className="grid aspect-video place-items-center" style={{ background: backgroundCss(p.theme.background) }}>
                      <span style={{ fontFamily: f.family, fontWeight: f.weight, color: p.theme.textColor, fontSize: 16 }}>Aa</span>
                    </span>
                    <span className="block truncate bg-surface-2 px-2 py-1 text-[11px] font-bold">{p.name}</span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Background">
            <Segmented
              value={bgType}
              options={[
                ["color", "Colour"],
                ["gradient", "Gradient"],
                ["image", "Picture"],
                ["video", "Video"],
              ]}
              onChange={(t) => {
                if (t === "color") setBackground({ type: "color", color: theme.background.type === "gradient" ? theme.background.from : "#000000" });
                else if (t === "gradient") setBackground({ type: "gradient", from: "#0b1a3a", to: "#020617", angle: 160 });
                else {
                  const first = uploads.find((u) => u.video === (t === "video"));
                  if (first) setBackground({ type: t as "image" | "video", url: first.url });
                  else set({ background: { type: t as "image" | "video", url: "" } as Background });
                }
              }}
            />
            {theme.background.type === "color" && (
              <ColorField label="Colour" value={theme.background.color} onChange={(c) => setBackground({ type: "color", color: c })} />
            )}
            {theme.background.type === "gradient" && (
              <GradientControls churchId={churchId} gradientLimit={PLAN_LIMITS[plan].gradient} plan={plan} background={theme.background} onChange={setBackground} />
            )}
            {(bgType === "image" || bgType === "video") && (
              <div className="space-y-2">
                {library.length > 0 && (
                  <>
                    <p className="text-xs font-bold text-muted">Library</p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{library.map(thumb)}</div>
                    <p className="pt-1 text-xs font-bold text-muted">Your uploads</p>
                  </>
                )}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {own.map(thumb)}
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={progress !== null || full}
                    title={full ? `The ${planName(plan)} plan includes ${limitText(mediaKind, limit)}` : "Upload"}
                    className="grid aspect-video place-items-center rounded-lg border-2 border-dashed border-line-strong text-muted transition hover:text-ink disabled:pointer-events-none disabled:opacity-40"
                  >
                    {progress !== null ? (
                      <span className="flex flex-col items-center gap-1 text-xs font-bold tabular-nums">
                        <LoaderCircle size={18} className="animate-spin" />
                        {Math.round(progress * 100)}%
                      </span>
                    ) : (
                      <ImagePlus size={18} />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted">
                  {bgType === "video"
                    ? `MP4, MOV or WebM, up to ${VIDEO_SECONDS} seconds and ${VIDEO_MAX / 1024 / 1024} MB. It loops silently.`
                    : "JPG, PNG or WebP, up to 8 MB. 1920 × 1080 is ideal."}
                </p>
                {/* The plan's allowance: pictures and videos together. */}
                {Number.isFinite(limit) &&
                  (full ? (
                    <p className="rounded-lg bg-warning/12 px-3 py-2 text-xs font-semibold text-warning">
                      You&apos;ve used {ownCount} of {limitText(mediaKind, limit)} on the {planName(plan)} plan. Delete one to upload another, or upgrade to a paid plan for more.
                    </p>
                  ) : (
                    <p className="text-xs text-faint">
                      {ownCount} of {limitText(mediaKind, limit)} used on the {planName(plan)} plan.
                    </p>
                  ))}
                <input
                  ref={fileInput}
                  type="file"
                  accept={bgType === "video" ? "video/mp4,video/quicktime,video/webm" : "image/jpeg,image/png,image/webp"}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = "";
                  }}
                />
              </div>
            )}
            <Slider label="Darken behind the words" value={Math.round(theme.dim * 100)} min={0} max={80} step={5} format={(v) => `${v}%`} onChange={(v) => set({ dim: v / 100 })} />
          </Panel>

          <Panel title="Words">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="text-sm font-bold">Font</span>
                <Dropdown
                  ariaLabel="Font"
                  value={theme.font}
                  onChange={(v) => set({ font: v as FontKey })}
                  options={FONTS.map((f) => ({ value: f.key, label: f.label }))}
                  className="mt-1.5 h-10 w-full text-sm"
                />
              </div>
              <Slider label="Size" value={Math.round(theme.scale * 100)} min={70} max={140} step={5} format={(v) => `${v}%`} onChange={(v) => set({ scale: v / 100 })} />
              <ColorField label="Text colour" value={theme.textColor} onChange={(c) => set({ textColor: c })} />
              <ColorField label={kind === "scripture" ? "Reference and verse numbers" : "Accent"} value={theme.accentColor} onChange={(c) => set({ accentColor: c })} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <div>
                <span className="mb-1.5 block text-sm font-bold">Position</span>
                <Segmented
                  value={theme.position}
                  options={[
                    ["top", "Top"],
                    ["middle", "Middle"],
                    ["bottom", "Bottom"],
                  ]}
                  onChange={(v) => set({ position: v as DisplayTheme["position"] })}
                />
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-bold">Align</span>
                <Segmented
                  value={theme.align}
                  options={[
                    ["center", "Centre"],
                    ["left", "Left"],
                  ]}
                  onChange={(v) => set({ align: v as DisplayTheme["align"] })}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={theme.shadow} onChange={(e) => set({ shadow: e.target.checked })} className="h-4 w-4 accent-[var(--color-accent-fill)]" />
                Shadow under the words
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={theme.uppercase} onChange={(e) => set({ uppercase: e.target.checked })} className="h-4 w-4 accent-[var(--color-accent-fill)]" />
                ALL CAPITALS
              </label>
            </div>
          </Panel>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-4">
          <div className="overflow-hidden rounded-lg shadow-pop ring-1 ring-line">
            <div className="aspect-video">
              <SlideView slide={SAMPLE[kind]} theme={theme} />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            Exactly as the projector shows it. After saving, open consoles on this computer switch at once; others the next time they&apos;re opened.
          </p>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ variant, children }: { variant: "page" | "modal"; children: React.ReactNode }) {
  return variant === "page" ? <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main> : <div className="p-5 sm:p-6">{children}</div>;
}

type Gradient = Extract<Background, { type: "gradient" }>;

function GradientControls({
  churchId,
  plan,
  gradientLimit,
  background,
  onChange,
}: {
  churchId: string;
  plan: Plan;
  gradientLimit: number;
  background: Gradient;
  onChange: (b: Background) => void;
}) {
  const set = (patch: Partial<Gradient>) => onChange({ ...background, ...patch });
  const [gradients, setGradients] = useState<GradientPreset[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void listGradients().then(setGradients);
  }, []);
  const library = gradients.filter((g) => g.shared);
  const saved = gradients.filter((g) => !g.shared);
  const same = (g: GradientPreset) => background.from === g.from && background.to === g.to && background.angle === g.angle;
  const alreadySaved = gradients.some(same);
  const full = saved.length >= gradientLimit;

  async function save() {
    setError("");
    setSaving(true);
    try {
      const g = await saveGradient(churchId, { name: `${background.from} → ${background.to}`, from: background.from, to: background.to, angle: background.angle });
      setGradients((all) => [...all, g]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save it.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(g: GradientPreset) {
    setError("");
    try {
      await deleteGradient(g.id);
      setGradients((all) => all.filter((x) => x.id !== g.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete it.");
    }
  }

  // Picking one keeps the animation choice.
  const swatch = (g: GradientPreset) => (
    <div key={g.id || g.name} className="group relative">
      <button
        type="button"
        title={g.name}
        aria-label={g.name}
        onClick={() => set({ from: g.from, to: g.to, angle: g.angle })}
        className={`block aspect-video w-full rounded-md ${same(g) ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : "ring-1 ring-line hover:ring-line-strong"}`}
        style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }}
      />
      {!g.shared && (
        <button
          type="button"
          aria-label="Delete this saved gradient"
          onClick={() => void remove(g)}
          className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
  const grid = "grid grid-cols-4 gap-1.5 sm:grid-cols-8 lg:grid-cols-4 xl:grid-cols-8";

  return (
    <div className="space-y-3">
      {library.length > 0 && (
        <>
          {saved.length > 0 && <p className="text-xs font-bold text-muted">Library</p>}
          <div className={grid}>{library.map(swatch)}</div>
        </>
      )}
      {saved.length > 0 && (
        <>
          <p className="text-xs font-bold text-muted">Saved</p>
          <div className={grid}>{saved.map(swatch)}</div>
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <ColorField label="From" value={background.from} onChange={(c) => set({ from: c })} />
        <ColorField label="To" value={background.to} onChange={(c) => set({ to: c })} />
        <Slider label="Direction" value={background.angle} min={0} max={360} step={5} format={(v) => `${v}°`} onChange={(v) => set({ angle: v })} />
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={!!background.animate}
          onChange={(e) => set({ animate: e.target.checked || undefined })}
          className="h-4 w-4 accent-[var(--color-accent-fill)]"
        />
        Animate gradient
        <span className="font-normal text-muted">the colours drift slowly</span>
      </label>
      {/* Keep a custom gradient to pick again later. Only this church sees it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button variant="outline" size="sm" loading={saving} disabled={alreadySaved || full} onClick={() => void save()}>
          {alreadySaved ? <Check size={13} /> : <Plus size={13} />}
          {alreadySaved ? "Saved" : "Save gradient"}
        </Button>
        {Number.isFinite(gradientLimit) && (
          <span className={`text-xs ${full ? "font-semibold text-warning" : "text-faint"}`}>
            {saved.length} of {limitText("gradient", gradientLimit)} saved on the {planName(plan)} plan{full ? ". Delete one to save another." : "."}
          </span>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg bg-surface p-4">
      <h2 className="text-sm font-bold text-muted">{title}</h2>
      {children}
    </section>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-full bg-surface-2 p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`h-8 rounded-full px-3.5 text-sm transition ${value === v ? "bg-surface-3 font-bold text-ink" : "text-muted hover:text-ink"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm font-bold">{label}</span>
      <span className="mt-1.5 flex h-10 items-center gap-2 rounded-md bg-bg px-2 ring-1 ring-line">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0" />
        <span className="font-mono text-xs text-muted uppercase">{value}</span>
      </span>
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm font-bold">
        {label}
        <span className="text-xs font-semibold text-muted tabular-nums">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2.5 w-full accent-[var(--color-accent-fill)]"
      />
    </label>
  );
}
