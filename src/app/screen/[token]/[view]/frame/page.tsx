import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CHROMA_GREEN } from "@/lib/display/theme";
import { OutputScreen } from "../../output";

export const metadata: Metadata = { title: "Output", robots: { index: false, follow: false } };

// The frame outputs: /screen/<address>/scripture/frame and .../lyrics/frame.
// Nothing but the words, filling the page at whatever size the OBS browser
// source is set to (the text area of the church's own lower-third design),
// on the key green (#00FF00). ?bg=clear makes it see-through instead.
const ONLY = { scripture: "scripture", lyrics: "song" } as const;

export default async function FrameOutput({ params, searchParams }: { params: Promise<{ token: string; view: string }>; searchParams: Promise<{ bg?: string }> }) {
  const { token, view } = await params;
  const { bg } = await searchParams;
  const only = ONLY[view as keyof typeof ONLY];
  if (!only) notFound();
  return <OutputScreen token={token} layout="frame" only={only} chroma={bg === "clear" ? undefined : CHROMA_GREEN} />;
}
