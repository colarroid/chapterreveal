import { redirect } from "next/navigation";
import { AuthFlow } from "@/components/auth-flow";
import { getSessionUser } from "@/lib/supabase/server";

export const metadata = {
  title: "Sign in",
  description: "Sign in to your church's ReedArk console.",
  alternates: { canonical: "/login" },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ link?: string; email?: string }> }) {
  // Already signed in: straight to the console.
  if (await getSessionUser()) redirect("/dashboard");
  const { link, email } = await searchParams;
  return (
    <AuthFlow
      mode="signin"
      initialEmail={email ?? ""}
      notice={link === "expired" ? "That link has expired or was already used. Sign in, or request a new one." : undefined}
    />
  );
}
