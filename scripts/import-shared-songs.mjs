// One-off: adds prepared songs to the shared library, as the platform would.
//   node scripts/import-shared-songs.mjs "VIDEOPSALM 1/import-sql/clc-rows.json"
//
// Needs SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase > Settings > API).
// That key bypasses every access rule: keep it out of the browser (never
// NEXT_PUBLIC_), and remove it from .env.local when the import is done.
// Songs already in the library are skipped, so running it twice is safe.
import fs from "node:fs";

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Add SUPABASE_SERVICE_ROLE_KEY to .env.local first.");
  process.exit(1);
}

const file = process.argv[2];
const rows = JSON.parse(fs.readFileSync(file, "utf8"));
if (rows.some((r) => r.church_id !== null)) throw new Error("Only shared songs (church_id null) belong in this import.");

const BATCH = 400;
let added = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const res = await fetch(`${url}/rest/v1/songs?on_conflict=library,fingerprint&select=id`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // Skip songs already there; return only the ones added.
      Prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(rows.slice(i, i + BATCH)),
  });
  if (!res.ok) {
    console.error(`Stopped at ${i}: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  added += (await res.json()).length;
  console.log(`${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
}
console.log(`Added ${added} songs; ${rows.length - added} were already in the shared library.`);
