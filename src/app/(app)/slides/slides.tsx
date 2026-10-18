"use client";

import { ImagePlus, Maximize, MonitorOff, MonitorUp, Pencil, Plus, ScreenShare, ScreenShareOff, Trash2, Type, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmDialog } from "@/components/confirm";
import { SlideView } from "@/components/slide-view";
import { Button, Chip, IconButton, Notice } from "@/components/ui";
import { cleanDisplay, type DisplaySettings } from "@/lib/display/theme";
import { closeProjector, fillProjectorScreen, presentOnProjector, useProjectorOpen } from "@/lib/live/present";
import { CONSOLE_CHANNEL, ScreenSender, type ConsoleMessage } from "@/lib/live/screen";
import type { Slide } from "@/lib/scripture/bible";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useLeaveWarning } from "@/lib/use-leave-warning";

export interface SavedSlide {
  id: string;
  kind: "text" | "image";
  title: string;
  body: string;
  image_url: string | null;
  position: number;
}

const IMAGE_MAX = 8 * 1024 * 1024;

/** What goes to the screen for a saved slide. */
function toSlide(s: SavedSlide): Slide {
  return s.kind === "image"
    ? { kind: "image", image: s.image_url ?? "", label: s.title, translation: "", lines: [] }
    : { kind: "text", label: s.title, translation: "", lines: s.body.split("\n").filter((l) => l.trim()).map((text) => ({ verse: 0, text })) };
}

const nameOf = (s: SavedSlide) => s.title || (s.kind === "image" ? "Picture" : s.body.split("\n").find((l) => l.trim()) || "Text slide");

