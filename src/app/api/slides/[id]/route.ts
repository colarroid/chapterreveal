import { NextResponse } from "next/server";
import { cloudinaryConfig, destroy } from "@/lib/cloudinary";
import { supabaseServer } from "@/lib/supabase/server";
import { imageEntry, ownPublicId, type SlideImage } from "../media";
import { churchMember } from "../member";

export const dynamic = "force-dynamic";

const COLUMNS = "id, kind, title, body, image_url, images, position, expires_at, deck_id, fit";

async function loadSlide(id: string) {
  const member = await churchMember();
  if (member instanceof NextResponse) return member;
  const supabase = await supabaseServer();
  const { data } = await supabase.from("slides").select("id, kind, public_id, images").eq("id", id).eq("church_id", member.churchId).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return { member, supabase, slide: data as { id: string; kind: string; public_id: string | null; images: SlideImage[] } };
}

// Changes a picture slide's pictures: the full new list, in order. New ones
// must be this church's uploads; pictures taken off are deleted from
// Cloudinary. The database checks the plan's pictures-per-slide.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const got = await loadSlide(id);
  if (got instanceof NextResponse) return got;
  const { member, supabase, slide } = got;
  const config = cloudinaryConfig();
  if (!config) return NextResponse.json({ error: "Uploads aren't set up yet." }, { status: 500 });
  if (slide.kind !== "image") return NextResponse.json({ error: "Only picture slides have pictures to change." }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { public_ids?: unknown };
  const ids = (Array.isArray(body.public_ids) ? body.public_ids : []).map((v) => ownPublicId(member.churchId, v));
  if (!ids.length || ids.some((v) => !v)) return NextResponse.json({ error: "A picture slide needs at least one of this church's pictures." }, { status: 400 });

  const images = ids.map((pid) => imageEntry(config.cloudName, pid!));
  const { data, error } = await supabase
    .from("slides")
    .update({ images, image_url: images[0].url, public_id: images[0].public_id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const kept = new Set(ids);
  await Promise.allSettled(slide.images.filter((i) => !kept.has(i.public_id)).map((i) => destroy(config, "image", i.public_id)));
  return NextResponse.json(data);
}

// Deletes a slide, and its pictures or video from Cloudinary.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const got = await loadSlide(id);
  if (got instanceof NextResponse) return got;
  const { supabase, slide } = got;
  if (slide.kind !== "text") {
    const config = cloudinaryConfig();
    const files = slide.kind === "video" ? (slide.public_id ? [slide.public_id] : []) : slide.images.map((i) => i.public_id);
    if (config) {
      const results = await Promise.all(files.map((f) => destroy(config, slide.kind === "video" ? "video" : "image", f)));
      if (results.some((ok) => !ok)) return NextResponse.json({ error: "Cloudinary didn't delete everything. Try again." }, { status: 502 });
    }
  }
  const { error } = await supabase.from("slides").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
