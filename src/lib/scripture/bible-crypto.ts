"use client";

// The church's key for its licensed Bibles (see /api/bible). Fetched once
// after sign-in and kept in this browser's IndexedDB as a key that can't be
// exported, so the console can read the encrypted offline copy without the
// internet, while copying the stored file gives nothing readable.
import { supabaseBrowser } from "@/lib/supabase/client";

const DB = "reedark-keys";
const STORE = "keys";
const NAME = "bible";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function stored(): Promise<CryptoKey | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const get = db.transaction(STORE).objectStore(STORE).get(NAME);
      get.onsuccess = () => resolve((get.result as CryptoKey | undefined) ?? null);
      get.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function keep(key: CryptoKey) {
  try {
    const db = await openDb();
    db.transaction(STORE, "readwrite").objectStore(STORE).put(key, NAME);
  } catch {
    // Private mode or storage blocked: the key is fetched again next time.
  }
}

let current: Promise<CryptoKey> | null = null;

/** This church's key: from this browser if kept, else from the server (then kept). */
export function bibleKey(): Promise<CryptoKey> {
  current ??= (async () => {
    const kept = await stored();
    if (kept) return kept;
    const { data, error } = await supabaseBrowser().rpc("bible_key");
    if (error || typeof data !== "string") throw new Error("Couldn't get the key for this church's Bibles.");
    const raw = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    // Not extractable: usable to decrypt here, never readable out.
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    await keep(key);
    return key;
  })();
  current.catch(() => (current = null));
  return current;
}

/** Decrypts what /api/bible sent: 12-byte IV, then the ciphertext and tag. */
export async function decryptBible(data: ArrayBuffer): Promise<string> {
  const key = await bibleKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, key, data.slice(12));
  return new TextDecoder().decode(plain);
}

/** On sign out: the key leaves this browser. */
export function forgetBibleKey() {
  current = null;
  try {
    indexedDB.deleteDatabase(DB);
  } catch {}
}
