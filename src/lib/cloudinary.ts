// Cloudinary, server side only: signing uploads and deleting files. The API
// secret never reaches the browser.
//   NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME  the account's cloud name
//   CLOUDINARY_API_KEY                 API key (Settings > API Keys)
//   CLOUDINARY_API_SECRET              API secret, server only
import { createHash } from "node:crypto";

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

export function cloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

/** Cloudinary's request signature: the params sorted, joined, then the secret, SHA-1. */
export function sign(params: Record<string, string | number>, secret: string): string {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(base + secret).digest("hex");
}

/** The projector copy of a video. Prepared at upload (see /api/backgrounds/sign), so it must match deliveryUrl exactly. */
export const VIDEO_TRANSFORM = "q_auto,w_1920,c_limit";

/** Where a church's backgrounds go in Cloudinary. */
export const churchFolder = (churchId: string) => `scriptures/backgrounds/${churchId}`;

/**
 * The link the projector loads: compressed for the screen and no wider than
 * 1920 px. Videos stay MP4 so every browser and vMix can play them.
 */
export function deliveryUrl(cloudName: string, kind: "image" | "video", publicId: string): string {
  const transform = kind === "image" ? "f_auto,q_auto,w_1920,c_limit" : VIDEO_TRANSFORM;
  const ext = kind === "video" ? ".mp4" : "";
  return `https://res.cloudinary.com/${cloudName}/${kind}/upload/${transform}/${publicId}${ext}`;
}

/** Deletes a file from Cloudinary. Missing files count as deleted. */
export async function destroy(config: CloudinaryConfig, kind: "image" | "video", publicId: string): Promise<boolean> {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: config.apiKey,
    signature: sign({ public_id: publicId, timestamp }, config.apiSecret),
  });
  const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/${kind}/destroy`, { method: "POST", body });
  if (!res.ok) return false;
  const data = (await res.json()) as { result?: string };
  return data.result === "ok" || data.result === "not found";
}
