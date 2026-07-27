// POST { matchId, call: "over"|"under" } — human over/under when larva guessed

import { NextRequest, NextResponse } from "next/server";
import { publicMatch, submitCall } from "@/lib/card-sharks";

export const maxDuration = 15;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const matchId = String(body?.matchId || "").trim();
  const call = body?.call === "under" ? "under" : body?.call === "over" ? "over" : null;
  if (!matchId || !call) {
    return NextResponse.json({ error: "matchId and call required" }, { status: 400 });
  }
  try {
    const match = await submitCall(matchId, call);
    return NextResponse.json({ match: publicMatch(match) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "call failed" },
      { status: 400 }
    );
  }
}
