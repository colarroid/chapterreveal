import { NextResponse } from "next/server";
import { churchFolder, cloudinaryConfig, sign } from "@/lib/cloudinary";
import { churchMember } from "../member";

export const dynamic = "force-dynamic";

// A one-off signature so the browser can upload a picture slide straight to
// Cloudinary, into this church's folder (where the output page accepts
// pictures from).
export async function POST() {
  const member = await churchMember();
  if (member instanceof NextResponse) return member;
  const config = cloudinaryConfig();
  if (!config) return NextResponse.json({ error: "Picture uploads aren't set up yet (Cloudinary keys missing)." }, { status: 500 });
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder: churchFolder(member.churchId), timestamp };
  return NextResponse.json({
    url: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    fields: { folder: params.folder, timestamp: String(timestamp), api_key: config.apiKey, signature: sign(params, config.apiSecret) },
  });
}
