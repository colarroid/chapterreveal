import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Clears this browser's sign-in, then goes to the sign-in page. Used when a
// session outlives its account (deleted in Supabase): its token still checks
// out locally until it expires, but the account behind it is gone.
export async function GET(req: Request) {
  const supabase = await supabaseServer();
  // "local": just this browser. The account may no longer exist to sign out of.
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  return NextResponse.redirect(new URL("/login", req.url));
}
