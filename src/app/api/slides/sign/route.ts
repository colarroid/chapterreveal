import { NextResponse } from "next/server";
import { churchFolder, cloudinaryConfig, sign, VIDEO_TRANSFORM } from "@/lib/cloudinary";
import { limitText, PLAN_LIMITS, type Plan } from "@/lib/plans";
import { supabaseServer } from "@/lib/supabase/server";
import { churchMember } from "../member";

export const dynamic = "force-dynamic";

// A one-off signature so the browser can upload a picture or video slide
// straight to Cloudinary, into this church's folder (where the output page
// accepts them from).
export async function POST(req: Request) {
  const member = await churchMember();
  if (member instanceof NextResponse) return member;
  const config = cloudinaryConfig();
  if (!config) return NextResponse.json({ error: "Uploads aren't set up yet (Cloudinary keys missing)." }, { status: 500 });
  const { kind, adding } = (await req.json().catch(() => ({}))) as { kind?: unknown; adding?: unknown };
  const video = kind === "video";

  // The Free plan's allowance, checked before a big upload starts (the
  // database checks again when it's recorded).
  const supabase = await supabaseServer();
  const [{ data: plan }, { count }] = await Promise.all([
    supabase.rpc("church_plan", { p_church: member.churchId }),
    supabase
      .from("slides")
      .select("id", { count: "exact", head: true })
      .eq("church_id", member.churchId)
      .neq("kind", "text")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);
  const limits = PLAN_LIMITS[plan as Plan] ?? PLAN_LIMITS.free;
  if (video && !limits.videoSlides) {
    return NextResponse.json({ error: "Video slides are on the Paid plan. Upload pictures instead, or upgrade." }, { status: 402 });
  }
  // Adding a picture to an existing slide doesn't make another slide.
  const limit = limits.slide;
  if (!adding && (count ?? 0) >= limit) {
    return NextResponse.json({ error: `The Free plan keeps ${limitText("slide", limit)} at a time. Delete one, or upgrade to keep more.` }, { status: 402 });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = churchFolder(member.churchId);
  // Videos: Cloudinary prepares the projector copy right after upload.
  const params: Record<string, string | number> = video ? { folder, timestamp, eager: `${VIDEO_TRANSFORM}/mp4`, eager_async: "true" } : { folder, timestamp };
  const fields = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return NextResponse.json({
    url: `https://api.cloudinary.com/v1_1/${config.cloudName}/${video ? "video" : "image"}/upload`,
    fields: { ...fields, api_key: config.apiKey, signature: sign(params, config.apiSecret) },
  });
}
