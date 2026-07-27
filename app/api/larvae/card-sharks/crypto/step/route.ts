// POST { matchId, pick?: "higher"|"lower" }
// Human pick when you have control; omit / ignore when larva controls (server picks).

import { NextRequest, NextResponse } from "next/server";
import { cryptoStep, publicMatch } from "@/lib/card-sharks";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const matchId = String(body?.matchId || "").trim();
  const pick =
    body?.pick === "higher" || body?.pick === "lower" ? body.pick : undefined;
  if (!matchId) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }
  try {
    const result = await cryptoStep(matchId, pick);
    return NextResponse.json({
      match: publicMatch(result.match),
      correct: result.correct,
      pickUsed: result.pickUsed,
      faceUp: result.faceUp,
      revealed: result.revealed,
      jab: result.jab,
      clearedRow: result.clearedRow,
      busted: result.busted,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "step failed" },
      { status: 400 }
    );
  }
}
