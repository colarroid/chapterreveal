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

