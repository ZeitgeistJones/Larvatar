// POST { matchId } — reveal true out-of-100, award control, start crypto ladder

import { NextRequest, NextResponse } from "next/server";
import { publicMatch, revealSurvey } from "@/lib/card-sharks";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const matchId = String(body?.matchId || "").trim();
  if (!matchId) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }
  try {
    const { match, trueN, control, exact } = await revealSurvey(matchId);
    return NextResponse.json({
      match: publicMatch(match),
      trueN,
      control,
      exact,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "reveal failed" },
      { status: 400 }
    );
  }
}
