// app/api/larvae-survey/build/route.ts
//
// Chunked board build — keep visiting until "done": true.
//
//   /api/larvae-survey/build?secret=YOUR_SECRET
//
// &fresh=true  — wipe boards + question bank, reseed creative list, rebuild
// &reset=true  — wipe boards only (keeps question bank)
// &mint=3      — invent N new questions, then build missing boards
// &only=q03    — rebuild one question

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
  resetQuestionBankFromSeed,
} from "@/lib/larvae-survey";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 50_000;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const fresh = req.nextUrl.searchParams.get("fresh") === "true";
  const reset = fresh || req.nextUrl.searchParams.get("reset") === "true";

  if (fresh) {
    await resetQuestionBankFromSeed();
  } else {
    await ensureQuestionBank();
  }

  if (reset) {
    await clearAllBoards();
    await clearBuildQueue();
  }

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

  const start = Date.now();
  let queue = await getBuildQueue();
  const existing = await getBoardIndex();
  const bank = await getQuestionBank();

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
            : "All boards already built. Add &fresh=true for a full creative reset, &mint=3 for new questions, or &reset=true to rebuild boards.",
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
      fresh: fresh || undefined,
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
    fresh: fresh || undefined,
    message: "Not finished — visit this same URL again (without fresh/reset) to continue.",
  });
}
