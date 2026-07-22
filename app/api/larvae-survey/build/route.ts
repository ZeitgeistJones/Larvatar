// app/api/larvae-survey/build/route.ts
//
// Chunked board build — same resumable pattern as the profile, election, and
// alignment builds. Keep visiting the SAME url until it says "done": true.
//
//   https://larvatar.vercel.app/api/larvae-survey/build?secret=YOUR_SECRET
//
// First visit: queues every question that doesn't have a board yet.
// Every visit after: builds boards until the time budget runs out.
//
// One board = ~21 Haiku calls (20 surveys + 1 clustering), so expect roughly
// one or two boards per visit.
//
// &reset=true wipes all boards and rebuilds from scratch.
// &only=q03 rebuilds a single question (useful when one board comes out flat).

import { NextRequest, NextResponse } from "next/server";
import {
  SURVEY_QUESTIONS,
  buildBoard,
  saveBoard,
  getBoard,
  getBoardIndex,
  getBuildQueue,
  setBuildQueue,
  clearBuildQueue,
  clearAllBoards,
} from "@/lib/larvae-survey";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 45_000;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Single-question rebuild
  const only = req.nextUrl.searchParams.get("only");
  if (only) {
    const board = await buildBoard(only);
    if (!board) {
      return NextResponse.json(
        { error: `Could not build board for "${only}" — unknown id, or not enough profiles built.` },
        { status: 400 }
      );
    }
    await saveBoard(board);
    return NextResponse.json({
      ok: true,
      done: true,
      mode: "single",
      board: {
        id: board.id,
        question: board.question,
        respondents: board.respondents,
        answers: board.answers.map((a) => ({ label: a.label, count: a.count })),
      },
    });
  }

  const reset = req.nextUrl.searchParams.get("reset") === "true";
  if (reset) {
    await clearAllBoards();
    await clearBuildQueue();
  }

  const start = Date.now();
  let queue = await getBuildQueue();
  const existing = await getBoardIndex();

  // Collection phase — queue anything without a board yet.
  let justCollected = false;
  if (queue.length === 0) {
    const missing = SURVEY_QUESTIONS.filter((q) => !existing.includes(q.id)).map(
      (q) => q.id
    );
    if (missing.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        built: existing.length,
        message: "All boards already built. Add &reset=true to rebuild.",
      });
    }
    queue = missing;
    await setBuildQueue(queue);
    justCollected = true;
  }

  const builtThisRun: { id: string; answers: number; respondents: number }[] = [];
  const failed: string[] = [];

  while (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
    const id = queue.shift()!;
    try {
      const board = await buildBoard(id);
      if (board) {
        await saveBoard(board);
        builtThisRun.push({
          id: board.id,
          answers: board.answers.length,
          respondents: board.respondents,
        });
      } else {
        failed.push(id);
      }
    } catch {
      failed.push(id);
    }
    await setBuildQueue(queue);
  }

  if (queue.length === 0) {
    const finalIndex = await getBoardIndex();
    await clearBuildQueue();
    return NextResponse.json({
      ok: true,
      done: true,
      totalBoards: finalIndex.length,
      builtThisRun,
      failed,
    });
  }

  return NextResponse.json({
    ok: true,
    done: false,
    justCollected,
    builtThisRun,
    remaining: queue.length,
    failed: failed.length > 0 ? failed : undefined,
    message: "Not finished — visit this same URL again to continue.",
  });
}
