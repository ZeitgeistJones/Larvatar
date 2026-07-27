// GET ?matchId= — public match snapshot

import { NextRequest, NextResponse } from "next/server";
import { getMatch, publicMatch } from "@/lib/card-sharks";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const matchId = req.nextUrl.searchParams.get("matchId")?.trim() || "";
  if (!matchId) {
    return NextResponse.json({ error: "matchId required" }, { status: 400 });
  }
  const match = await getMatch(matchId);
  if (!match) {
    return NextResponse.json({ error: "match not found" }, { status: 404 });
  }
  return NextResponse.json({ match: publicMatch(match) });
}
