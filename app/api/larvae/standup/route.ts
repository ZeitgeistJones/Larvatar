// GET  → list recent sets / ?id=
// POST → { random?: true, wallet?: string } — generate a new 90s bit
// PUT  → { id, score, voterId } — audience rating 1–10

import { NextRequest, NextResponse } from "next/server";
import {
  avgScore,
  getStandupSet,
  listStandupSets,
  performStandup,
  rateStandup,
} from "@/lib/standup";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")?.trim();
  if (id) {
    const set = await getStandupSet(id);
    if (!set) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ set, avg: avgScore(set) });
  }
  const sets = await listStandupSets(24);
  return NextResponse.json({
    sets: sets.map((s) => ({
      ...s,
      avg: avgScore(s),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const wallet = body?.wallet ? String(body.wallet).trim() : undefined;
  const set = await performStandup(wallet);
  if (!set) {
    return NextResponse.json(
      { error: "couldn’t book a comic — need built profiles" },
      { status: 404 }
    );
  }
  return NextResponse.json({ set, avg: null });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "").trim();
  const score = Number(body?.score);
  const voterId = String(body?.voterId || "").trim().slice(0, 64);
  if (!id || !voterId) {
    return NextResponse.json({ error: "id and voterId required" }, { status: 400 });
  }
  const set = await rateStandup(id, score, voterId);
  if (!set) {
    return NextResponse.json({ error: "rate failed" }, { status: 400 });
  }
  return NextResponse.json({ set, avg: avgScore(set) });
}
