import { redirect } from "next/navigation";
import { getSessionUser, supabaseServer } from "@/lib/supabase/server";
import { OnboardingForm } from "./form";

export const metadata = { title: "Your church" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = await supabaseServer();
  // The fast check above only reads the token in the cookie. Before creating
  // a church, ask Supabase whether the account still exists: a deleted
  // account's token stays valid for up to an hour.
  const { data: live, error } = await supabase.auth.getUser();
  if (error || !live.user) redirect("/auth/signout");
  const { data: member } = await supabase.from("church_members").select("church_id").eq("user_id", user.id).maybeSingle();
  if (member) redirect("/dashboard");

  const { invite } = await searchParams;
  return <OnboardingForm invite={invite ?? ""} />;
}
