import type { Metadata } from "next";
import { OutputScreen } from "../output";

export const metadata: Metadata = { title: "Online output", robots: { index: false, follow: false } };

// The livestream output: the same slides as the projector, on chroma green
// for vMix or OBS to key out. Lyrics sit in a lower third; scripture fills
// the screen.
export default async function OnlineScreenPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ present?: string }> }) {
  const { token } = await params;
  const { present } = await searchParams;
  return <OutputScreen token={token} layout="full" online present={present === "1"} />;
}
