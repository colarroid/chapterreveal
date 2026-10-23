import { NextResponse } from "next/server";
import { cloudinaryConfig, deliveryUrl } from "@/lib/cloudinary";
import { supabaseServer } from "@/lib/supabase/server";
import { imageEntry, ownPublicId } from "./media";
import { churchMember } from "./member";

export const dynamic = "force-dynamic";

const COLUMNS = "id, kind, title, body, image_url, images, position, expires_at, deck_id, fit";

// Records a picture slide (one or more pictures just uploaded) or a video
// slide. Only files in this church's own folder are accepted; the database
// enforces the plan (pictures per slide, video slides, how many slides).
export async function POST(req: Request) {
  const member = await churchMember();
  if (member instanceof NextResponse) return member;
  const config = cloudinaryConfig();
  if (!config) return NextResponse.json({ error: "Uploads aren't set up yet." }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown; public_ids?: unknown; title?: unknown; position?: unknown; deck_id?: unknown };
  const kind = body.kind === "video" ? "video" : "image";
  const ids = (Array.isArray(body.public_ids) ? body.public_ids : []).map((v) => ownPublicId(member.churchId, v));
  if (!ids.length || ids.some((v) => !v) || (kind === "video" && ids.length !== 1)) {
    return NextResponse.json({ error: "That upload doesn't belong to this church." }, { status: 400 });
  }
  const first = ids[0]!;
  const supabase = await supabaseServer();
  // The presentation it goes in: this church's own (the database only shows those).
  const deckId = typeof body.deck_id === "string" ? body.deck_id : null;
  if (deckId) {
    const { data: deck } = await supabase.from("slide_decks").select("id").eq("id", deckId).maybeSingle();
    if (!deck) return NextResponse.json({ error: "That presentation isn't this church's." }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("slides")
    .insert({
      church_id: member.churchId,
      kind,
      title: typeof body.title === "string" ? body.title.slice(0, 120) : "",
      image_url: deliveryUrl(config.cloudName, kind, first),
      public_id: first,
      images: kind === "image" ? ids.map((id) => imageEntry(config.cloudName, id!)) : [],
      position: typeof body.position === "number" ? Math.round(body.position) : 0,
      deck_id: deckId,
      created_by: member.userId,
    })
    .select(COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
