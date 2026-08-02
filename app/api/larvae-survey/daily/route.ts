// GET  → today's daily pack + whether this player already played
// POST → claim today's one play (Wordle-style lock)

import { NextRequest, NextResponse } from "next/server";
import {
  claimDailyPlay,
  DAILY_BOARD_NEED,
  DAILY_FM_QUESTIONS,
  DAILY_MAIN_ROUNDS,
  getAllBoards,
  getOrCreateDailyPack,
  hasPlayedDaily,
  nextUtcMidnightMs,
  surveyUtcDay,
  TARGET_BOARD_COUNT,
} from "@/lib/larvae-survey";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const day = surveyUtcDay();
  const playerId = String(req.nextUrl.searchParams.get("playerId") || "").trim();

  const boards = await getAllBoards();
  const pack = await getOrCreateDailyPack(day);
  const played = playerId ? await hasPlayedDaily(day, playerId) : false;

  return NextResponse.json({
    day,
    resetsAt: nextUtcMidnightMs(),
    target: TARGET_BOARD_COUNT,
    poolSize: boards.length,
    brewing: boards.length < TARGET_BOARD_COUNT,
    ready: Boolean(pack && pack.mainIds.length >= DAILY_MAIN_ROUNDS),
    need: DAILY_BOARD_NEED,
    mainRounds: DAILY_MAIN_ROUNDS,
    fmQuestions: DAILY_FM_QUESTIONS,
    pack: pack
      ? {
          day: pack.day,
          mainIds: pack.mainIds,
          fmIds: pack.fmIds,
          boardCount: pack.mainIds.length + pack.fmIds.length,
        }
      : null,
    played,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const playerId = String(body?.playerId || "").trim();
  const day = String(body?.day || surveyUtcDay()).trim();

  if (!playerId) {
    return NextResponse.json({ error: "playerId required" }, { status: 400 });
  }

  const pack = await getOrCreateDailyPack(day);
  if (!pack || pack.mainIds.length < DAILY_MAIN_ROUNDS) {
    return NextResponse.json({ error: "today's puzzle not ready yet" }, { status: 503 });
  }

  const claim = await claimDailyPlay(day, playerId);
  if (!claim.ok) {
    return NextResponse.json(
      { error: claim.reason || "already played today", played: true, pack },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    day,
    pack: {
      day: pack.day,
      mainIds: pack.mainIds,
      fmIds: pack.fmIds,
      boardCount: pack.mainIds.length + pack.fmIds.length,
    },
  });
}
