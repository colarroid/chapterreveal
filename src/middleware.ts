import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Keeps the Supabase session cookie fresh on every page load.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // Verifies the JWT locally (ES256 keys) and refreshes it when it is close
  // to expiry. No round trip to Supabase Auth on a valid session.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  // Skip static files, the Bible data, and the output screen (it has no login).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw.js|bibles/|worklets/|screen/).*)"],
};
