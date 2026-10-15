import { NextResponse } from "next/server";
import { churchFolder, cloudinaryConfig, sign, VIDEO_TRANSFORM } from "@/lib/cloudinary";
import { limitText, PLAN_LIMITS, type Plan } from "@/lib/plans";
import { supabaseServer } from "@/lib/supabase/server";
import { churchAdmin } from "../admin";

export const dynamic = "force-dynamic";

// A one-off signature so the browser can upload one background straight to
// Cloudinary, into this church's folder only. Valid for about an hour.
export async function POST(req: Request) {
  const admin = await churchAdmin();
  if (admin instanceof NextResponse) return admin;
  const config = cloudinaryConfig();
  if (!config) return NextResponse.json({ error: "Background uploads aren't set up yet (Cloudinary keys missing)." }, { status: 500 });
  const body = (await req.json().catch(() => ({}))) as { kind?: unknown };
  const kind = body.kind === "video" ? "video" : "image";

  // The plan's limit, checked before a big upload starts (the database
  // checks again when it's recorded).
  const supabase = await supabaseServer();
  const [{ data: plan }, { count }] = await Promise.all([
    supabase.rpc("church_plan", { p_church: admin.churchId }),
    supabase.from("backgrounds").select("id", { count: "exact", head: true }).eq("church_id", admin.churchId).eq("kind", kind),
  ]);
  const limit = (PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.free)[kind];
  if ((count ?? 0) >= limit) {
    return NextResponse.json({ error: `The Free plan includes ${limitText(kind, limit)}. Delete one, or upgrade to add more.`, limit: true }, { status: 402 });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = churchFolder(admin.churchId);
  // Videos: Cloudinary prepares the projector copy (1920 px MP4) straight
  // after upload, so a big original never has to be converted on demand.
  const params: Record<string, string | number> =
    kind === "video" ? { folder, timestamp, eager: `${VIDEO_TRANSFORM}/mp4`, eager_async: "true" } : { folder, timestamp };
  const fields: Record<string, string> = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return NextResponse.json({
    url: `https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`,
    fields: { ...fields, api_key: config.apiKey, signature: sign(params, config.apiSecret) },
  });
}
