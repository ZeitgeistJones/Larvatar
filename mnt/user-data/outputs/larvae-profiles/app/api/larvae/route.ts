// app/api/larvae/route.ts
// GET → all built profiles, sorted by responseCount desc

import { NextResponse } from "next/server";
import { getIndex, getProfile } from "@/lib/larvae";

export const dynamic = "force-dynamic";

export async function GET() {
  const index = await getIndex();
  const profiles = (
    await Promise.all(index.map((e) => getProfile(e.wallet)))
  ).filter(Boolean);
  return NextResponse.json({ larvae: profiles });
}
