import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OutputScreen } from "../output";

export const metadata: Metadata = { title: "Output", robots: { index: false, follow: false } };

// Separate outputs for vMix and OBS: /screen/<address>/scripture and
// /screen/<address>/lyrics fill the screen with the Design look;
// .../lower puts them in a band at the bottom on chroma green.
const ONLY = { scripture: "scripture", lyrics: "song" } as const;

export default async function SingleOutput({ params, searchParams }: { params: Promise<{ token: string; view: string }>; searchParams: Promise<{ present?: string }> }) {
  const { token, view } = await params;
  const { present } = await searchParams;
  const only = ONLY[view as keyof typeof ONLY];
  if (!only) notFound();
  return <OutputScreen token={token} layout="full" only={only} present={present === "1"} />;
}
