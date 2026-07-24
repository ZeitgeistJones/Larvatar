// app/api/larvae/mood/route.ts
//
// GET → present-day hive mood boards (equal + CV weighted).

import { NextResponse } from "next/server";
import { getGovResult } from "@/lib/gov";
import { buildMoodReport } from "@/lib/mood";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getGovResult();
  if (!result) {
    return NextResponse.json(
      { error: "No governance data. Run the gov build first." },
      { status: 404 }
    );
  }

  return NextResponse.json(buildMoodReport(result));
}
