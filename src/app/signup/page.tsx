import { redirect } from "next/navigation";
import { AuthFlow } from "@/components/auth-flow";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata = {
  title: "Create your account",
  description: "Set up ReedArk for your church in a few minutes: scripture and song lyrics on your projector and livestream as they're preached and sung.",
  alternates: { canonical: "/signup" },
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string; email?: string }> }) {
  const { invite, email } = await searchParams;
  // Already signed in: to the console, or to join with the invite.
  if (await getSessionUser()) redirect(invite ? `/onboarding?invite=${encodeURIComponent(invite)}` : "/dashboard");
  return <AuthFlow mode="signup" invite={invite ?? ""} initialEmail={email ?? ""} />;
}
