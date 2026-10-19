import { churchFolder, deliveryUrl } from "@/lib/cloudinary";

/** One picture on a picture slide, as stored in slides.images. */
export interface SlideImage {
  url: string;
  public_id: string;
}

/** A Cloudinary id in this church's own folder, or null. */
export function ownPublicId(churchId: string, value: unknown): string | null {
  return typeof value === "string" && value.startsWith(`${churchFolder(churchId)}/`) && /^[\w/-]+$/.test(value) ? value : null;
}

export const imageEntry = (cloudName: string, publicId: string): SlideImage => ({ url: deliveryUrl(cloudName, "image", publicId), public_id: publicId });
