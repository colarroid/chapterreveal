import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// The outbox runs in the browser: give it the little it needs of one.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

/** A Supabase stand-in whose upsert refuses any row whose `bad` is true (a Postgres error code), and records every call. */
function fakeSupabase() {
  const calls: Record<string, unknown>[][] = [];
  const supabase = {
    from: () => ({
      upsert: async (rows: Record<string, unknown>[]) => {
        calls.push(rows);
        return rows.some((r) => r.bad) ? { error: { code: "23503", message: "violates foreign key" } } : { error: null };
      },
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  } as unknown as SupabaseClient;
  return { supabase, calls };
}

describe("outbox", () => {
  it("sends the good rows of a batch the database refused, and keeps only the bad one", async () => {
    const { Outbox } = await import("./outbox");
    const { supabase, calls } = fakeSupabase();
    // Queued from an earlier session, so all three go in one batch.
    store.set(
      "scripture.outbox",
      JSON.stringify([
        { table: "transcript_segments", row: { service_id: "a", seq: 1, text: "good" } },
        { table: "transcript_segments", row: { service_id: "gone", seq: 1, text: "bad", bad: true } },
        { table: "transcript_segments", row: { service_id: "a", seq: 2, text: "good too" } },
      ]),
    );
    const ob = new Outbox(supabase); // sends what was queued straight away
    // The batch, then each row on its own.
    await vi.waitFor(() => expect(calls).toHaveLength(4));
    expect(calls[0]).toHaveLength(3);
    expect(calls.slice(1).map((c) => c.length)).toEqual([1, 1, 1]);
    expect(ob.pending).toBe(1);
    expect(JSON.parse(store.get("scripture.outbox")!)[0].row.text).toBe("bad");
    ob.close();
  });

  it("drops a row the database keeps refusing, but never one that failed for lack of a connection", async () => {
    const { Outbox } = await import("./outbox");
    let online = false;
    const supabase = {
      from: () => ({ upsert: async () => (online ? { error: { code: "23503", message: "refused" } } : { error: { message: "Failed to fetch" } }) }),
    } as unknown as SupabaseClient;
    const ob = new Outbox(supabase);
    ob.add("verses_shown", { client_id: "x" });
    for (let i = 0; i < 40; i++) await ob.flush();
    expect(ob.pending).toBe(1);
    online = true;
    for (let i = 0; i < 30; i++) await ob.flush();
    expect(ob.pending).toBe(0);
    ob.close();
  });
});
