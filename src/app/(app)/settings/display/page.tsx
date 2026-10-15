import { redirect } from "next/navigation";
import { cleanDisplay } from "@/lib/display/theme";
import { requireMembership } from "@/lib/supabase/server";
import { DisplayEditor } from "@/components/display-editor";

export const metadata = { title: "Display" };

// Church admins only: the look of the projector is a church decision, not
// something to change by accident mid-service.
export default async function DisplayPage() {
  const m = await requireMembership();
  if (m.role !== "admin") redirect("/settings");
  return <DisplayEditor churchId={m.churchId} display={cleanDisplay(m.settings.display)} />;
}
