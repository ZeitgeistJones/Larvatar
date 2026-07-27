// GET  → list cached moral results (+ optional ?wallet=)
// POST → { wallet } | { random: true } — run the Moral Alignment Test for one larva

import { NextRequest, NextResponse } from "next/server";
import {
  getMoralResult,
  listMoralResults,
  pickRandomWallet,
  runMoralTest,
  ALIGNMENT_GRID,
  MORAL_QUESTIONS,
} from "@/lib/moral";
import { getProfile } from "@/lib/larvae";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim().toLowerCase();
  if (wallet) {
    const result = await getMoralResult(wallet);
    if (!result) {
      return NextResponse.json({ error: "not tested yet" }, { status: 404 });
    }
    return NextResponse.json({ result, grid: ALIGNMENT_GRID, questions: MORAL_QUESTIONS });
  }

  const results = await listMoralResults();
  results.sort((a, b) => b.testedAt.localeCompare(a.testedAt));
  return NextResponse.json({
    results,
    grid: ALIGNMENT_GRID,
    questions: MORAL_QUESTIONS,
    count: results.length,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  let wallet = String(body?.wallet || "")
    .trim()
    .toLowerCase();

  if (body?.random || !wallet) {
    wallet = (await pickRandomWallet()) || "";
  }

  if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
    return NextResponse.json({ error: "wallet required (or random: true)" }, { status: 400 });
  }

  const profile = await getProfile(wallet);
  if (!profile) {
    return NextResponse.json({ error: "larva profile not found" }, { status: 404 });
  }

  const result = await runMoralTest(wallet);
  if (!result) {
    return NextResponse.json({ error: "test failed — try again" }, { status: 502 });
  }

  return NextResponse.json({ result, grid: ALIGNMENT_GRID });
}
