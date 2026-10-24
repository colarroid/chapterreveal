"use client";

import { Download, LoaderCircle, Music } from "lucide-react";
import { useState } from "react";
import { Button, Field } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

// The songs sung between two dates, as a spreadsheet: what a church with a
// CCLI licence reports (title, author, CCLI number, how many services), from
// the songs_shown log (migration 0024).

const day = (d: Date) => d.toISOString().slice(0, 10);
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function SongReport() {
  const [from, setFrom] = useState(() => day(new Date(Date.now() - 182 * 86_400_000)));
  const [to, setTo] = useState(() => day(new Date()));
  const [state, setState] = useState<"idle" | "running" | "error" | "empty">("idle");

  async function download() {
    setState("running");
    try {
      const supabase = supabaseBrowser();
      const { data: shown, error } = await supabase
        .from("songs_shown")
        .select("song_id, title, shown_at, service_id")
        .gte("shown_at", `${from}T00:00:00Z`)
        .lt("shown_at", `${day(new Date(new Date(to).getTime() + 86_400_000))}T00:00:00Z`)
        .order("shown_at")
        .limit(10000);
      if (error) throw error;
      if (!shown?.length) {
        setState("empty");
        return;
      }
      // Each song's author and CCLI number from the library, a page of ids at a time.
      const ids = [...new Set(shown.map((r) => r.song_id as string | null).filter((id): id is string => !!id))];
      const details = new Map<string, { author: string; ccli_number: string }>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from("songs").select("id, author, ccli_number").in("id", ids.slice(i, i + 200));
        for (const s of data ?? []) details.set(s.id as string, { author: (s.author as string) ?? "", ccli_number: (s.ccli_number as string) ?? "" });
      }
      // One line per song: the services it was sung in.
      const rows = new Map<string, { title: string; author: string; ccli: string; services: Set<string>; first: string; last: string }>();
      for (const r of shown) {
        const key = (r.song_id as string | null) ?? `title:${r.title}`;
        const d = details.get(r.song_id as string);
        const row = rows.get(key) ?? { title: r.title as string, author: d?.author ?? "", ccli: d?.ccli_number ?? "", services: new Set<string>(), first: r.shown_at as string, last: r.shown_at as string };
        row.services.add(r.service_id as string);
        row.last = r.shown_at as string;
        rows.set(key, row);
      }
      const lines = [
        ["Title", "Author", "CCLI number", "Services", "First sung", "Last sung"].join(","),
        ...[...rows.values()]
          .sort((a, b) => b.services.size - a.services.size || a.title.localeCompare(b.title))
          .map((r) => [r.title, r.author, r.ccli, r.services.size, r.first.slice(0, 10), r.last.slice(0, 10)].map(csvCell).join(",")),
      ];
      const blob = new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `songs-${from}-to-${to}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <details className="group card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 select-none">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted">
          <Music size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Song report</span>
          <span className="block text-sm text-muted">The songs sung between two dates, with their CCLI numbers, as a spreadsheet for your licence report.</span>
        </span>
      </summary>
      <form
        className="flex flex-wrap items-end gap-3 border-t border-line px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          void download();
        }}
      >
        <div className="w-44">
          <Field label="From" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />
        </div>
        <div className="w-44">
          <Field label="To" type="date" value={to} min={from} max={day(new Date())} onChange={(e) => setTo(e.target.value)} required />
        </div>
        <Button type="submit" variant="secondary" disabled={state === "running"}>
          {state === "running" ? <LoaderCircle size={15} className="animate-spin" /> : <Download size={15} />} Download CSV
        </Button>
        {state === "error" && <p className="basis-full text-sm text-negative">The report couldn&apos;t be made. Try again.</p>}
        {state === "empty" && <p className="basis-full text-sm text-muted">No songs were put on screen between those dates.</p>}
      </form>
    </details>
  );
}
