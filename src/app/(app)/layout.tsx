import { requireMembership } from "@/lib/supabase/server";
import { AppHeader } from "./header";

// The church console and its settings are private.
export const metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const m = await requireMembership();
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader churchName={m.churchName} email={m.email} firstName={m.firstName} lastName={m.lastName} />
      {children}
    </div>
  );
}
