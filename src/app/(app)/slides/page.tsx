import { Notice } from "@/components/ui";
import { cleanDisplay } from "@/lib/display/theme";
import { requireMembership, supabaseServer } from "@/lib/supabase/server";
import { Slides, type SavedSlide } from "./slides";

export const metadata = { title: "Slides" };

// Text and picture slides: announcements, notices, flyers. Kept for reuse.
export default async function SlidesPage() {
  const m = await requireMembership();
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("slides")
    .select("id, kind, title, body, image_url, position")
    .eq("church_id", m.churchId)
    .order("position")
    .order("created_at");
  if (error) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <Notice tone="error">Could not load slides: {error.message}. Has migration 0020 been run?</Notice>
      </main>
    );
  }
  return (
    <Slides
      churchId={m.churchId}
      userId={m.userId}
      screenToken={m.screenToken}
      display={cleanDisplay(m.settings.display)}
      initial={(data ?? []) as SavedSlide[]}
    />
  );
}
