import { NextResponse } from "next/server";
import { buildSummary, sendEmail } from "@/lib/summary/send";
import { getSessionUser, supabaseServer } from "@/lib/supabase/server";

// Summarising a long sermon can take a little while.
export const maxDuration = 120;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** One sample at a time per church: each one costs an AI summary. */
const SAMPLE_EVERY_MS = 2 * 60 * 1000;

/**
 * Sends the signed-in admin the summary of their church's past week, to
 * their own address. Read with their own session, so RLS keeps it to their
 * church. With no services this week, the week of the last service.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!user.email) return NextResponse.json({ error: "Your account has no email address" }, { status: 400 });
  const supabase = await supabaseServer();
  const { data: m } = await supabase
    .from("church_members")
    .select("role, church_id, churches(name, settings, country_code)")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!m) return NextResponse.json({ error: "No church" }, { status: 403 });
  if (m.role !== "admin") return NextResponse.json({ error: "Only church admins can send the summary" }, { status: 403 });
  const church = m.churches as unknown as { name: string; settings: Record<string, unknown>; country_code: string | null };

  const last = Number(church.settings.summary_sample_at ?? 0);
  if (Date.now() - last < SAMPLE_EVERY_MS) {
    return NextResponse.json({ error: "A sample was just sent. Try again in a couple of minutes." }, { status: 429 });
  }
  await supabase
    .from("churches")
    .update({ settings: { ...church.settings, summary_sample_at: Date.now() } })
    .eq("id", m.church_id);

  let to = new Date();
  const { data: latest } = await supabase
    .from("services")
    .select("started_at")
    .eq("church_id", m.church_id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return NextResponse.json({ error: "There are no services yet to summarise." }, { status: 404 });
  if (Date.now() - new Date(latest.started_at).getTime() > WEEK_MS) to = new Date(new Date(latest.started_at).getTime() + 60_000);
  const from = new Date(to.getTime() - WEEK_MS);

  try {
    const email = await buildSummary(supabase, { id: m.church_id, name: church.name, country: church.country_code }, from, to, true);
    if (!email) return NextResponse.json({ error: "Nothing was said or shown in that week's services." }, { status: 404 });
    await sendEmail([user.email], email);
    return NextResponse.json({ sentTo: user.email });
  } catch (e) {
    console.error("Sample summary failed:", e);
    return NextResponse.json({ error: "The summary couldn't be sent. Try again shortly." }, { status: 500 });
  }
}
