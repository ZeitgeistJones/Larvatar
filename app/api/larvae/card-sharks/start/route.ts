// POST { wallet? } — start an Over/Under match vs a larva

import { NextRequest, NextResponse } from "next/server";
import { publicMatch, startMatch } from "@/lib/card-sharks";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const wallet = String(body?.wallet || "").trim().toLowerCase() || undefined;
  try {
    const match = await startMatch(wallet);
    return NextResponse.json({ match: publicMatch(match) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed to start";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
