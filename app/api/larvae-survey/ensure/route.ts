// app/api/larvae-survey/ensure/route.ts
//
// Public, rate-limited board brew — no secret.
// The play page polls this until enough boards exist.
// Builds missing boards only (never wipes).

import { NextResponse } from "next/server";
import {
  tickMissingBoardBuild,
  getAllBoards,
  TARGET_BOARD_COUNT,
} from "@/lib/larvae-survey";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const tick = await tickMissingBoardBuild(50_000);
  const boards = await getAllBoards();

  return NextResponse.json({
    ok: true,
    target: TARGET_BOARD_COUNT,
    boardCount: boards.length,
    brewing: boards.length < TARGET_BOARD_COUNT || tick.brewing,
    builtThisRun: tick.builtThisRun,
    remaining: tick.remaining,
    skipped: tick.skipped,
    boards: boards.map((b) => ({
      id: b.id,
      question: b.question,
      answerCount: b.answers.length,
      respondents: b.respondents,
      totalPoints: b.totalPoints,
    })),
  });
}
