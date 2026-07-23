// app/api/larvae-survey/route.ts
//
// GET  → list of playable boards, or one board with answers HIDDEN.
//        ?id=q03 for a single board. Answer labels are never sent to the client
//        before they're guessed — otherwise the board is in the network tab.
//
// POST → { id, guess, revealed[] } — checks a guess against the unrevealed
//        answers and returns the match (or null for a strike).

import { NextRequest, NextResponse } from "next/server";
import {
  getBoard,
  getAllBoards,
  matchGuess,
  TARGET_BOARD_COUNT,
} from "@/lib/larvae-survey";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    const boards = await getAllBoards();
    return NextResponse.json({
      boards: boards.map((b) => ({
        id: b.id,
        question: b.question,
        answerCount: b.answers.length,
        respondents: b.respondents,
        totalPoints: b.totalPoints,
      })),
      target: TARGET_BOARD_COUNT,
      brewing: boards.length < TARGET_BOARD_COUNT,
    });
  }

  const board = await getBoard(id);
  if (!board) {
    return NextResponse.json({ error: "board not found" }, { status: 404 });
  }

  // Send the shape of the board, not its contents.
  return NextResponse.json({
    id: board.id,
    question: board.question,
    respondents: board.respondents,
    totalPoints: board.totalPoints,
    slots: board.answers.map((a) => ({ rank: a.rank, points: a.points })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "").trim();
  const guess = String(body?.guess || "").trim().slice(0, 80);
  const revealed: number[] = Array.isArray(body?.revealed)
    ? body.revealed.map(Number).filter(Number.isInteger)
    : [];

  if (!id || !guess) {
    return NextResponse.json({ error: "id and guess required" }, { status: 400 });
  }

  const board = await getBoard(id);
  if (!board) {
    return NextResponse.json({ error: "board not found" }, { status: 404 });
  }

  const unrevealed = board.answers.filter((a) => !revealed.includes(a.rank));
  const match = await matchGuess(board.question, guess, unrevealed);

  if (!match) {
    return NextResponse.json({ match: null, strike: true });
  }

  return NextResponse.json({
    match: {
      rank: match.rank,
      label: match.label,
      count: match.count,
      points: match.points,
      voices: match.voices,
      sample: match.sample,
      rationale: match.rationale || "",
    },
    strike: false,
  });
}

// Reveal the full board — used when the round ends (3 strikes or board cleared).
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "").trim();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const board = await getBoard(id);
  if (!board) {
    return NextResponse.json({ error: "board not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: board.id,
    question: board.question,
    respondents: board.respondents,
    answers: board.answers,
  });
}
