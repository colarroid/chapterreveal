import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CHROMA_GREEN } from "@/lib/display/theme";
import { OutputScreen } from "../../output";

export const metadata: Metadata = { title: "Output", robots: { index: false, follow: false } };

// Separate outputs for vMix and OBS: /screen/<address>/scripture and
// /screen/<address>/lyrics fill the screen with the Design look. This is the
// lower third: a band at the bottom on chroma green, for keying.
const ONLY = { scripture: "scripture", lyrics: "song" } as const;

export default async function LowerThirdOutput({ params, searchParams }: { params: Promise<{ token: string; view: string }>; searchParams: Promise<{ present?: string }> }) {
  const { token, view } = await params;
  const { present } = await searchParams;
  const only = ONLY[view as keyof typeof ONLY];
  if (!only) notFound();
  return <OutputScreen token={token} layout="lower" only={only} chroma={CHROMA_GREEN} present={present === "1"} />;
}
