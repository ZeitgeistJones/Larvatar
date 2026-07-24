// app/api/larvae/pulse/route.ts
//
// GET → overall pulse + theme boards from check-in forum posts.

import { NextResponse } from "next/server";
import { getPulseResult } from "@/lib/pulse";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getPulseResult();
  if (!result) {
    return NextResponse.json(
      {
        error:
          "No pulse data yet. Run /api/larvae/pulse/build?secret=… until done.",
      },
      { status: 404 }
    );
  }
  return NextResponse.json(result);
}
