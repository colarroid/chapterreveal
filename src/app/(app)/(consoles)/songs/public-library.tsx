"use client";

import { Check, LoaderCircle, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

// Every song in ReedArk (one copy of each, migration 0037): searched here,
// by title or any line, and added to the church's library with a tag, not
// a copy of the words. A song already in its library says so instead.

interface PublicSong {
  id: string;
  title: string;
  author: string;
  first_line: string;
}

const LIMIT = 40;

export function PublicLibrary({ copied, onCopy }: { copied: Set<string>; onCopy: (id: string) => Promise<string | void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PublicSong[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    void supabaseBrowser()
      .from("songs")
      .select("id", { count: "exact", head: true })
      .is("church_id", null)
      .then(({ count }) => setTotal(count ?? 0));
  }, []);

  // Titles and words, after a pause in typing.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    let live = true;
    const t = setTimeout(async () => {
      const escape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
      const pattern = `%${escape(q)}%`;
      // The words column (migration 0038) holds the lyrics in lower case
      // without punctuation, indexed for this search; the query is folded
      // the same way. Before that migration runs, the plain lyrics.
      const folded = q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const base = () => supabaseBrowser().from("songs").select("id, title, author, first_line").is("church_id", null).order("title").limit(LIMIT);
      const [byTitle, indexed] = await Promise.all([base().ilike("title", pattern), base().ilike("words", `%${escape(folded)}%`)]);
      const byWords = indexed.error ? await base().ilike("body", pattern) : indexed;
      if (!live) return;
      const seen = new Map<string, PublicSong>();
      for (const r of [...(byTitle.data ?? []), ...(byWords.data ?? [])] as PublicSong[]) if (!seen.has(r.id)) seen.set(r.id, r);
      setResults([...seen.values()].slice(0, LIMIT));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  async function copy(id: string) {
    setBusy(id);
    setError(null);
    const problem = await onCopy(id);
    setBusy(null);
    if (problem) setError({ id, text: problem });
  }

  return (
    <>
      <label className="relative block">
        <span className="sr-only">Search all songs</span>
        <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-faint" />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all songs: titles and lyrics"
          className="inset-field h-10 w-full rounded-full bg-surface-2 pr-4 pl-10 text-sm placeholder:text-faint"
        />
      </label>
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {results?.map((s) => {
          const have = copied.has(s.id);
          return (
            <li key={s.id} className="flex items-center gap-2 rounded-md px-3 py-2 transition hover:bg-surface-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{s.title}</span>
                <span className="block truncate text-xs text-muted">{s.first_line || s.author || " "}</span>
                {error?.id === s.id && <span className="block text-xs text-negative">{error.text}</span>}
              </span>
              {have ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-accent">
                  <Check size={13} /> In your library
                </span>
              ) : (
                <Button size="sm" variant="secondary" className="shrink-0" onClick={() => void copy(s.id)} disabled={busy !== null} title="Add to your library">
                  {busy === s.id ? <LoaderCircle size={13} className="animate-spin" /> : <Plus size={13} />} Add
                </Button>
              )}
            </li>
          );
        })}
        {results && results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">No public songs match.</li>}
        {!results && (
          <li className="px-4 py-10 text-center text-sm text-muted">
            {total === null ? " " : `${total.toLocaleString()} ${total === 1 ? "song" : "songs"} in ReedArk.`}
            <span className="mt-1 block text-xs">Search by title or any line, then add a song to your library to use it.</span>
          </li>
        )}
      </ol>
    </>
  );
}
