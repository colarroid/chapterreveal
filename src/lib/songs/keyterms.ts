// Hints for the transcriber during worship: the words in tonight's songs it
// is least likely to guess on its own. Song titles, then names and
// non-English words (Jehovah, Chineke, Olorun, ekele), most repeated first.
// Everyday English words are left out: the transcriber knows them already.

import type { SongSlide } from "./songs";

const COMMON = new Set(
  (
    "the and you your yours are was were for with that this have has had not but all our out who his her him she they them their " +
    "will would shall can could from what when where there here then than into unto upon over under more most some every only " +
    "just like love lord god jesus king holy praise song sing name come comes came give gave great good glory grace heart life " +
    "light power worthy forever ever never always mighty heaven earth world thank thanks because cause know knew let lift high " +
    "hallelujah halleluyah alleluia amen yeah ooh oh ohh eh hey yes way day days time times make made take took one two three " +
    "said say says see seen look looking feel felt keep kept still again even down done back free freely mercy faith hope peace " +
    "joy spirit father savior saviour christ blood cross name names nothing something everything everyone nobody somebody " +
    "son lamb you're i'm i'll he's it's don't can't won't glad paid price"
  ).split(" "),
);

export function songKeyterms(songs: { title: string; slides: SongSlide[] }[], max = 80): string[] {
  const terms: string[] = [];
  // Titles, when short enough to be a phrase someone sings.
  for (const s of songs) {
    const t = s.title.replace(/\(.*?\)|[^\p{L}\p{N}' -]/gu, " ").replace(/\s+/g, " ").trim();
    if (t.length >= 2 && t.length <= 40 && t.split(" ").length <= 5) terms.push(t);
  }
  // Unusual words, by how often they're sung tonight.
  const counts = new Map<string, { word: string; n: number }>();
  for (const s of songs) {
    for (const line of s.slides.flatMap((slide) => slide.text.split("\n"))) {
      const parts = line.split(/[^\p{L}\p{N}']+/u).filter(Boolean);
      for (const [i, raw] of parts.entries()) {
        // Held notes fold back to the word ("ekeleeeee" -> "ekele").
        const word = raw.replace(/^'+|'+$/g, "").replace(/(\p{L})\1{2,}/gu, "$1");
        const key = word.toLowerCase();
        if (word.length < 3 || word.length > 30 || COMMON.has(key) || /^\d+$/.test(word)) continue;
        // Sounds, not words: "Aah", "Oooh", "Uuuoh", "Eheh".
        if (new Set(key).size <= 2 || /^[aeiouh]+$/.test(key)) continue;
        // Plain English-looking words are mostly known already. The target is
        // names and other languages: accents, Igbo/Yoruba letter patterns, or
        // a capital in the middle of a line (a line's first word is always capitalised).
        const unusual =
          /[^\x00-\x7F]/.test(word) || (i > 0 && /^[A-Z]/.test(word)) || /(?:gb|kp|nw|ny|nk|mb|ch[iu]|^[a-z]*[aeiou]{2}$)/i.test(word) || /'[a-z]/i.test(word.slice(1));
        if (!unusual) continue;
        const c = counts.get(key);
        if (c) c.n++;
        else counts.set(key, { word, n: 1 });
      }
    }
  }
  const words = [...counts.values()].sort((a, b) => b.n - a.n).map((c) => c.word);
  return [...new Set([...terms, ...words])].slice(0, max);
}
