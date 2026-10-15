import { NextResponse } from "next/server";
import { transcriptionKeyterms } from "@/lib/scripture/books";
import { getSessionUser, supabaseServer } from "@/lib/supabase/server";

// Hands the browser what it needs to open a live transcription socket: a
// short-lived token and the URL to connect to. The Deepgram API key stays on
// the server. Swapping the transcriber later (a GPU gateway in v2) means
// changing this route, not the dashboard.

export const dynamic = "force-dynamic";

const SAMPLE_RATE = 16000;

// Hints from the browser go into the transcriber's URL, so only short,
// plain words and phrases get through, and only so many of them.
const MAX_KEYTERMS = 80;
const KEYTERM_RE = /^[\p{L}\p{N}' -]{2,40}$/u;

function cleanKeyterms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const term = t.replace(/\s+/g, " ").trim();
    if (KEYTERM_RE.test(term)) out.add(term);
    if (out.size >= MAX_KEYTERMS) break;
  }
  return [...out];
}

export async function POST(req: Request) {
  const request = (await req.json().catch(() => ({}))) as { mode?: unknown; keyterms?: unknown };
  const worship = request.mode === "worship";
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) return NextResponse.json({ error: "Transcription is not configured" }, { status: 500 });

  // The membership check and the token request don't depend on each other,
  // so they run side by side: Start service waits for one round trip, not two.
  const supabase = await supabaseServer();
  const [{ data: member }, res] = await Promise.all([
    supabase.from("church_members").select("church_id").eq("user_id", user.id).maybeSingle(),
    fetch("https://api.deepgram.com/v1/auth/grant", {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      // Only needs to live long enough to open the socket; an open socket
      // stays open after the token expires.
      body: JSON.stringify({ ttl_seconds: 60 }),
      cache: "no-store",
    }),
  ]);
  if (!member) return NextResponse.json({ error: "No church" }, { status: 403 });
  if (!res.ok) {
    console.error("Deepgram grant failed", res.status, await res.text());
    // Say what's wrong in words the person setting it up can act on.
    const error =
      res.status === 401
        ? "Transcription is not set up: the Deepgram API key is not valid."
        : res.status === 403
          ? "Transcription is not set up: the Deepgram API key needs the Member role. Create a new key with Member permissions in the Deepgram console."
          : res.status === 402
            ? "Transcription is paused: the Deepgram account is out of credit."
            : "Could not reach the transcription service. Check the internet connection and try again.";
    return NextResponse.json({ error }, { status: 502 });
  }
  const { access_token } = (await res.json()) as { access_token: string };

  const params = new URLSearchParams({
    model: "nova-3",
    language: "en",
    encoding: "linear16",
    sample_rate: String(SAMPLE_RATE),
    channels: "1",
    interim_results: "true",
    punctuate: "true",
    // Off on purpose: with it on, "three sixteen" can come back as "316".
    // The parser reads spoken numbers directly.
    smart_format: "false",
    endpointing: "400",
    utterance_end_ms: "1500",
    vad_events: "true",
    // Churches' audio isn't used to train Deepgram's models (Privacy Policy, section 4).
    mip_opt_out: "true",
  });
  // Sermons: Bible book names. Worship: the setlist's titles and unusual words.
  const keyterms = worship ? cleanKeyterms(request.keyterms) : [...transcriptionKeyterms(), ...cleanKeyterms(request.keyterms)];
  for (const term of keyterms) params.append("keyterm", term);

  return NextResponse.json({
    provider: "deepgram",
    url: `wss://api.deepgram.com/v1/listen?${params}`,
    protocols: ["bearer", access_token],
    sampleRate: SAMPLE_RATE,
  });
}
