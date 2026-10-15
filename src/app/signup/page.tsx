import { AuthFlow } from "@/components/auth-flow";

export const metadata = { title: "Create your account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string; email?: string }> }) {
  const { invite, email } = await searchParams;
  return <AuthFlow mode="signup" invite={invite ?? ""} initialEmail={email ?? ""} />;
}
