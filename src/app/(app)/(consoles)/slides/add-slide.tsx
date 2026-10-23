"use client";

import { Film, ImagePlus, Type, X } from "lucide-react";

// A new slide, before it's anything: what should it be? Text, a picture
// (or two side by side), or a video (Pro). Shown as a card at the end of a
// presentation's slides, and large in the preview for a presentation's
// first slide.

export function AddSlideChoice({
  big = false,
  first = false,
  videoAllowed,
  mediaFull,
  uploading,
  onText,
  onPicture,
  onVideo,
  onCancel,
}: {
  /** The large version, for the preview area. */
  big?: boolean;
  /** The presentation's first slide. */
  first?: boolean;
  videoAllowed: boolean;
  /** The plan's picture and video slides are all used. */
  mediaFull: boolean;
  /** Upload progress, 0 to 1, while one is going. */
  uploading: number | null;
  onText: () => void;
  onPicture: () => void;
  onVideo: () => void;
  onCancel?: () => void;
}) {
  const option = `flex flex-col items-center justify-center gap-1.5 rounded-lg bg-surface-2 font-bold transition hover:bg-surface-3 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${
    big ? "h-32 text-sm" : "h-20 text-xs"
  }`;
  const size = big ? 24 : 18;
  return (
    <div className={`rounded-lg ${big ? "w-full max-w-lg" : "border-2 border-dashed border-line-strong p-2"}`}>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className={`font-bold ${big ? "text-base" : "text-sm"}`}>{first ? "Add your first slide" : "New slide"}</p>
        {onCancel && (
          <button type="button" onClick={onCancel} aria-label="Cancel" className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink">
            <X size={14} />
          </button>
        )}
      </div>
      {uploading !== null ? (
        <div className={`grid place-items-center rounded-lg bg-surface-2 text-sm font-bold ${big ? "h-32" : "h-20"}`}>Uploading {Math.round(uploading * 100)}%</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={onText} className={option}>
            <Type size={size} /> Text
          </button>
          <button type="button" onClick={onPicture} disabled={mediaFull} className={option} title={mediaFull ? "Your plan's picture slides are all used" : "One picture, or two side by side"}>
            <ImagePlus size={size} /> Picture
          </button>
          <button type="button" onClick={onVideo} disabled={videoAllowed && mediaFull} className={`${option} relative`} title={videoAllowed ? "A video" : "Video slides are on the Paid plan"}>
            <Film size={size} /> Video
            <span className="absolute top-1.5 right-1.5 rounded-full bg-accent-fill px-1.5 py-px text-[9px] leading-tight font-bold tracking-wide text-on-accent">PRO</span>
          </button>
        </div>
      )}
    </div>
  );
}
