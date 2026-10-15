import type { Metadata } from "next";
import { OutputScreen } from "./output";

export const metadata: Metadata = { title: "Output", robots: { index: false, follow: false } };

export default async function ScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ layout?: string; present?: string }>;
}) {
  const { token } = await params;
  const { layout, present } = await searchParams;
  return <OutputScreen token={token} layout={layout === "lower" ? "lower" : "full"} present={present === "1"} />;
}
