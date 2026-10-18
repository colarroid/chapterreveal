import { NextResponse } from "next/server";
import { churchFolder, cloudinaryConfig, deliveryUrl } from "@/lib/cloudinary";
import { supabaseServer } from "@/lib/supabase/server";
import { churchMember } from "./member";

export const dynamic = "force-dynamic";

// Records a picture slide the browser just uploaded. Only files in this
// church's own folder are accepted.
export async function POST(req: Request) {
  const member = await churchMember();
  if (member instanceof NextResponse) return member;
  const config = cloudinaryConfig();
  if (!config) return NextResponse.json({ error: "Picture uploads aren't set up yet." }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { public_id?: unknown; title?: unknown; position?: unknown };
  const publicId = typeof body.public_id === "string" ? body.public_id : "";
  if (!publicId.startsWith(`${churchFolder(member.churchId)}/`) || !/^[\w/-]+$/.test(publicId)) {
    return NextResponse.json({ error: "That upload doesn't belong to this church." }, { status: 400 });
  }
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("slides")
    .insert({
      church_id: member.churchId,
      kind: "image",
      title: typeof body.title === "string" ? body.title.slice(0, 120) : "",
      image_url: deliveryUrl(config.cloudName, "image", publicId),
      public_id: publicId,
      position: typeof body.position === "number" ? Math.round(body.position) : 0,
      created_by: member.userId,
    })
    .select("id, kind, title, body, image_url, position")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
