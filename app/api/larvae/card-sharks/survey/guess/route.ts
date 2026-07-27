// POST { matchId, guess } — human survey guess (larva then calls over/under)

import { NextRequest, NextResponse } from "next/server";
import { publicMatch, submitGuess } from "@/lib/card-sharks";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const matchId = String(body?.matchId || "").trim();
  const guess = Number(body?.guess);
  if (!matchId || !Number.isFinite(guess)) {
    return NextResponse.json({ error: "matchId and guess required" }, { status: 400 });
  }
  try {
    const match = await submitGuess(matchId, guess);
    return NextResponse.json({ match: publicMatch(match) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "guess failed" },
      { status: 400 }
    );
  }
}
