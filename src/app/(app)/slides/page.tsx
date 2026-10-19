import { Notice } from "@/components/ui";
import { cloudinaryConfig, destroy } from "@/lib/cloudinary";
import { cleanDisplay } from "@/lib/display/theme";
import type { Plan } from "@/lib/plans";
import { requireMembership, supabaseServer } from "@/lib/supabase/server";
import { Slides, type SavedSlide } from "./slides";

export const metadata = { title: "Slides" };

// Text, picture and video slides: announcements, notices, flyers. Kept for
// reuse; on the Free plan pictures and videos are kept 7 days.
export default async function SlidesPage() {
  const m = await requireMembership();
  const supabase = await supabaseServer();

  // Expired pictures and videos (Free plan) go first: from the list, and
  // their files from Cloudinary.
  const { data: expired } = await supabase.rpc("take_expired_slides");
  const config = cloudinaryConfig();
  if (config && Array.isArray(expired) && expired.length) {
    // Every picture on an expired picture slide, or the video.
    const files = (expired as { public_id: string | null; kind: string; images?: { public_id: string }[] | null }[]).flatMap((e) =>
      e.kind === "image" && e.images?.length
        ? e.images.map((i) => ({ kind: "image" as const, id: i.public_id }))
        : e.public_id
          ? [{ kind: e.kind === "video" ? ("video" as const) : ("image" as const), id: e.public_id }]
          : [],
    );
    await Promise.allSettled(files.map((x) => destroy(config, x.kind, x.id)));
  }

  const [{ data, error }, { data: plan }] = await Promise.all([
    supabase.from("slides").select("id, kind, title, body, image_url, images, position, expires_at").eq("church_id", m.churchId).order("position").order("created_at"),
    supabase.rpc("church_plan", { p_church: m.churchId }),
  ]);
  if (error) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <Notice tone="error">Could not load slides: {error.message}. Have migrations 0020 and 0021 been run?</Notice>
      </main>
    );
  }
  return (
    <Slides
      churchId={m.churchId}
      userId={m.userId}
      screenToken={m.screenToken}
      display={cleanDisplay(m.settings.display)}
      plan={(plan as Plan) === "paid" ? "paid" : "free"}
      initial={(data ?? []) as SavedSlide[]}
    />
  );
}
