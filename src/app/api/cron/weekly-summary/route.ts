import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { buildSummary, sendEmail } from "@/lib/summary/send";

// Vercel Cron, Monday morning (vercel.json). Every church gets last week's
// summary at the email it signed up with, once: summary_emails records each
// send, so a retried run skips churches already done. Nothing is sent until
// the AI sermon summaries are set up (ANTHROPIC_API_KEY).
export const maxDuration = 300;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
  // Vercel sends the project's CRON_SECRET; nobody else can start a run.
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret ?? ""}`);
  // Compared in constant time, so the secret can't be guessed a byte at a time.
  if (!secret || given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ skipped: "ANTHROPIC_API_KEY is not set: no summaries sent" });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const to = new Date();
  const from = new Date(to.getTime() - WEEK_MS);
  // The Monday (UTC) of this week, so a retry later in the week still matches.
  const week = new Date(to.getTime() - ((to.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);

  const { data: rows, error } = await supabase.rpc("summary_recipients");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const churches = new Map<string, { name: string; emails: string[] }>();
  for (const r of (rows ?? []) as { church_id: string; church_name: string; email: string }[]) {
    const c = churches.get(r.church_id) ?? { name: r.church_name, emails: [] };
    c.emails.push(r.email);
    churches.set(r.church_id, c);
  }

  const results: { church: string; sent?: number; skipped?: string; error?: string }[] = [];
  for (const [id, c] of churches) {
    // Claim the week first: two overlapping runs can't both send.
    const { error: claim } = await supabase.from("summary_emails").insert({ church_id: id, week });
    if (claim) {
      results.push({ church: id, skipped: "already sent" });
      continue;
    }
    try {
      const { data: church } = await supabase.from("churches").select("country_code").eq("id", id).maybeSingle();
      const email = await buildSummary(supabase, { id, name: c.name, country: church?.country_code }, from, to);
      if (!email) {
        results.push({ church: id, skipped: "no services" });
        continue;
      }
      await sendEmail(c.emails, email);
      results.push({ church: id, sent: c.emails.length });
    } catch (e) {
      // Let a later run try again.
      await supabase.from("summary_emails").delete().eq("church_id", id).eq("week", week);
      results.push({ church: id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ week, results });
}
