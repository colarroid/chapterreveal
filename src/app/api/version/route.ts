import { NextResponse } from "next/server";

// The build the server is running now. Open tabs compare it with the one
// they loaded (components/update-notice.tsx) to offer a reload after a deploy.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { build: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
