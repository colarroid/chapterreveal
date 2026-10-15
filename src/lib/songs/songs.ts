// A song is an ordered list of slides, the way churches already run them in
// VideoPsalm. Each slide has its lines and an optional label (Chorus...).

export interface SongSlide {
  label?: string;
  text: string;
}

export interface Song {
  id: string;
  title: string;
  author: string;
  copyright: string;
  ccli_number: string;
  slides: SongSlide[];
  source: "manual" | "videopsalm";
  updated_at: string;
}

/** What the library list needs; the lyrics load when a song is opened. */
export interface SongSummary {
  id: string;
  title: string;
  author: string;
  firstLine: string;
}

export const LABELS = ["Verse", "Chorus", "Pre-chorus", "Bridge", "Tag", "Intro", "Outro", "Ending"];

/** All the lyrics as one string, for searching by any line. */
export function songBody(slides: SongSlide[]): string {
  return slides.map((s) => s.text).join("\n");
}

export function firstLine(slides: SongSlide[]): string {
  for (const s of slides) {
    const line = s.text.split("\n").find((l) => l.trim());
    if (line) return line.trim();
  }
  return "";
}

// ---------------------------------------------------------------------------
// The editor's text format: a blank line between slides, and a label in
// square brackets on a slide's first line.
//
//   [Verse 1]
//   Amazing grace how sweet the sound
//   That saved a wretch like me
//
//   [Chorus]
//   ...

export function slidesToText(slides: SongSlide[]): string {
  return slides.map((s) => (s.label ? `[${s.label}]\n${s.text}` : s.text)).join("\n\n");
}

export function textToSlides(text: string): SongSlide[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trimEnd());
      while (lines.length && !lines[0].trim()) lines.shift();
      const m = lines[0]?.trim().match(/^\[([^\]]{1,40})\]$/);
      const label = m ? m[1].trim() : undefined;
      const body = (m ? lines.slice(1) : lines).join("\n").trim();
      return label ? { label, text: body } : { text: body };
    })
    .filter((s) => s.text);
}

/**
 * Joins runs of one-line slides into two-line slides, within the same part
 * of the song. VideoPsalm songbooks often have one line per slide.
 */
export function pairSingleLines(slides: SongSlide[]): SongSlide[] {
  const out: (SongSlide & { paired?: boolean })[] = [];
  for (const s of slides) {
    const prev = out[out.length - 1];
    const single = !s.text.includes("\n");
    // A labelled slide starts a new part, so it never joins the one before.
    if (single && !s.label && prev && !prev.paired && !prev.text.includes("\n")) {
      prev.text = `${prev.text}\n${s.text}`;
      prev.paired = true;
    } else out.push({ ...s });
  }
  return out.map(({ label, text }) => (label ? { label, text } : { text }));
}
