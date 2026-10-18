import { NextResponse } from "next/server";
import { getSessionUser, supabaseServer } from "@/lib/supabase/server";

/** The signed-in church member, or a JSON error response to send back. Slides are the whole media team's. */
export async function churchMember(): Promise<{ userId: string; churchId: string } | NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const supabase = await supabaseServer();
  const { data } = await supabase.from("church_members").select("church_id").eq("user_id", user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "No church" }, { status: 403 });
  return { userId: user.id, churchId: data.church_id };
}
