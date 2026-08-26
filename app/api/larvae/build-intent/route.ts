// app/api/larvae/build-intent/route.ts
//
// GET → forum build-intent scores (community + Austin larva).

import { NextResponse } from "next/server";
import { getBuildIntentResult } from "@/lib/build-intent";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getBuildIntentResult();
  if (!result) {
    return NextResponse.json(
      {
        error:
          "No build-intent data yet. Run /api/larvae/build-intent/build?secret=… until done.",
      },
      { status: 404 }
    );
  }
  return NextResponse.json(result);
}