export function Slides({
  churchId,
  userId,
  screenToken,
  display: initialDisplay,
  initial,
}: {
  churchId: string;
  userId: string;
  screenToken: string;
  display: DisplaySettings;
  initial: SavedSlide[];
}) {
  const [slides, setSlides] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial[0]?.id ?? null);
  /** On screen now, if one of these slides is. */
  const [onAir, setOnAir] = useState<string | null>(null);
  const [editing, setEditing] = useState<SavedSlide | "new" | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useLeaveWarning(uploading !== null);

  // ---- The screen ------------------------------------------------------------
  const [token, setToken] = useState(screenToken);
  const [display, setDisplay] = useState(initialDisplay);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(CONSOLE_CHANNEL);
    bc.onmessage = (e: MessageEvent<ConsoleMessage>) => {
      if (e.data?.type === "screen-token" && e.data.token) setToken(e.data.token);
      else if (e.data?.type === "display") setDisplay(cleanDisplay(e.data.display));
    };
    return () => bc.close();
  }, []);
  const screen = useRef<ScreenSender | null>(null);
  useEffect(() => {
    if (!token) return;
    const s = new ScreenSender(supabaseBrowser(), churchId, token);
    screen.current = s;
    return () => s.close();
  }, [churchId, token]);
  // Text slides wear the scripture look from Design.
  useEffect(() => {
    if (screen.current) screen.current.theme = display.scripture;
  }, [display, token]);

  const show = useCallback((s: SavedSlide) => {
    void screen.current?.show(toSlide(s));
    setOnAir(s.id);
    setSelected(s.id);
  }, []);
  const clear = useCallback(() => {
    void screen.current?.show(null);
    setOnAir(null);
  }, []);

  const [outputUrl, setOutputUrl] = useState("");
  useEffect(() => setOutputUrl(token ? `${location.origin}/screen/${token}` : ""), [token]);
  const [presenting, setPresenting] = useState(false);
  const [projectorOpen, syncProjector, projectorFull] = useProjectorOpen();
  async function present() {
    if (!outputUrl) return;
    setPresenting(true);
    await presentOnProjector(outputUrl);
    setPresenting(false);
    syncProjector();
  }

  // Arrow keys step through the list; Enter or Space shows; Esc clears.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (editing || t.closest("input, textarea, [contenteditable], [role=dialog], dialog")) return;
      const i = slides.findIndex((s) => s.id === selected);
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        const next = slides[Math.min(slides.length - 1, i + 1)];
        if (next && onAir) show(next);
        else if (next) setSelected(next.id);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = slides[Math.max(0, i - 1)];
        if (prev && onAir) show(prev);
        else if (prev) setSelected(prev.id);
      } else if ((e.key === "Enter" || e.key === " ") && i >= 0) {
        e.preventDefault();
        show(slides[i]);
      } else if (e.key === "Escape") {
        clear();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides, selected, onAir, editing, show, clear]);

  // ---- Saving -----------------------------------------------------------------
  const nextPosition = () => (slides.length ? Math.max(...slides.map((s) => s.position)) + 1 : 0);

  async function saveText(title: string, body: string, existing: SavedSlide | null): Promise<string | void> {
    const supabase = supabaseBrowser();
    const row = { title: title.trim().slice(0, 120), body: body.trim().slice(0, 2000), updated_at: new Date().toISOString() };
    const { data, error } = existing
      ? await supabase.from("slides").update(row).eq("id", existing.id).select("id, kind, title, body, image_url, position").single()
      : await supabase
          .from("slides")
          .insert({ ...row, church_id: churchId, kind: "text", position: nextPosition(), created_by: userId })
          .select("id, kind, title, body, image_url, position")
          .single();
    if (error || !data) return error?.message ?? "Couldn't save the slide.";
    const saved = data as SavedSlide;
    setSlides((all) => (existing ? all.map((s) => (s.id === saved.id ? saved : s)) : [...all, saved]));
    setSelected(saved.id);
    setEditing(null);
    // Edited while on screen: the screen shows the new words.
    if (onAir === saved.id) show(saved);
  }

  async function upload(file: File) {
    setError("");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError("Use a JPG, PNG or WebP picture.");
    if (file.size > IMAGE_MAX) return setError("That picture is over 8 MB. Save a smaller copy (1920 pixels wide is plenty).");
    setUploading(0);
    try {
      const signRes = await fetch("/api/slides/sign", { method: "POST" });
      const signed = await signRes.json().catch(() => ({}));
      if (!signRes.ok) throw new Error(signed.error ?? "Couldn't start the upload.");
      const form = new FormData();
      for (const [k, v] of Object.entries(signed.fields as Record<string, string>)) form.append(k, v);
      form.append("file", file, file.name);
      const uploaded = await new Promise<{ public_id: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", signed.url);
        xhr.upload.onprogress = (e) => e.total && setUploading(e.loaded / e.total);
        xhr.onload = () => {
          const d = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300) resolve(d);
          else reject(new Error(d.error?.message ? `Upload failed: ${d.error.message}` : "Upload failed."));
        };
        xhr.onerror = () => reject(new Error("Upload failed. Check the connection and try again."));
        xhr.send(form);
      });
      const res = await fetch("/api/slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_id: uploaded.public_id, title: file.name.replace(/\.[^.]+$/, "").slice(0, 120), position: nextPosition() }),
      });
      const saved = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(saved.error ?? "Couldn't save the picture.");
      setSlides((all) => [...all, saved as SavedSlide]);
      setSelected((saved as SavedSlide).id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(null);
    }
  }

  async function remove(s: SavedSlide) {
    const ok = await confirmDialog({ title: `Delete "${nameOf(s)}"?`, body: "It's removed from your church's slides.", confirmLabel: "Delete", danger: true });
    if (!ok) return;
    const res = await fetch(`/api/slides/${s.id}`, { method: "DELETE" });
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't delete it.");
    if (onAir === s.id) clear();
    setSlides((all) => all.filter((x) => x.id !== s.id));
    setSelected((cur) => (cur === s.id ? null : cur));
  }

  const current = slides.find((s) => s.id === selected) ?? null;

  return (
    <div className="flex flex-col gap-2 px-2 pb-2 lg:grid lg:h-[calc(100dvh-4rem)] lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
      {/* Preview and screen controls */}
      <div className="flex min-h-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface px-4 py-3">
          {onAir ? (
            <Chip tone="live">On screen: {nameOf(slides.find((s) => s.id === onAir) ?? { title: "", kind: "text", body: "", id: "", image_url: null, position: 0 })}</Chip>
          ) : (
            <Chip>Nothing on screen from Slides</Chip>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button size="sm" variant="outline" className="h-10" disabled={!onAir} onClick={clear} title="Clear the screen (Esc)">
              <ScreenShareOff size={14} /> Clear
            </Button>
            {projectorOpen && !projectorFull && (
              <Button size="sm" variant="outline" className="h-10" onClick={fillProjectorScreen} title="The projector window isn't full screen yet. Click to fill it.">
                <Maximize size={14} /> Fill projector screen
              </Button>
            )}
            {projectorOpen ? (
              <Button size="sm" variant="secondary" className="h-10" onClick={() => (closeProjector(), syncProjector())}>
                <MonitorOff size={14} /> Stop presenting
              </Button>
            ) : (
              <Button size="sm" className="h-10" loading={presenting} disabled={!outputUrl} onClick={() => void present()}>
                <MonitorUp size={14} /> Present
              </Button>
            )}
          </div>
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-surface p-3">
          {current ? (
            <>
              <div className="overflow-hidden rounded-lg ring-1 ring-line">
                <div className="aspect-video">
                  <SlideView slide={toSlide(current)} theme={current.kind === "text" ? display.scripture : undefined} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-bold">{nameOf(current)}</p>
                {current.kind === "text" && (
                  <IconButton label="Edit" onClick={() => setEditing(current)}>
                    <Pencil size={16} />
                  </IconButton>
                )}
                <IconButton label="Delete" onClick={() => void remove(current)} className="hover:text-negative">
                  <Trash2 size={16} />
                </IconButton>
                <Button onClick={() => show(current)} disabled={onAir === current.id}>
                  <ScreenShare size={15} /> {onAir === current.id ? "On screen" : "Show"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted">
                Arrow keys move through the list (and change what&apos;s on screen while a slide is up). Enter shows the selected slide; Esc clears.
              </p>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-center text-sm text-muted">
              <p className="max-w-xs">
                Announcements, notices, welcome messages, flyers. Make a text slide or upload a picture; they&apos;re kept for next week.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* The saved slides */}
      <aside className="flex min-h-[420px] flex-col gap-3 rounded-lg bg-surface p-3 lg:min-h-0">
        <div className="flex items-center gap-2 px-1 pt-1">
          <h2 className="font-bold">Slides</h2>
          <span className="text-sm text-faint tabular-nums">{slides.length}</span>
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
              <Type size={14} /> Text
            </Button>
            <Button size="sm" variant="secondary" loading={uploading !== null} onClick={() => fileInput.current?.click()}>
              {uploading === null ? <ImagePlus size={14} /> : null}
              {uploading === null ? "Picture" : `${Math.round(uploading * 100)}%`}
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </div>

        {editing && (
          <TextEditor
            key={editing === "new" ? "new" : editing.id}
            existing={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSave={(title, body) => saveText(title, body, editing === "new" ? null : editing)}
          />
        )}

        <ol className="-mx-1 min-h-0 flex-1 space-y-1 overflow-y-auto px-1">
          {slides.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelected(s.id)}
                onDoubleClick={() => show(s)}
                className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition ${s.id === selected ? "bg-surface-3" : "hover:bg-surface-2"}`}
              >
                <span className="grid aspect-video w-20 shrink-0 place-items-center overflow-hidden rounded bg-black">
                  {s.kind === "image" && s.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a thumbnail of the church's own picture
                    <img src={s.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Type size={16} className="text-white/60" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{nameOf(s)}</span>
                  {s.kind === "text" && <span className="block truncate text-xs text-muted">{s.body.split("\n").filter(Boolean).join(" · ")}</span>}
                </span>
                {onAir === s.id && <span className="h-2 w-2 shrink-0 rounded-full bg-negative" title="On screen" />}
              </button>
            </li>
          ))}
          {!slides.length && !editing && <li className="px-2 py-6 text-center text-sm text-faint">No slides yet.</li>}
        </ol>
      </aside>
    </div>
  );
}

function TextEditor({
  existing,
  onCancel,
  onSave,
}: {
  existing: SavedSlide | null;
  onCancel: () => void;
  onSave: (title: string, body: string) => Promise<string | void>;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-2 rounded-lg bg-surface-2 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!body.trim()) return setError("Write the words for the slide.");
        setSaving(true);
        const err = await onSave(title, body);
        setSaving(false);
        if (err) setError(err);
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">{existing ? "Edit text slide" : "New text slide"}</p>
        <IconButton label="Cancel" onClick={onCancel} className="h-8 w-8">
          <X size={15} />
        </IconButton>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Name, for the list (e.g. Welcome)"
        className="inset-field h-10 w-full rounded-md bg-bg px-3 text-sm"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        rows={5}
        autoFocus
        placeholder={"The words on screen, one line per line\ne.g. Welcome to church!\nService starts at 9am"}
        className="inset-field w-full resize-y rounded-md bg-bg px-3 py-2 text-sm"
      />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={saving}>
          {saving ? null : <Plus size={13} />} {existing ? "Save" : "Add slide"}
        </Button>
      </div>
    </form>
  );
}
