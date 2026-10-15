import { AuthFlow } from "@/components/auth-flow";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ link?: string; email?: string }> }) {
  const { link, email } = await searchParams;
  return (
    <AuthFlow
      mode="signin"
      initialEmail={email ?? ""}
      notice={link === "expired" ? "That link has expired or was already used. Sign in, or request a new one." : undefined}
    />
  );
}
