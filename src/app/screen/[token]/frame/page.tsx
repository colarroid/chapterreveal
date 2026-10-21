import type { Metadata } from "next";
import { CHROMA_GREEN } from "@/lib/display/theme";
import { OutputScreen } from "../output";

export const metadata: Metadata = { title: "Output", robots: { index: false, follow: false } };

// The projector frame: /screen/<address>/frame. Everything the projector
// shows (scripture, lyrics and slides) in the projector's own look, filling
// the page at whatever size the OBS browser source is set to. ?bg=green or
// ?bg=clear give plain words on green or see-through instead, for scripture
// and lyrics only (a slide blanks them: it wouldn't fit a text area).
export default async function ProjectorFrame({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ bg?: string }> }) {
  const { token } = await params;
  const { bg } = await searchParams;
  const plain = bg === "green" || bg === "clear";
  return <OutputScreen token={token} layout="frame" chroma={bg === "green" ? CHROMA_GREEN : undefined} look={!plain} noSlides={plain} />;
}
