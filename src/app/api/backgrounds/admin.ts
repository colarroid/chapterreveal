import { NextResponse } from "next/server";
import { getSessionUser, supabaseServer } from "@/lib/supabase/server";

/** The signed-in church admin, or a JSON error response to send back. */
export async function churchAdmin(): Promise<{ userId: string; churchId: string } | NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const supabase = await supabaseServer();
  const { data } = await supabase.from("church_members").select("church_id, role").eq("user_id", user.id).maybeSingle();
  if (!data) return NextResponse.json({ error: "No church" }, { status: 403 });
  if (data.role !== "admin") return NextResponse.json({ error: "Only church admins can change backgrounds" }, { status: 403 });
  return { userId: user.id, churchId: data.church_id };
}
