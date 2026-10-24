"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

// The service record (transcript lines and verses shown) is written to this
// browser first and sent to Supabase whenever the connection allows. Kept in
// localStorage, so an internet outage, a crashed tab or a reload loses
// nothing: whatever is waiting goes up as soon as the console is back online.
//
// Every row carries a key the database treats as unique (service_id + seq for
// transcript lines, client_id for verses), so sending one twice after a
// half-finished request is harmless.

type Table = "transcript_segments" | "verses_shown" | "songs_shown" | "song_detections";

interface Entry {
  table: Table | "services";
  row: Record<string, unknown>;
  /** For "services": update the row with this id instead of inserting. */
  id?: string;
  /** Failed sends while online. */
  tries?: number;
}

const STORAGE_KEY = "scripture.outbox";
const CONFLICT: Record<Table, string> = {
  transcript_segments: "service_id,seq",
  verses_shown: "client_id",
  songs_shown: "client_id",
  song_detections: "client_id",
};
const RETRY_MS = 5000;
// A row the database keeps refusing (its service was deleted, say) is
// dropped eventually so it can't hold up everything queued behind it.
// Offline attempts don't count: flush() skips them.
const MAX_TRIES = 30;

export class Outbox {
  private entries: Entry[] = [];
  private sending = false;
  private timer: ReturnType<typeof setInterval>;
  private onOnline = () => void this.flush();
  /** Called with how many records are waiting, whenever that changes. */
  onPending?: (count: number) => void;

  constructor(private supabase: SupabaseClient) {
    try {
      this.entries = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
      this.entries = [];
    }
    window.addEventListener("online", this.onOnline);
    this.timer = setInterval(() => void this.flush(), RETRY_MS);
    // Anything left from an earlier session goes up straight away.
    void this.flush();
  }

  get pending(): number {
    return this.entries.length;
  }

  add(table: Table, row: Record<string, unknown>) {
    this.entries.push({ table, row });
    this.save();
    void this.flush();
  }

  /** Marks a service ended (or updates it) once the connection allows. */
  updateService(id: string, patch: Record<string, unknown>) {
    this.entries.push({ table: "services", id, row: patch });
    this.save();
    void this.flush();
  }

  /** Sends everything waiting. Safe to call often; runs one batch at a time. */
  async flush(): Promise<void> {
    if (this.sending || this.entries.length === 0) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    this.sending = true;
    try {
      const batch = this.entries.slice();
      const failed: Entry[] = [];
      const fail = (e: Entry, code: string | undefined) => {
        // Only a refusal from the database itself (it carries a Postgres
        // error code) counts. "Connected to Wi-Fi but no internet" fails
        // with no code, and must never use up a row's tries.
        if (/^[0-9A-Z]{5}$/.test(code ?? "")) e.tries = (e.tries ?? 0) + 1;
        if ((e.tries ?? 0) < MAX_TRIES) failed.push(e);
      };
      const send = (table: Table, rows: Entry[]) =>
        this.supabase.from(table).upsert(
          rows.map((e) => e.row),
          { onConflict: CONFLICT[table], ignoreDuplicates: true },
        );
      // Inserts first, so a service's last lines land before it is marked ended.
      for (const table of Object.keys(CONFLICT) as Table[]) {
        const rows = batch.filter((e) => e.table === table);
        if (!rows.length) continue;
        const { error } = await send(table, rows);
        if (!error) continue;
        console.warn(`Saving ${table} failed; will retry`, error.message);
        // The database refused the batch: one bad row (its service deleted,
        // say) must not hold back or use up the tries of the good ones, so
        // each goes on its own and only the refused one counts a try.
        if (/^[0-9A-Z]{5}$/.test(error.code ?? "") && rows.length > 1) {
          for (const e of rows) {
            const one = await send(table, [e]);
            if (one.error) fail(e, one.error.code);
          }
        } else {
          for (const e of rows) fail(e, error.code);
        }
      }
      for (const e of batch.filter((x) => x.table === "services")) {
        const { error } = await this.supabase.from("services").update(e.row).eq("id", e.id!);
        if (error) fail(e, error.code);
      }
      // Keep what failed plus anything added while we were sending.
      const done = new Set(batch.filter((e) => !failed.includes(e)));
      this.entries = this.entries.filter((e) => !done.has(e));
      this.save();
    } finally {
      this.sending = false;
    }
  }

  close() {
    clearInterval(this.timer);
    window.removeEventListener("online", this.onOnline);
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch {
      // Storage full or blocked: entries still live in memory for this tab.
    }
    this.onPending?.(this.entries.length);
  }
}

let shared: Outbox | null = null;

/** One outbox per tab, shared by the transcript saver and the verse log. */
export function outbox(supabase: SupabaseClient): Outbox {
  if (!shared) shared = new Outbox(supabase);
  return shared;
}
