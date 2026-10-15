// Translation names as preachers say them: "in the KJV", "King James",
// "New King James Version", "let's read it in the Amplified". The last one
// mentioned wins, so "in NKJV... sorry, in KJV" lands on KJV.
//
// Some names are ordinary words ("the message", "good news", "living"), so
// those only count with a word that marks them as a Bible: "version",
// "translation", "Bible", or "in the …" / "from the …" before them.

export interface SpokenTranslation {
  /** The short name, as on screen: "KJV". */
  short: string;
  /** Where in the text it was said, for "the last one wins". */
  at: number;
}

interface Pattern {
  short: string;
  /** Matched anywhere: abbreviations and names nobody says by accident. */
  plain: RegExp[];
  /** Only matched as "in the X" / "X version" / "X translation" / "X Bible". */
  marked?: RegExp[];
}

// Abbreviations as transcribed: "KJV", "K J V", "k.j.v".
const abbr = (letters: string) => new RegExp(`\\b${letters.split("").join("[\\s.]?")}\\b\\.?`, "gi");
const MARK_BEFORE = String.raw`(?:\b(?:in|from|using|read(?:ing)?(?: it)? (?:in|from))\s+(?:the\s+)?)`;
const MARK_AFTER = String.raw`(?:\s+(?:version|translation|bible)\b)`;
const marked = (name: string) => new RegExp(`(?:${MARK_BEFORE}${name}\\b|\\b${name}${MARK_AFTER})`, "gi");

const PATTERNS: Pattern[] = [
  // Longer names first where one contains another ("New King James" before "King James").
  { short: "NKJV", plain: [abbr("nkjv"), /\bnew king james(?: version)?\b/gi] },
  { short: "AKJV", plain: [abbr("akjv"), /\bamerican king james(?: version| bible)?\b/gi] },
  { short: "UKJV", plain: [abbr("ukjv"), /\bupdated king james(?: version| bible)?\b/gi] },
  { short: "KJV", plain: [abbr("kjv"), /\bking james(?: version| bible)?\b/gi, /\bauthori[sz]ed version\b/gi] },
  { short: "NIV", plain: [abbr("niv"), /\bnew international version\b/gi] },
  { short: "NLT", plain: [abbr("nlt"), /\bnew living translation\b/gi], marked: ["new living"].map(marked) },
  { short: "ESV", plain: [abbr("esv"), /\benglish standard version\b/gi] },
  { short: "NASB", plain: [abbr("nasb"), /\bnew american standard(?: bible| version)?\b/gi] },
  { short: "ASV", plain: [abbr("asv"), /\b(?<!new )american standard version\b/gi] },
  { short: "AMP", plain: [/\bamplified (?:version|bible|translation)\b/gi], marked: ["amplified", "amp"].map(marked) },
  { short: "MSG", plain: [], marked: ["the message", "message"].map(marked) },
  { short: "GNT", plain: [/\bgood news (?:translation|bible)\b/gi] },
  { short: "CSB", plain: [abbr("csb"), /\bchristian standard bible\b/gi] },
  { short: "NRSV", plain: [abbr("nrsv"), /\bnew revised standard version\b/gi] },
  { short: "RSV", plain: [/\b(?<!n)r[\s.]?s[\s.]?v\b/gi, /\b(?<!new )revised standard version\b/gi] },
  { short: "TPT", plain: [abbr("tpt"), /\bpassion translation\b/gi] },
  { short: "BSB", plain: [abbr("bsb"), /\bberean(?: standard)?(?: bible)?\b/gi] },
  { short: "NHEB", plain: [abbr("nheb"), /\bnew heart english bible\b/gi] },
  { short: "BBE", plain: [abbr("bbe"), /\bbible in basic english\b/gi, /\bbasic english\b/gi] },
  { short: "WEB", plain: [/\bworld english bible\b/gi] },
  { short: "YLT", plain: [abbr("ylt"), /\byoung'?s literal(?: translation)?\b/gi] },
  // "Webster" alone is also a dictionary: only with "bible" or a reading cue.
  { short: "WBT", plain: [/\bwebster'?s? bible\b/gi], marked: ["webster"].map(marked) },
  { short: "ACV", plain: [abbr("acv"), /\ba conservative version\b/gi] },
  { short: "DBY", plain: [/\bdarby(?: bible| translation)?\b/gi] },
];

/**
 * Every translation named in the text, in the order said. "New King James"
 * isn't also counted as "King James": a shorter name inside a longer one
 * already matched is skipped.
 */
export function spokenTranslations(text: string): SpokenTranslation[] {
  const found: { short: string; start: number; end: number }[] = [];
  for (const p of PATTERNS) {
    for (const re of [...p.plain, ...(p.marked ?? [])]) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const start = m.index ?? 0;
        const end = start + m[0].length;
        if (found.some((f) => start < f.end && end > f.start)) continue;
        found.push({ short: p.short, start, end });
      }
    }
  }
  return found.sort((a, b) => a.start - b.start).map((f) => ({ short: f.short, at: f.start }));
}

/** The translation asked for last in the text, if any. */
export function lastSpokenTranslation(text: string): SpokenTranslation | null {
  const all = spokenTranslations(text);
  return all.length ? all[all.length - 1] : null;
}
