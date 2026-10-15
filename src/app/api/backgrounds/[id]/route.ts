import { NextResponse } from "next/server";
import { cloudinaryConfig, destroy } from "@/lib/cloudinary";
import { supabaseServer } from "@/lib/supabase/server";
import { churchAdmin } from "../admin";

export const dynamic = "force-dynamic";

// Removes a background from Cloudinary and from the church's list.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await churchAdmin();
  if (admin instanceof NextResponse) return admin;
  const config = cloudinaryConfig();
  if (!config) return NextResponse.json({ error: "Background uploads aren't set up yet." }, { status: 500 });

  const { id } = await params;
  const supabase = await supabaseServer();
  // The church's own uploads only: shared backgrounds (no church) are the admin site's.
  const { data: bg } = await supabase.from("backgrounds").select("id, kind, public_id").eq("id", id).eq("church_id", admin.churchId).maybeSingle();
  if (!bg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!(await destroy(config, bg.kind as "image" | "video", bg.public_id))) {
    return NextResponse.json({ error: "Cloudinary didn't delete it. Try again." }, { status: 502 });
  }
  const { error } = await supabase.from("backgrounds").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
