import { NextResponse } from "next/server";
import { churchFolder, cloudinaryConfig, deliveryUrl } from "@/lib/cloudinary";
import { supabaseServer } from "@/lib/supabase/server";
import { churchAdmin } from "./admin";

export const dynamic = "force-dynamic";

// Records a background the browser just uploaded to Cloudinary, so it shows
// in the church's list. Only files in this church's own folder are accepted.
export async function POST(req: Request) {
  const admin = await churchAdmin();
  if (admin instanceof NextResponse) return admin;
  const config = cloudinaryConfig();
  if (!config) return NextResponse.json({ error: "Background uploads aren't set up yet." }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { public_id?: unknown; resource_type?: unknown; bytes?: unknown };
  const publicId = typeof body.public_id === "string" ? body.public_id : "";
  const kind = body.resource_type === "video" ? "video" : body.resource_type === "image" ? "image" : null;
  if (!kind || !publicId.startsWith(`${churchFolder(admin.churchId)}/`) || !/^[\w/-]+$/.test(publicId)) {
    return NextResponse.json({ error: "That upload doesn't belong to this church." }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("backgrounds")
    .insert({
      church_id: admin.churchId,
      kind,
      public_id: publicId,
      url: deliveryUrl(config.cloudName, kind, publicId),
      bytes: typeof body.bytes === "number" ? Math.round(body.bytes) : 0,
      created_by: admin.userId,
    })
    .select("id, kind, url")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
