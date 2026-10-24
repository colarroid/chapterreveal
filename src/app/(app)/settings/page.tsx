import { getTranslations } from "@/lib/scripture/translations-server";
import { requireMembership, supabaseServer } from "@/lib/supabase/server";
import { Settings, type Member } from "./settings";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const m = await requireMembership();
  const supabase = await supabaseServer();
  const isAdmin = m.role === "admin";

  const [{ data: members }, { data: invites }, { data: profile }, translations] = await Promise.all([
    supabase.rpc("church_member_list"),
    isAdmin
      ? supabase
          .from("church_invites")
          .select("id, code, role, expires_at")
          .eq("church_id", m.churchId)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("profiles").select("first_name, last_name, phone").eq("id", m.userId).maybeSingle(),
    getTranslations(),
  ]);

  return (
    <Settings
      churchId={m.churchId}
      churchName={m.churchName}
      userId={m.userId}
      isAdmin={isAdmin}
      screenToken={m.screenToken}
      members={(members ?? []) as Member[]}
      profile={{ firstName: profile?.first_name ?? "", lastName: profile?.last_name ?? "", phone: profile?.phone ?? "" }}
      address={m.address}
      invites={(invites ?? []) as { id: string; code: string; role: string; expires_at: string }[]}
      settings={m.settings}
      translations={translations}
      weeklySummary={!!process.env.ANTHROPIC_API_KEY}
    />
  );
}
