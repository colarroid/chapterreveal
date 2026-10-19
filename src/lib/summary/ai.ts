import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ServiceDigest } from "./collect";

const SermonSummary = z.object({
  /** "Walking in the Spirit" */
  title: z.string(),
  /** Two to four sentences: the message, in plain words. */
  summary: z.string(),
  /** Three to five main points, one sentence each. */
  points: z.array(z.string()),
  /** Songs heard in the transcript that weren't logged from the lyrics screen. */
  songs: z.array(z.string()),
});
export type SermonSummary = z.infer<typeof SermonSummary>;

const SYSTEM = `You write the weekly service summary a church receives by email from its media software.
You get the transcript of one church service, produced live by speech recognition (expect misheard words and missing punctuation), with the scriptures and songs the media desk put on screen.
Summarise the sermon for the church's leaders: its title or theme, what the preacher taught, and its main points, faithful to what was said. Write in plain, warm English, in the third person ("The pastor taught..."), with no preamble.
Leave out anything personal: names of members, prayer requests, testimonies, health or family details, money given. Never invent scriptures, quotes or points that aren't in the transcript.
For songs: list songs clearly sung in the transcript that are not already in the on-screen list, by their common title. Leave it empty when unsure.
If the transcript has no sermon (only singing, announcements or a test), say so briefly in the summary and leave the points empty.`;

/** Below this, there's no sermon to summarise (a sound check, a short test). */
const MIN_WORDS = 150;

/**
 * A short summary of the service's sermon, or null when there's too little
 * said, no API key set, or the request fails. The email goes out without it.
 */
export async function summariseService(s: ServiceDigest): Promise<SermonSummary | null> {
  if (!process.env.ANTHROPIC_API_KEY || s.words < MIN_WORDS) return null;
  const client = new Anthropic();
  const input = [
    `Scriptures shown: ${s.verses.length ? s.verses.join("; ") : "none"}`,
    `Songs shown: ${s.songs.length ? s.songs.join("; ") : "none"}`,
    `Length: ${s.minutes} minutes`,
    "",
    "<transcript>",
    s.transcript,
    "</transcript>",
  ].join("\n");
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      // Summarising doesn't need deep reasoning; low keeps it quick and cheap.
      output_config: { effort: "low", format: betaZodOutputFormat(SermonSummary) },
      // If the model declines (it shouldn't, for a sermon), the API retries
      // on its default fallback model instead of returning nothing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: input }],
    });
    if (response.stop_reason === "refusal") return null;
    return response.parsed_output ?? null;
  } catch (e) {
    if (e instanceof Anthropic.APIError) console.error(`Service summary failed (${e.status}):`, e.message);
    else console.error("Service summary failed:", e);
    return null;
  }
}
