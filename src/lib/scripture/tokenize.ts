// Turns transcript text into tokens with character offsets, folding spoken
// numbers into numeric tokens: "one hundred and nineteen" -> 119,
// "twenty three" -> 23, "three sixteen" -> 3, 16.

export interface Token {
  /** Lowercased text, or the digits for a number token. */
  text: string;
  /** Numeric value when the token is a number (digits or words). */
  num?: number;
  /** True when the token is punctuation such as ":" or ",". */
  punct?: boolean;
  start: number;
  end: number;
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};
const TEENS: Record<string, number> = {
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const TOKEN_RE = /\d+(?:st|nd|rd|th)?|[a-z]+(?:'[a-z]+)?|[:,.;\-–—]/gi;

function rawTokens(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const t = m[0].toLowerCase();
    const start = m.index!;
    const tok: Token = { text: t, start, end: start + t.length };
    if (/^\d+$/.test(t)) tok.num = Number(t);
    else if (/^[:,.;\-–—]$/.test(t)) tok.punct = true;
    out.push(tok);
  }
  return out;
}

const isWordNum = (t: string) => t in UNITS || t in TEENS || t in TENS || t === "hundred";

// Reads one spoken number starting at i. Returns its value and how many
// tokens it used, or null when tokens[i] does not start a number.
function readSpokenNumber(tokens: Token[], i: number): { value: number; used: number } | null {
  let j = i;
  let value = 0;
  const w = (k: number) => tokens[k]?.text;

  // [units] hundred [and]
  if (w(j) === "hundred" || (w(j)! in UNITS && w(j + 1) === "hundred")) {
    const lead = w(j) === "hundred" ? 1 : UNITS[w(j)!];
    j += w(j) === "hundred" ? 1 : 2;
    value = lead * 100;
    if (w(j) === "and" && isWordNum(w(j + 1) ?? "") && w(j + 1) !== "hundred") j += 1;
  }

  const t = w(j);
  if (t !== undefined && t in TENS) {
    value += TENS[t];
    j += 1;
    const u = w(j);
    if (u !== undefined && u in UNITS && UNITS[u] > 0) {
      value += UNITS[u];
      j += 1;
    }
  } else if (t !== undefined && t in TEENS) {
    value += TEENS[t];
    j += 1;
  } else if (t !== undefined && t in UNITS && !(value > 0 && UNITS[t] === 0)) {
    value += UNITS[t];
    j += 1;
  }

  if (j === i) return null;
  // "hundred and" with nothing after leaves a dangling "and": hand it back.
  if (tokens[j - 1].text === "and") j -= 1;
  return { value, used: j - i };
}

// "twenty-one" must not read as the range 20 to 1. Swapping the hyphen for a
// space keeps every character offset where it was.
const HYPHENATED_TENS = /\b(twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety)-(?=(one|two|three|four|five|six|seven|eight|nine)\b)/gi;

export function tokenize(text: string): Token[] {
  const raw = rawTokens(text.replace(HYPHENATED_TENS, "$1 "));
  const out: Token[] = [];
  for (let i = 0; i < raw.length; ) {
    if (raw[i].num === undefined && isWordNum(raw[i].text)) {
      const n = readSpokenNumber(raw, i);
      if (n) {
        const first = raw[i];
        const last = raw[i + n.used - 1];
        out.push({ text: String(n.value), num: n.value, start: first.start, end: last.end });
        i += n.used;
        continue;
      }
    }
    out.push(raw[i]);
    i += 1;
  }
  return out;
}
