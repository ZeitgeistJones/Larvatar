// app/api/larvae/build-intent/build/route.ts
//
// Score every larv.ai forum post for build / structural-change intent (Gemini).
// Keep visiting until done: true.
//
//   /api/larvae/build-intent/build?secret=YOUR_SECRET
//   &reset=true starts over.

import { NextRequest, NextResponse } from "next/server";
import {
  buildIntentProgress,
  clearBuildIntent,
  clearBuildIntentProgress,
  collectForumIntoQueue,
  finalizeBuildIntent,
  getBuildIntentPartial,
  getBuildIntentQueue,
  getBuildIntentResult,
  saveBuildIntentPartial,
  saveBuildIntentQueue,
  saveBuildIntentResult,
  scoreQueueItem,
} from "@/lib/build-intent";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Pro models are slower — leave headroom under the 60s function limit.
const TIME_BUDGET_MS = 45_000;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error: "GEMINI_API_KEY not configured",
        hint: "Add GEMINI_API_KEY in Vercel Production env, then Redeploy.",
      },
      { status: 500 }
    );
  }

  const wantReset = req.nextUrl.searchParams.get("reset") === "true";
  if (wantReset) {
    await clearBuildIntent();
  }

  const start = Date.now();
  const timeLeft = () => Date.now() - start < TIME_BUDGET_MS;

  let queue = await getBuildIntentQueue();
  let partial = await getBuildIntentPartial();
  const existing = await getBuildIntentResult();

  if (!queue) {
    if (existing && !wantReset) {
      return NextResponse.json({
        ok: true,
        done: true,
        alreadyBuilt: true,
        scored: existing.meta.scored,
        notable: existing.meta.notable,
      });
    }

    const n = await collectForumIntoQueue();
    if (n === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        message: "No forum posts found.",
      });
    }
    queue = await getBuildIntentQueue();
    partial = [];
    return NextResponse.json({
      ok: true,
      done: false,
      justCollected: true,
      posts: n,
      progress: queue ? buildIntentProgress(queue, partial) : null,
    });
  }

  let scoredThisVisit = 0;
  let failed = 0;

  while (timeLeft() && queue.length > 0) {
    const item = queue.shift()!;
    const row = await scoreQueueItem(item);
    if (row) {
      partial.push(row);
      scoredThisVisit++;
      await saveBuildIntentPartial(partial);
    } else {
      failed++;
      queue.unshift(item);
      break;
    }
    await saveBuildIntentQueue(queue);
  }

  if (queue.length === 0) {
    const totalForum = partial.length;
    const result = finalizeBuildIntent(partial, totalForum);
    await saveBuildIntentResult(result);
    await clearBuildIntentProgress();
    return NextResponse.json({
      ok: true,
      done: true,
      scoredThisVisit,
      failed,
      notable: result.meta.notable,
      filtered: result.meta.filtered,
      total: result.meta.scored,
    });
  }

  return NextResponse.json({
    ok: true,
    done: false,
    scoredThisVisit,
    failed,
    progress: buildIntentProgress(queue, partial),
  });
}
