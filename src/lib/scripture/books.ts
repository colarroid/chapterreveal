// The 66 books in canonical order. Index = position in the Bible data files.
//
// `spoken` are forms a preacher says (and the transcriber writes), matched in
// live transcripts. `abbr` are typed short forms, only matched in the manual
// search box, because "gen", "mark" or "job" style collisions get worse with
// every extra short form we accept from speech.
// Numbered books (1 Samuel, 2 Kings, 1 John...) list the bare name in `spoken`
// with `ordinal` set; the parser requires the number prefix for them.

export interface BookDef {
  name: string;
  short: string;
  spoken: string[];
  abbr: string[];
  ordinal?: 1 | 2 | 3;
  // Common English words that are also book names. Without a clear chapter
  // and verse they get a lower confidence.
  commonWord?: boolean;
}

export const BOOKS: BookDef[] = [
  { name: "Genesis", short: "Gen", spoken: ["genesis"], abbr: ["gen", "gn", "ge"] },
  { name: "Exodus", short: "Exod", spoken: ["exodus"], abbr: ["ex", "exo", "exod"] },
  { name: "Leviticus", short: "Lev", spoken: ["leviticus"], abbr: ["lev", "lv", "le"] },
  { name: "Numbers", short: "Num", spoken: ["numbers"], abbr: ["num", "nm", "nu", "numb"], commonWord: true },
  { name: "Deuteronomy", short: "Deut", spoken: ["deuteronomy", "deutronomy", "deuteronomi"], abbr: ["deut", "dt", "deu", "de"] },
  { name: "Joshua", short: "Josh", spoken: ["joshua"], abbr: ["josh", "jos", "jsh"] },
  { name: "Judges", short: "Judg", spoken: ["judges"], abbr: ["judg", "jdg", "jg", "jdgs"], commonWord: true },
  { name: "Ruth", short: "Ruth", spoken: ["ruth"], abbr: ["rut", "ru", "rth"] },
  { name: "1 Samuel", short: "1 Sam", spoken: ["samuel"], abbr: ["sam", "sa", "sm"], ordinal: 1 },
  { name: "2 Samuel", short: "2 Sam", spoken: ["samuel"], abbr: ["sam", "sa", "sm"], ordinal: 2 },
  { name: "1 Kings", short: "1 Kgs", spoken: ["kings", "king"], abbr: ["kgs", "ki", "kin", "kg"], ordinal: 1 },
  { name: "2 Kings", short: "2 Kgs", spoken: ["kings", "king"], abbr: ["kgs", "ki", "kin", "kg"], ordinal: 2 },
  { name: "1 Chronicles", short: "1 Chr", spoken: ["chronicles", "chronicle"], abbr: ["chr", "chron", "ch", "chro"], ordinal: 1 },
  { name: "2 Chronicles", short: "2 Chr", spoken: ["chronicles", "chronicle"], abbr: ["chr", "chron", "ch", "chro"], ordinal: 2 },
  { name: "Ezra", short: "Ezra", spoken: ["ezra"], abbr: ["ezr", "ez"] },
  { name: "Nehemiah", short: "Neh", spoken: ["nehemiah", "nehemia"], abbr: ["neh", "ne"] },
  { name: "Esther", short: "Esth", spoken: ["esther"], abbr: ["est", "esth", "es"] },
  { name: "Job", short: "Job", spoken: ["job"], abbr: ["jb"], commonWord: true },
  { name: "Psalms", short: "Ps", spoken: ["psalms", "psalm", "psalter", "salm", "salms"], abbr: ["ps", "psa", "pss", "psm", "pslm"] },
  { name: "Proverbs", short: "Prov", spoken: ["proverbs", "proverb"], abbr: ["prov", "pr", "prv", "pro"] },
  { name: "Ecclesiastes", short: "Eccl", spoken: ["ecclesiastes", "ecclesiaste", "ecclesiastics"], abbr: ["eccl", "ecc", "ec", "eccles", "qoh"] },
  {
    name: "Song of Solomon",
    short: "Song",
    spoken: ["song of solomon", "songs of solomon", "song of songs", "songs of songs", "song of song", "solomon's song", "canticles"],
    abbr: ["song", "sos", "sng", "ss", "sol"],
  },
  { name: "Isaiah", short: "Isa", spoken: ["isaiah", "isiah", "esaias", "isaiaih"], abbr: ["isa", "is"] },
  { name: "Jeremiah", short: "Jer", spoken: ["jeremiah", "jeremaiah"], abbr: ["jer", "je", "jr"] },
  { name: "Lamentations", short: "Lam", spoken: ["lamentations", "lamentation"], abbr: ["lam", "la"] },
  { name: "Ezekiel", short: "Ezek", spoken: ["ezekiel", "ezekial"], abbr: ["ezek", "eze", "ezk"] },
  { name: "Daniel", short: "Dan", spoken: ["daniel"], abbr: ["dan", "dn", "da"] },
  { name: "Hosea", short: "Hos", spoken: ["hosea"], abbr: ["hos", "ho"] },
  { name: "Joel", short: "Joel", spoken: ["joel"], abbr: ["jl", "joe"] },
  { name: "Amos", short: "Amos", spoken: ["amos"], abbr: ["am", "amo"] },
  { name: "Obadiah", short: "Obad", spoken: ["obadiah", "obadaiah"], abbr: ["obad", "ob", "oba"] },
  { name: "Jonah", short: "Jonah", spoken: ["jonah"], abbr: ["jon", "jnh"] },
  { name: "Micah", short: "Mic", spoken: ["micah"], abbr: ["mic", "mc"] },
  { name: "Nahum", short: "Nah", spoken: ["nahum"], abbr: ["nah", "na"] },
  { name: "Habakkuk", short: "Hab", spoken: ["habakkuk", "habakuk", "habbakuk", "habbakkuk"], abbr: ["hab", "hb"] },
  { name: "Zephaniah", short: "Zeph", spoken: ["zephaniah"], abbr: ["zeph", "zep", "zp"] },
  { name: "Haggai", short: "Hag", spoken: ["haggai", "hagai"], abbr: ["hag", "hg"] },
  { name: "Zechariah", short: "Zech", spoken: ["zechariah", "zachariah", "zacharia", "zechariah's"], abbr: ["zech", "zec", "zc"] },
  { name: "Malachi", short: "Mal", spoken: ["malachi", "malachai"], abbr: ["mal", "ml"] },
  { name: "Matthew", short: "Matt", spoken: ["matthew", "mathew", "matthews", "st matthew", "saint matthew"], abbr: ["matt", "mt", "mat"] },
  { name: "Mark", short: "Mark", spoken: ["mark", "st mark", "saint mark"], abbr: ["mk", "mrk", "mar"], commonWord: true },
  { name: "Luke", short: "Luke", spoken: ["luke", "st luke", "saint luke"], abbr: ["lk", "luk"] },
  { name: "John", short: "John", spoken: ["john", "st john", "saint john"], abbr: ["jn", "jhn", "joh"], commonWord: true },
  { name: "Acts", short: "Acts", spoken: ["acts of the apostles", "acts", "act"], abbr: ["ac", "act"], commonWord: true },
  { name: "Romans", short: "Rom", spoken: ["romans", "roman"], abbr: ["rom", "ro", "rm"] },
  { name: "1 Corinthians", short: "1 Cor", spoken: ["corinthians", "corinthian"], abbr: ["cor", "co", "corin"], ordinal: 1 },
  { name: "2 Corinthians", short: "2 Cor", spoken: ["corinthians", "corinthian"], abbr: ["cor", "co", "corin"], ordinal: 2 },
  { name: "Galatians", short: "Gal", spoken: ["galatians", "galatian"], abbr: ["gal", "ga"] },
  { name: "Ephesians", short: "Eph", spoken: ["ephesians", "ephesian"], abbr: ["eph", "ephes", "ep"] },
  { name: "Philippians", short: "Phil", spoken: ["philippians", "phillipians", "philipians", "philippian", "phillippians"], abbr: ["phil", "php", "pp", "philip"] },
  { name: "Colossians", short: "Col", spoken: ["colossians", "colossian", "collosians"], abbr: ["col"] },
  { name: "1 Thessalonians", short: "1 Thess", spoken: ["thessalonians", "thessalonian"], abbr: ["thess", "th", "thes", "ths"], ordinal: 1 },
  { name: "2 Thessalonians", short: "2 Thess", spoken: ["thessalonians", "thessalonian"], abbr: ["thess", "th", "thes", "ths"], ordinal: 2 },
  { name: "1 Timothy", short: "1 Tim", spoken: ["timothy"], abbr: ["tim", "ti", "tm"], ordinal: 1 },
  { name: "2 Timothy", short: "2 Tim", spoken: ["timothy"], abbr: ["tim", "ti", "tm"], ordinal: 2 },
  { name: "Titus", short: "Titus", spoken: ["titus"], abbr: ["tit", "tt"] },
  { name: "Philemon", short: "Phlm", spoken: ["philemon"], abbr: ["philem", "phm", "phlm", "phile"] },
  { name: "Hebrews", short: "Heb", spoken: ["hebrews", "hebrew"], abbr: ["heb", "hb", "hebr"] },
  { name: "James", short: "Jas", spoken: ["james"], abbr: ["jas", "jm", "jam"], commonWord: true },
  { name: "1 Peter", short: "1 Pet", spoken: ["peter"], abbr: ["pet", "pe", "pt", "ptr"], ordinal: 1 },
  { name: "2 Peter", short: "2 Pet", spoken: ["peter"], abbr: ["pet", "pe", "pt", "ptr"], ordinal: 2 },
  { name: "1 John", short: "1 John", spoken: ["john"], abbr: ["jn", "jhn", "joh"], ordinal: 1 },
  { name: "2 John", short: "2 John", spoken: ["john"], abbr: ["jn", "jhn", "joh"], ordinal: 2 },
  { name: "3 John", short: "3 John", spoken: ["john"], abbr: ["jn", "jhn", "joh"], ordinal: 3 },
  { name: "Jude", short: "Jude", spoken: ["jude"], abbr: ["jud", "jd"] },
  { name: "Revelation", short: "Rev", spoken: ["revelation", "revelations", "the revelation"], abbr: ["rev", "re", "rv"] },
];

