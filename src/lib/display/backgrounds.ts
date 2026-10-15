"use client";

// A church's uploaded backgrounds, in the browser. Files go straight to
// Cloudinary with a signature from our server; the server then records them.
import { GRADIENTS } from "@/lib/display/theme";
import type { Plan } from "@/lib/plans";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface UploadedBackground {
  id: string;
  kind: "image" | "video";
  url: string;
  /** Shared backgrounds come from the admin site; every church can pick them. */
  shared: boolean;
  name: string;
}

export const IMAGE_MAX = 8 * 1024 * 1024;
export const VIDEO_MAX = 80 * 1024 * 1024;
/** Big files go up in 20 MB pieces: a dropped connection costs one piece, not the whole video. */
const CHUNK = 20 * 1024 * 1024;
export const VIDEO_SECONDS = 30;

/** The church's plan, for the background limit. */
export async function churchPlan(churchId: string): Promise<Plan> {
  const { data } = await supabaseBrowser().rpc("church_plan", { p_church: churchId });
  return data === "paid" ? "paid" : "free";
}

/** The shared library and the church's own uploads, newest first. */
export async function listBackgrounds(): Promise<UploadedBackground[]> {
  const { data } = await supabaseBrowser().from("backgrounds").select("id, kind, url, name, church_id").order("created_at", { ascending: false }).limit(200);
  return (data ?? []).map((r) => ({ id: r.id, kind: r.kind, url: r.url, name: r.name ?? "", shared: r.church_id === null }));
}

export interface GradientPreset {
  /** Empty for the built-in stand-ins, which can't be deleted. */
  id: string;
  name: string;
  from: string;
  to: string;
  angle: number;
  /** From the admin site, for every church; otherwise the church's own. */
  shared: boolean;
}

interface GradientRow {
  id: string;
  name: string;
  from_color: string;
  to_color: string;
  angle: number;
  church_id: string | null;
}
const fromRow = (g: GradientRow): GradientPreset => ({ id: g.id, name: g.name, from: g.from_color, to: g.to_color, angle: g.angle, shared: g.church_id === null });

/**
 * The one-click gradients: the shared ones from the admin site, then the
 * church's saved ones. The ones built into the code stand in until migration
 * 0016 has run.
 */
export async function listGradients(): Promise<GradientPreset[]> {
  const { data, error } = await supabaseBrowser().from("gradients").select("id, name, from_color, to_color, angle, church_id").order("created_at");
  if (error || !data) return GRADIENTS.map((g) => ({ ...g, id: "", shared: true }));
  return (data as GradientRow[]).map(fromRow);
}

/** Saves a gradient for this church to reuse. Throws an Error with a message to show (the plan's limit, say). */
export async function saveGradient(churchId: string, g: { name: string; from: string; to: string; angle: number }): Promise<GradientPreset> {
  const { data, error } = await supabaseBrowser()
    .from("gradients")
    .insert({ church_id: churchId, name: g.name.slice(0, 40), from_color: g.from, to_color: g.to, angle: Math.round(g.angle) })
    .select("id, name, from_color, to_color, angle, church_id")
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data as GradientRow);
}

export async function deleteGradient(id: string): Promise<void> {
  const { error } = await supabaseBrowser().from("gradients").delete().eq("id", id).not("church_id", "is", null);
  if (error) throw new Error(error.message);
}

function videoSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(v.src);
      resolve(v.duration);
    };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

/** Checks the file, uploads it and records it. Throws an Error with a message to show. */
export async function uploadBackground(file: File, onProgress?: (fraction: number) => void): Promise<UploadedBackground> {
  const video = file.type.startsWith("video/");
  if (!/^(image\/(jpeg|png|webp)|video\/(mp4|webm|quicktime))$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP picture, or an MP4, MOV or WebM video.");
  if (!video && file.size > IMAGE_MAX) throw new Error("That picture is over 8 MB. Save a smaller copy (1920 pixels wide is plenty).");
  if (video && file.size > VIDEO_MAX) throw new Error("That video is over 80 MB. Use a shorter loop, or export it at a lower bitrate.");
  if (video && (await videoSeconds(file)) > VIDEO_SECONDS + 1) throw new Error(`Background videos must be ${VIDEO_SECONDS} seconds or shorter. They loop, so a short one works.`);

  const signRes = await fetch("/api/backgrounds/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: video ? "video" : "image" }),
  });
  const signed = await signRes.json().catch(() => ({}));
  if (!signRes.ok) throw new Error(signed.error ?? "Couldn't start the upload.");

  const uploaded = await sendToCloudinary(signed.url, signed.fields as Record<string, string>, file, onProgress);

  const res = await fetch("/api/backgrounds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(uploaded),
  });
  const saved = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(saved.error ?? "Couldn't save the upload.");
  return { ...(saved as UploadedBackground), shared: false, name: "" };
}

interface CloudinaryResult {
  public_id: string;
  resource_type: string;
  bytes: number;
}

/** One request, with progress (XMLHttpRequest: fetch can't report upload progress). */
function post(url: string, form: FormData, headers: Record<string, string>, onProgress: (loaded: number) => void): Promise<CloudinaryResult & { done?: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      const data = JSON.parse(xhr.responseText || "{}");
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.error?.message ? `Upload failed: ${data.error.message}` : "Upload failed."));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check the connection and try again."));
    xhr.send(form);
  });
}

/**
 * Uploads to Cloudinary: in one go, or for big files in 20 MB pieces (the
 * same signed fields on each, tied together by an upload id). The last
 * piece's answer describes the whole file.
 */
async function sendToCloudinary(url: string, fields: Record<string, string>, file: File, onProgress?: (fraction: number) => void): Promise<CloudinaryResult> {
  const form = (blob: Blob) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    f.append("file", blob, file.name);
    return f;
  };
  if (file.size <= CHUNK) return post(url, form(file), {}, (loaded) => onProgress?.(loaded / file.size));

  const uploadId = crypto.randomUUID();
  let result: CloudinaryResult | null = null;
  for (let start = 0; start < file.size; start += CHUNK) {
    const end = Math.min(start + CHUNK, file.size);
    result = await post(url, form(file.slice(start, end)), { "X-Unique-Upload-Id": uploadId, "Content-Range": `bytes ${start}-${end - 1}/${file.size}` }, (loaded) =>
      onProgress?.((start + loaded) / file.size),
    );
  }
  return result!;
}

export async function deleteBackground(id: string): Promise<void> {
  const res = await fetch(`/api/backgrounds/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't delete it.");
}
