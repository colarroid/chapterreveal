import { APP_NAME, SITE_URL } from "@/lib/brand";
import type { SermonSummary } from "./ai";
import type { ServiceDigest } from "./collect";

export interface SummaryService extends ServiceDigest {
  sermon: SermonSummary | null;
}

export interface SummaryEmail {
  subject: string;
  html: string;
  text: string;
}

// Same look as the sign-up emails (supabase/templates): Geist, grey page,
// white card, the green accent.
const FONT = "'Geist', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const INK = "#121212";
const MUTED = "#5e5e5e";
const FAINT = "#8b8b8b";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function day(iso: string, timeZone: string) {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone });
}
function time(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone });
}
function length(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const p = (text: string, style = "") =>
  `<p style="margin:0 0 12px; font-family:${FONT}; font-size:15px; line-height:1.6; color:${MUTED}; ${style}">${text}</p>`;
const label = (text: string) =>
  `<p style="margin:20px 0 8px; font-family:${FONT}; font-size:12px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:${FAINT};">${text}</p>`;
const list = (items: string[]) =>
  `<ul style="margin:0 0 4px; padding-left:20px; font-family:${FONT}; font-size:15px; line-height:1.6; color:${INK};">${items.map((i) => `<li style="margin:0 0 4px;">${esc(i)}</li>`).join("")}</ul>`;

function serviceHtml(s: SummaryService, timeZone: string): string {
  const songs = [...s.songs, ...(s.sermon?.songs ?? []).filter((t) => !s.songs.some((x) => x.toLowerCase() === t.toLowerCase()))];
  return `
    <tr><td style="background:#ffffff; border-radius:8px; border:1px solid #e4e4e4; padding:28px 28px 20px;">
      <p style="margin:0 0 4px; font-family:${FONT}; font-size:13px; font-weight:700; color:#0e8a3e;">${esc(day(s.startedAt, timeZone))} · ${esc(time(s.startedAt, timeZone))} · ${esc(length(s.minutes))}</p>
      <h2 style="margin:0 0 14px; font-family:${FONT}; font-size:20px; line-height:1.3; font-weight:700; color:${INK};">${esc(s.sermon?.title || "Service")}</h2>
      ${s.sermon ? p(esc(s.sermon.summary)) : ""}
      ${s.sermon?.points.length ? label("Main points") + list(s.sermon.points) : ""}
      ${s.verses.length ? label(`Scriptures on screen (${s.verses.length})`) + list(s.verses) : ""}
      ${songs.length ? label("Songs") + list(songs) : ""}
      <p style="margin:16px 0 0; font-family:${FONT}; font-size:13px;"><a href="${SITE_URL}/history/${s.id}" style="color:#0e8a3e;">Full transcript in History</a></p>
    </td></tr>
    <tr><td style="height:16px;"></td></tr>`;
}

/** The weekly summary for one church. */
export function renderSummaryEmail(opts: {
  churchName: string;
  services: SummaryService[];
  /** The church's time zone, for dates and times. */
  timeZone?: string;
  /** A sample sent by hand from Settings, not the Monday email. */
  sample?: boolean;
}): SummaryEmail {
  const { churchName, services, sample } = opts;
  const timeZone = opts.timeZone ?? "Africa/Lagos";
  // "Sunday service summary at Grace Assembly". Services on different days
  // (a midweek one too) make it the week's.
  const days = [...new Set(services.map((s) => new Date(s.startedAt).toLocaleDateString("en-GB", { weekday: "long", timeZone })))];
  const heading = days.length === 1
    ? `${days[0]} service${services.length === 1 ? "" : "s"} summary at ${churchName}`
    : `This week's services summary at ${churchName}`;
  const subject = `${sample ? "[Sample] " : ""}${heading}`;
  // Sermon summaries need the AI (ANTHROPIC_API_KEY); without it the email
  // is what was shown, and says nothing about AI.
  const ai = services.some((s) => s.sermon);
  const intro = `Here's what ${esc(churchName)}'s media desk put on screen this past week${ai ? ", with a short summary of each message" : ""}.`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <title>${esc(subject)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;700&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0; padding:0; background:#f6f6f6; -webkit-text-size-adjust:100%;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${esc(services[0]?.sermon?.title ?? `${services.length} services this week`)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f6;">
      <tr><td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
          <tr><td style="padding:0 4px 24px;">
            <a href="${SITE_URL}" style="text-decoration:none;"><img src="${SITE_URL}/brand/email-logo.png" width="120" height="74" alt="${APP_NAME}" style="display:block; border:0; width:120px; height:auto; font-family:${FONT}; font-size:20px; font-weight:700; color:${INK};" /></a>
          </td></tr>
          <tr><td style="padding:0 4px 20px;">
            <h1 style="margin:0 0 8px; font-family:${FONT}; font-size:24px; line-height:1.3; font-weight:700; color:${INK};">${esc(heading)}</h1>
            ${p(intro, "margin:0;")}
          </td></tr>
          ${services.map((s) => serviceHtml(s, timeZone)).join("")}
          <tr><td style="padding:4px 4px 0; font-family:${FONT}; font-size:12px; line-height:1.7; color:${FAINT};">
            ${sample ? "This is a sample, sent from Settings. The real one arrives every Monday morning at the email your church signed up with." : `You get this because ${esc(churchName)} signed up to ${APP_NAME} with this address. Reply to this email if you'd rather not receive it.`}
            ${ai ? "Summaries are written by AI from the live transcript and may contain mistakes." : ""}<br />
            <a href="${SITE_URL}/settings" style="color:${FAINT}; text-decoration:underline;">Settings</a>
            &nbsp;·&nbsp;
            <a href="${SITE_URL}/privacy" style="color:${FAINT}; text-decoration:underline;">Privacy</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    heading,
    "",
    ...services.flatMap((s) => [
      `${day(s.startedAt, timeZone)}, ${time(s.startedAt, timeZone)} (${length(s.minutes)})`,
      s.sermon ? `${s.sermon.title}\n${s.sermon.summary}` : "",
      ...(s.sermon?.points ?? []).map((pt) => `- ${pt}`),
      s.verses.length ? `Scriptures: ${s.verses.join(", ")}` : "",
      s.songs.length ? `Songs: ${s.songs.join(", ")}` : "",
      `Full transcript: ${SITE_URL}/history/${s.id}`,
      "",
    ]),
    ai ? "Summaries are written by AI from the live transcript and may contain mistakes." : "",
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");

  return { subject, html, text };
}
