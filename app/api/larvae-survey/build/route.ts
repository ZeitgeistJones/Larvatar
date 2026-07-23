// app/api/larvae-survey/build/route.ts
//
// Chunked board build — keep visiting until "done": true.
//
//   /api/larvae-survey/build?secret=YOUR_SECRET
//
// &fresh=true       — wipe boards + question bank, reseed creative list, rebuild
// &reset=true       — wipe boards only (keeps question bank)
// &rebuild=true     — re-queue EXISTING boards in place (no wipe). Continue without param.
// &rebuild=q02,q05  — rebuild just those ids in place
// &only=q03         — rebuild one question immediately (one request)
// &mint=3           — invent N new questions, then build missing boards

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

function parseRebuildIds(param: string, existing: string[]): string[] {
  const trimmed = param.trim().toLowerCase();
  if (trimmed === "true" || trimmed === "all" || trimmed === "1") {
    return [...existing];
  }
  return param
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const fresh = req.nextUrl.searchParams.get("fresh") === "true";
  const reset = fresh || req.nextUrl.searchParams.get("reset") === "true";
  const rebuildParam = req.nextUrl.searchParams.get("rebuild");

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

  // Single-question rebuild (immediate, one board)
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
        answers: board.answers.map((a) => ({
          label: a.label,
          count: a.count,
          rationale: a.rationale,
        })),
      },
    });
  }

  const start = Date.now();
  let queue = await getBuildQueue();
  const existing = await getBoardIndex();
  const bank = await getQuestionBank();

  // In-place rebuild: overwrite existing boards without wiping the index.
  let justCollected = false;
  let mode: "missing" | "rebuild" = "missing";

  if (rebuildParam) {
    mode = "rebuild";
    if (queue.length === 0) {
      const ids = parseRebuildIds(rebuildParam, existing);
      if (ids.length === 0) {
        return NextResponse.json({
          ok: true,
          done: true,
          mode: "rebuild",
          message: "No boards to rebuild. Build some first, or use &only=q01.",
        });
      }
      queue = ids;
      await setBuildQueue(queue);
      justCollected = true;
    }
  } else if (queue.length === 0) {
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
            : "All boards already built. Use &rebuild=true to refresh them in place (no wipe), &only=q02 for one board, &mint=3 for new questions, or &fresh=true for a full reset.",
      });
    }
    queue = missing;
    await setBuildQueue(queue);
    justCollected = true;
  } else {
    // Continuing a prior queue — if ids are already in the index, treat as rebuild.
    mode = queue.every((id) => existing.includes(id)) ? "rebuild" : "missing";
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
      mode,
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
    mode,
    justCollected,
    builtThisRun,
    remaining: queue.length,
    failed: failed.length > 0 ? failed : undefined,
    minted: minted?.minted,
    fresh: fresh || undefined,
    message:
      "Not finished — visit the same URL again WITHOUT fresh/reset/rebuild to continue (keeps your progress).",
  });
}
