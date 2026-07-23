// app/api/larvae-survey/cron/route.ts
// Weekly job: mint a few creative questions, then build as many missing boards
// as the time budget allows.
//
// Vercel Cron hits this with Authorization: Bearer $CRON_SECRET
// Manual: /api/larvae-survey/cron?secret=YOUR_SECRET

import { NextRequest, NextResponse } from "next/server";
import {
  buildBoard,
  saveBoard,
  getBoardIndex,
  getBuildQueue,
  setBuildQueue,
  clearBuildQueue,
  getQuestionBank,
  mintQuestions,
  ensureQuestionBank,
} from "@/lib/larvae-survey";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 50_000;
const MINT_PER_RUN = 3;

function authorized(req: NextRequest): boolean {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret && secret === process.env.LARVAE_BUILD_SECRET) return true;
  const auth = req.headers.get("authorization");
  const cron = process.env.CRON_SECRET;
  if (cron && auth === `Bearer ${cron}`) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureQuestionBank();
  const minted = await mintQuestions(MINT_PER_RUN);

  const start = Date.now();
  let queue = await getBuildQueue();
  const existing = await getBoardIndex();
  const bank = await getQuestionBank();

  if (queue.length === 0) {
    queue = bank.filter((q) => !existing.includes(q.id)).map((q) => q.id);
    if (queue.length > 0) await setBuildQueue(queue);
  }

  const builtThisRun: { id: string; respondents: number }[] = [];
  const failed: string[] = [];

  while (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
    const id = queue.shift()!;
    try {
      const board = await buildBoard(id);
      if (board) {
        await saveBoard(board);
        builtThisRun.push({ id: board.id, respondents: board.respondents });
      } else {
        failed.push(id);
      }
    } catch {
      failed.push(id);
    }
    await setBuildQueue(queue);
  }

  if (queue.length === 0) await clearBuildQueue();

  return NextResponse.json({
    ok: true,
    done: queue.length === 0,
    minted: minted.minted,
    bankSize: minted.bankSize,
    builtThisRun,
    remaining: queue.length,
    failed: failed.length > 0 ? failed : undefined,
  });
}
