import { requireMembership } from "@/lib/supabase/server";
import { baseFor, loadScripture, loadSlides, loadSongs } from "./data";
import { Workspace } from "./workspace";

// The three consoles share this layout, which stays put while you move
// between them: their data loads once, side by side, and each console shows
// as soon as its own part arrives. The pages themselves render nothing.
export default async function ConsolesLayout({ children }: { children: React.ReactNode }) {
  const m = await requireMembership();
  return (
    <>
      <Workspace base={baseFor(m)} scripture={loadScripture(m)} songs={loadSongs(m)} slides={loadSlides(m)} />
      {children}
    </>
  );
}