// Words that put a number in front of a numbered book: "first Corinthians",
// "1st John", "two Timothy", "II Kings".
export const ORDINAL_WORDS: Record<string, 1 | 2 | 3> = {
  first: 1, "1st": 1, one: 1, i: 1, "1": 1,
  second: 2, "2nd": 2, two: 2, ii: 2, "2": 2,
  third: 3, "3rd": 3, three: 3, iii: 3, "3": 3,
};

// Terms sent to the transcriber as keyterm prompts, so book names come back
// spelled the way the parser expects.
export function transcriptionKeyterms(): string[] {
  const terms = new Set<string>();
  for (const b of BOOKS) {
    if (b.ordinal) {
      const word = ["First", "Second", "Third"][b.ordinal - 1];
      terms.add(`${word} ${b.name.replace(/^\d /, "")}`);
    } else {
      terms.add(b.name);
    }
  }
  terms.add("Psalm");
  // Translations named aloud ("…in the KJV"): spelled-out abbreviations are
  // easily misheard ("NHEB" came back as "NEB").
  for (const t of ["KJV", "NKJV", "NIV", "NLT", "ESV", "NASB", "NHEB", "BSB", "ASV", "BBE", "Amplified", "King James", "New King James"]) terms.add(t);
  return [...terms];
}
