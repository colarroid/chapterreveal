import { AuthFlow } from "@/components/auth-flow";

export const metadata = {
  title: "Create your account",
  description: "Set up ReedArk for your church in a few minutes: scripture and song lyrics on your projector and livestream as they're preached and sung.",
  alternates: { canonical: "/signup" },
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ invite?: string; email?: string }> }) {
  const { invite, email } = await searchParams;
  return <AuthFlow mode="signup" invite={invite ?? ""} initialEmail={email ?? ""} />;
}
