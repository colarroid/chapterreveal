// Before a songbook goes into a library: what isn't a song, and which songs
// are near-copies of each other. VideoPsalm songbooks double as the place
// churches keep announcements, account numbers, prayer points and speaker
// introductions, and the same song is often saved several times with small
// edits. Nothing here deletes anything: the import screen shows the reasons
// and the admin decides.

import { words } from "./matcher";
import type { SongSlide } from "./songs";

export interface ReviewSong {
  title: string;
  slides: SongSlide[];
}

const TITLE_NOT_SONG =
  /\b(announcements?|notices?|prayer points?|confessions?|offering time|account(s| numbers?| details)?|bank|programme|program|notes?|concordance|registration|tithes?|first timers?|welcome note|outreach|meeting|minutes|agenda|facebook|instagram|youtube|whatsapp|email|contact)\b/i;
// "Barr Akerele", "Engr Timothy", "Pastor (Mrs) …": speaker or member introductions.
const PERSON_TITLE = /^(barr|engr|dr|prof|pastor|pst|rev|revd|mr|mrs|miss|bro|sis|deacon|deaconess|dcn|dcns|evang|elder|apostle|bishop|hon|chief|arc|arch)\.?\s+[A-Z]/i;
const LINK = /https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.[\w.]+/i;
// Nigerian account numbers (10 digits), phone numbers, bank words.
const MONEY_OR_PHONE = /\b\d{10}\b|\b0[789][01]\d{8}\b|\+?234\s?\d|\baccount\s+(number|name|no)\b|\b(gtb|gtbank|uba|opay|palmpay|moniepoint|kuda)\b|\b(zenith|access|first|fidelity|wema|sterling|union|polaris|keystone|stanbic)\s+bank\b/i;
const SCRIPTURE_REF = /\b(?:[1-3]\s?)?[A-Z][a-z]+\.?\s\d{1,3}:\d{1,3}/g;

/** Why this doesn't look like a song, or null when it does. */
export function notSongReason(song: ReviewSong): string | null {
  const text = song.slides.map((s) => s.text).join("\n");
  if (LINK.test(text) || LINK.test(song.title)) return "Has a web link or email";
  if (MONEY_OR_PHONE.test(text) || MONEY_OR_PHONE.test(song.title)) return "Has an account or phone number";
  if (PERSON_TITLE.test(song.title.trim())) return "Looks like an introduction of a person";
  if (TITLE_NOT_SONG.test(song.title)) return "Title sounds like an announcement or notes";
  if ((text.match(SCRIPTURE_REF) ?? []).length >= 2) return "Mostly Bible references";
  const lines = text.split("\n").filter(Boolean);
  if (lines.length && text.length / lines.length > 110) return "Reads like paragraphs, not lyrics";
  return null;
}

/**
 * Groups near-copies: same title (ignoring case and punctuation) and at
 * least 80% of the words shared. Returns, for each song, the index of the
 * copy to keep (itself when it is the keeper or has no copies). The keeper
 * is the fullest version: the most slides, then the most words.
 */
export function nearCopies(songs: ReviewSong[]): number[] {
  const keepOf = songs.map((_, i) => i);
  const sets = songs.map((s) => new Set(s.slides.flatMap((sl) => words(sl.text))));
  const size = (i: number) => songs[i].slides.length * 100000 + sets[i].size;
  const byTitle = new Map<string, number[]>();
  songs.forEach((s, i) => {
    const k = words(s.title).join(" ");
    byTitle.set(k, [...(byTitle.get(k) ?? []), i]);
  });
  for (const group of byTitle.values()) {
    if (group.length < 2) continue;
    // Cluster within the title group by shared words.
    const clusters: number[][] = [];
    for (const i of group) {
      const home = clusters.find((c) => {
        const a = sets[c[0]];
        const b = sets[i];
        let shared = 0;
        for (const w of b) if (a.has(w)) shared++;
        return shared / Math.max(1, Math.min(a.size, b.size)) >= 0.8;
      });
      if (home) home.push(i);
      else clusters.push([i]);
    }
    for (const c of clusters) {
      const keeper = c.reduce((best, i) => (size(i) > size(best) ? i : best), c[0]);
      for (const i of c) keepOf[i] = keeper;
    }
  }
  return keepOf;
}
