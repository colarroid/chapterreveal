import { createCipheriv, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUser, supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// A licensed Bible (added on the admin site) for a signed-in church member,
// encrypted with the church's own key (AES-256-GCM): what crosses the
// network, and the copy the console keeps for offline use, is unreadable
// without it. The console decrypts it in memory (lib/scripture/bible-crypto).
// The file itself is in a private bucket: nobody can download it directly.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; version: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, version } = await params;
  const v = Number(version.replace(/^v/, ""));
  if (!/^[a-z0-9][a-z0-9-]{1,15}$/.test(id) || !Number.isInteger(v) || v < 1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await supabaseServer();
  const [{ data: key, error: keyError }, file] = await Promise.all([
    supabase.rpc("bible_key"),
    // Storage only gives a published translation's file to signed-in users (migration 0022).
    supabase.storage.from("bibles").download(`${id}/v${v}.json`),
  ]);
  if (keyError || typeof key !== "string") return NextResponse.json({ error: "No church" }, { status: 403 });
  if (file.error || !file.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  const body = Buffer.concat([iv, cipher.update(Buffer.from(await file.data.arrayBuffer())), cipher.final(), cipher.getAuthTag()]);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      // Only this browser may keep it: it's this church's encryption.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
