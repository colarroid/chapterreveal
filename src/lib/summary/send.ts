import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_NAME } from "@/lib/brand";
import { summariseService } from "./ai";
import { collectServices } from "./collect";
import { renderSummaryEmail, type SummaryService } from "./email";

/** Where summaries come from. reedark.com is verified in Resend. */
const FROM = process.env.SUMMARY_FROM ?? `${APP_NAME} <summary@reedark.com>`;

// The church's local time for dates in the email, from its country.
const ZONES: Record<string, string> = {
  NG: "Africa/Lagos", GH: "Africa/Accra", KE: "Africa/Nairobi", ZA: "Africa/Johannesburg", UG: "Africa/Kampala",
  GB: "Europe/London", IE: "Europe/Dublin", CA: "America/Toronto", US: "America/New_York", AU: "Australia/Sydney",
};
export const zoneFor = (country: string | null | undefined) => ZONES[(country ?? "").toUpperCase()] ?? "UTC";

export async function sendEmail(to: string[], email: { subject: string; html: string; text: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject: email.subject, html: email.html, text: email.text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/**
 * Builds a church's summary for services between `from` and `to`. Null when
 * there were none. Each service's sermon is summarised at the same time.
 */
export async function buildSummary(
  supabase: SupabaseClient,
  church: { id: string; name: string; country?: string | null },
  from: Date,
  to: Date,
  sample = false,
) {
  const digests = await collectServices(supabase, church.id, from, to);
  // A test that never got going (no words, nothing shown) isn't news.
  const real = digests.filter((d) => d.words > 0 || d.verses.length > 0 || d.songs.length > 0);
  if (!real.length) return null;
  const services: SummaryService[] = await Promise.all(real.map(async (d) => ({ ...d, sermon: await summariseService(d) })));
  return renderSummaryEmail({ churchName: church.name, services, timeZone: zoneFor(church.country), sample });
}
