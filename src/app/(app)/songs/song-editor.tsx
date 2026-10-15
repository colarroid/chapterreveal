"use client";

import { ChevronRight, Sparkles, Undo2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Field, IconButton, Notice } from "@/components/ui";
import { parsePastedLyrics } from "@/lib/songs/paste";
import { slidesToText, textToSlides, type SongSlide } from "@/lib/songs/songs";

export interface SongFields {
  title: string;
  author: string;
  copyright: string;
  ccli_number: string;
  slides: SongSlide[];
}

/**
 * Adding or editing a song. Lyrics pasted from Google or a lyrics site are
 * tidied as they land: site text dropped, parts labelled, slides split.
 * The caller saves; `onSave` returns an error message or nothing.
 */
export function SongEditor({
  initial,
  heading,
  onSave,
  onCancel,
}: {
  initial: SongFields | null;
  heading: string;
  onSave: (fields: SongFields) => Promise<string | void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [author, setAuthor] = useState(initial?.author ?? "");
  const [copyright, setCopyright] = useState(initial?.copyright ?? "");
  const [ccli, setCcli] = useState(initial?.ccli_number ?? "");
  const [text, setText] = useState(initial ? slidesToText(initial.slides) : "");
  const [tidied, setTidied] = useState<{ raw: string; note: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const slides = useMemo(() => textToSlides(text), [text]);

  function tidy(raw: string) {
    const r = parsePastedLyrics(raw);
    if (!r.slides.length) return false;
    setText(slidesToText(r.slides));
    if (!title.trim() && r.title) setTitle(r.title);
    if (!author.trim() && r.author) setAuthor(r.author);
    const parts = [...new Set(r.slides.map((s) => s.label?.replace(/\s+\d+$/, "")).filter(Boolean))];
    setTidied({
      raw,
      note: [
        `${r.slides.length} ${r.slides.length === 1 ? "slide" : "slides"}`,
        parts.length ? `found ${parts.join(", ")}` : "",
        r.dropped ? `removed ${r.dropped} ${r.dropped === 1 ? "line" : "lines"} of website text` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    });
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slides.length) return setError("Add the words: put a blank line between slides.");
    setSaving(true);
    setError("");
    const err = await onSave({ title: title.trim(), author: author.trim(), copyright: copyright.trim(), ccli_number: ccli.trim(), slides });
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-4">
        <h2 className="flex-1 text-xl font-bold">{heading}</h2>
        <IconButton label="Close" onClick={onCancel}>
          <X size={18} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
          <Field label="Author (optional)" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={200} />
        </div>
        <label className="block">
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold">Lyrics</span>
            <span className="text-xs text-muted">
              {slides.length} {slides.length === 1 ? "slide" : "slides"}
            </span>
            <button
              type="button"
              onClick={() => tidy(text)}
              disabled={!text.trim()}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-muted transition hover:bg-surface-2 hover:text-ink disabled:opacity-40"
              title="Clean up lyrics typed or pasted in another layout"
            >
              <Sparkles size={13} /> Tidy up
            </button>
          </span>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTidied(null);
            }}
            onPaste={(e) => {
              // Tidy a paste that fills the box: into an empty box, or over all of it.
              const el = e.currentTarget;
              const whole = !el.value.trim() || (el.selectionStart === 0 && el.selectionEnd === el.value.length);
              const raw = e.clipboardData.getData("text/plain");
              if (whole && raw.trim() && tidy(raw)) e.preventDefault();
            }}
            rows={16}
            spellCheck={false}
            placeholder={"Paste the lyrics here, straight from Google or a lyrics site.\n\nOr type them: a blank line starts a new slide,\nand [Chorus] on a slide's first line labels it."}
            className="inset-field mt-1.5 block w-full rounded-md bg-bg px-3.5 py-3 font-mono text-[13px] leading-relaxed text-ink placeholder:font-sans placeholder:text-faint"
          />
        </label>
        {tidied && (
          <div className="flex items-center gap-2 rounded-lg bg-accent-fill/10 px-3.5 py-2.5 text-sm">
            <Sparkles size={15} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1">Tidied the pasted lyrics: {tidied.note}.</span>
            <button
              type="button"
              onClick={() => {
                setText(tidied.raw);
                setTidied(null);
              }}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-muted hover:text-ink"
            >
              <Undo2 size={13} /> Undo
            </button>
          </div>
        )}
        {/* Optional, so out of the way: open only when the song already has them. */}
        <details open={!!(initial?.copyright || initial?.ccli_number)} className="group rounded-lg bg-surface-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-sm font-bold select-none">
            <ChevronRight size={15} className="text-muted transition group-open:rotate-90" />
            Copyright and CCLI
            <span className="font-normal text-muted">optional</span>
          </summary>
          <div className="grid gap-4 px-3.5 pb-4 sm:grid-cols-[1fr_160px]">
            <Field label="Copyright" value={copyright} onChange={(e) => setCopyright(e.target.value)} maxLength={300} placeholder="© 2018 …" />
            <Field label="CCLI song number" value={ccli} onChange={(e) => setCcli(e.target.value)} maxLength={20} inputMode="numeric" />
          </div>
          <p className="px-3.5 pb-3.5 text-xs text-muted">Leave empty for songs that aren&apos;t in CCLI&apos;s catalogue, like most local choruses.</p>
        </details>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-line px-5 py-3">
        <Button type="submit" loading={saving}>
          {initial ? "Save changes" : "Add song"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
