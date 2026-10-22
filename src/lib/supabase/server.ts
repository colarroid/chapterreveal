import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

// Speed notes. The project signs sessions with ES256, so getClaims() checks
// the JWT locally against cached public keys instead of a ~0.5 s round trip
// to Supabase Auth on every request. Everything below is wrapped in React
// cache(), so a layout and its page share one client, one session check and
// one membership query per request.

export const supabaseServer = cache(async () => {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session instead.
        }
      },
    },
  });
});

export interface SessionUser {
  id: string;
  email: string;
}

/** The signed-in user from the verified session token, or null. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? "" };
});

export interface Membership {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  churchId: string;
  churchName: string;
  role: "admin" | "operator";
  settings: { translation: string; silence_end_minutes: number; display?: unknown; take_down?: unknown; take_down_seconds?: unknown };
  /** The secret in the church's output page URL. */
  screenToken: string;
  address: { country: string; region: string; street: string };
}

/**
 * The signed-in user and their church, in one query. Sends them to login, or
 * to onboarding when they have no church yet.
 */
export const requireMembership = cache(async (): Promise<Membership> => {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = await supabaseServer();
  // Side by side: one round trip, not two.
  const [{ data }, { data: profile }] = await Promise.all([
    supabase
      .from("church_members")
      .select("role, church_id, churches(name, settings, country_code, region, street_address, screens(token))")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("profiles").select("first_name, last_name").eq("id", user.id).maybeSingle(),
  ]);
  if (!data) redirect("/onboarding");

  const church = data.churches as unknown as {
    name: string;
    settings: Membership["settings"];
    country_code: string | null;
    region: string | null;
    street_address: string | null;
    screens: { token: string } | { token: string }[] | null;
  };
  const screen = Array.isArray(church.screens) ? church.screens[0] : church.screens;
  return {
    userId: user.id,
    email: user.email,
    firstName: profile?.first_name ?? "",
    lastName: profile?.last_name ?? "",
    churchId: data.church_id,
    churchName: church.name,
    role: data.role,
    settings: church.settings,
    screenToken: screen?.token ?? "",
    address: { country: church.country_code ?? "", region: church.region ?? "", street: church.street_address ?? "" },
  };
});
