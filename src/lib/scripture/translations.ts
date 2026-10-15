// The translations the app can show. The built-in ones are public domain and
// live at /bibles/<id>.json, built by `npm run bible:all`. More are added
// from the admin site (separate repo, Scripture-Admin): their text sits in
// the "bibles" storage bucket and their details in the translations table.

export interface TranslationInfo {
  id: string;
  /** Shown on screen next to the reference. */
  short: string;
  name: string;
  /** Where the text is. Built-in translations are served by the app itself. */
  url: string;
  /** Credit line shown on the projector, when the licence asks for one. */
  copyright?: string;
}

export const BUILT_IN_TRANSLATIONS: TranslationInfo[] = [
  { id: "kjv", short: "KJV", name: "King James Version", url: "/bibles/kjv.json" },
  { id: "bsb", short: "BSB", name: "Berean Standard Bible", url: "/bibles/bsb.json" },
  { id: "nheb", short: "NHEB", name: "New Heart English Bible", url: "/bibles/nheb.json" },
  { id: "asv", short: "ASV", name: "American Standard Version", url: "/bibles/asv.json" },
  { id: "bbe", short: "BBE", name: "Bible in Basic English", url: "/bibles/bbe.json" },
  { id: "akjv", short: "AKJV", name: "American King James Version", url: "/bibles/akjv.json" },
  { id: "ukjv", short: "UKJV", name: "Updated King James Version", url: "/bibles/ukjv.json" },
  { id: "dby", short: "DBY", name: "Darby Translation", url: "/bibles/dby.json" },
  { id: "ylt", short: "YLT", name: "Young's Literal Translation", url: "/bibles/ylt.json" },
  { id: "wbt", short: "WBT", name: "Webster's Bible", url: "/bibles/wbt.json" },
  { id: "acv", short: "ACV", name: "A Conservative Version", url: "/bibles/acv.json" },
];

export const DEFAULT_TRANSLATION = "kjv";

export interface TranslationRow {
  id: string;
  short: string;
  name: string;
  copyright: string;
  version: number;
}

/** The public URL of an added translation's text. */
export function storedBibleUrl(id: string, version: number): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/bibles/${id}/v${version}.json`;
}

export function fromRow(r: TranslationRow): TranslationInfo {
  return { id: r.id, short: r.short, name: r.name, url: storedBibleUrl(r.id, r.version), copyright: r.copyright || undefined };
}

/** A row of translation_order: where the admin site put a translation, and whether it's hidden. */
export interface OrderRow {
  translation_id: string;
  position: number;
  hidden: boolean;
}

/**
 * The list in the admin site's order, each marked hidden or not. Ones the
 * admin hasn't placed yet (a new upload) go at the end in their usual order.
 * Same as inAdminOrder in Scripture-Admin; keep them in step.
 */
export function inAdminOrder<T extends { id: string }>(list: T[], order: OrderRow[]): (T & { hidden: boolean })[] {
  const byId = new Map(order.map((o) => [o.translation_id, o]));
  return list
    .map((t, i) => ({ t, i, o: byId.get(t.id) }))
    .sort((a, b) => (a.o?.position ?? Infinity) - (b.o?.position ?? Infinity) || a.i - b.i)
    .map(({ t, o }) => ({ ...t, hidden: !!o?.hidden }));
}

/** Starred translations first (in list order), then the rest. */
export function starredFirst<T extends { id: string }>(list: T[], starred: ReadonlySet<string>): T[] {
  return [...list.filter((t) => starred.has(t.id)), ...list.filter((t) => !starred.has(t.id))];
}

export function findTranslation(list: TranslationInfo[], id: string): TranslationInfo {
  return list.find((t) => t.id === id) ?? list[0];
}
