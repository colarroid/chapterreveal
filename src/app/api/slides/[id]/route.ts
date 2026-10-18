import { NextResponse } from "next/server";
import { cloudinaryConfig, destroy } from "@/lib/cloudinary";
import { supabaseServer } from "@/lib/supabase/server";
import { churchMember } from "../member";

export const dynamic = "force-dynamic";

// Deletes a slide, and its picture or video from Cloudinary.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const member = await churchMember();
  if (member instanceof NextResponse) return member;
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: slide } = await supabase.from("slides").select("id, kind, public_id").eq("id", id).eq("church_id", member.churchId).maybeSingle();
  if (!slide) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (slide.kind !== "text" && slide.public_id) {
    const config = cloudinaryConfig();
    if (config && !(await destroy(config, slide.kind === "video" ? "video" : "image", slide.public_id))) {
      return NextResponse.json({ error: "Cloudinary didn't delete the picture. Try again." }, { status: 502 });
    }
  }
  const { error } = await supabase.from("slides").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
