// app/api/larvae-survey/build/route.ts
//
// Chunked board build — same resumable pattern as the profile, election, and
// alignment builds. Keep visiting the SAME url until it says "done": true.
//
//   https://larvatar.vercel.app/api/larvae-survey/build?secret=YOUR_SECRET
//
// First visit: queues every question in the Redis bank that doesn't have a
// board yet (seed + minted). Every visit after: builds until the time budget.
//
// One board = ~101 LLM calls (100 surveys + 1 clustering).
//
// &reset=true wipes all boards (not the question bank) and rebuilds.
// &only=q03 rebuilds a single question.
// &mint=3 invents N new creative questions into the bank, then continues build.

import { NextRequest, NextResponse } from "next/server";
import {
  buildBoard,
  saveBoard,
  getBoardIndex,
  getBuildQueue,
  setBuildQueue,
  clearBuildQueue,
  clearAllBoards,
  getQuestionBank,
  mintQuestions,
  ensureQuestionBank,
} from "@/lib/larvae-survey";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 50_000;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureQuestionBank();

  // Optional: mint creative questions into the bank before building.
  const mintParam = req.nextUrl.searchParams.get("mint");
  let minted: Awaited<ReturnType<typeof mintQuestions>> | null = null;
  if (mintParam) {
    const n = Math.min(12, Math.max(1, parseInt(mintParam, 10) || 3));
    minted = await mintQuestions(n);
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
      minted: minted?.minted,
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
  const bank = await getQuestionBank();

  // Collection phase — queue anything in the bank without a board yet.
  let justCollected = false;
  if (queue.length === 0) {
    const missing = bank.filter((q) => !existing.includes(q.id)).map((q) => q.id);
    if (missing.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        built: existing.length,
        questions: bank.length,
        minted: minted?.minted,
        message:
          minted && minted.minted.length > 0
            ? "Minted questions; boards already exist for the rest. Visit again to build new ones, or add &mint=N."
            : "All boards already built. Add &mint=3 to invent new questions, or &reset=true to rebuild boards.",
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
      minted: minted?.minted,
    });
  }

  return NextResponse.json({
    ok: true,
    done: false,
    justCollected,
    builtThisRun,
    remaining: queue.length,
    failed: failed.length > 0 ? failed : undefined,
    minted: minted?.minted,
    message: "Not finished — visit this same URL again to continue.",
  });
}
