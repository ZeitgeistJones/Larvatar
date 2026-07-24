// app/api/larvae/pulse/build/route.ts
//
// Build Topic Trends from recurring “Checking in” forum posts.
// Keep visiting until "done": true.
//
//   /api/larvae/pulse/build?secret=YOUR_SECRET
//   &reset=true starts over.

import { NextRequest, NextResponse } from "next/server";
import {
  clearPulse,
  clearPulseQueue,
  collectCheckInsIntoQueue,
  classifySentimentBatch,
  extractThemeBatch,
  finalizePulse,
  getPulseQueue,
  getPulseResult,
  pulseProgress,
  savePulseQueue,
  savePulseResult,
} from "@/lib/pulse";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 28_000;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (req.nextUrl.searchParams.get("reset") === "true") {
    await clearPulse();
  }

  const start = Date.now();
  const timeLeft = () => Date.now() - start < TIME_BUDGET_MS;

  let q = await getPulseQueue();

  if (!q) {
    const existing = await getPulseResult();
    if (existing && req.nextUrl.searchParams.get("reset") !== "true") {
      return NextResponse.json({
        ok: true,
        done: true,
        alreadyBuilt: true,
        waves: existing.waves.length,
        totalResponses: existing.meta.totalResponses,
      });
    }

    const n = await collectCheckInsIntoQueue();
    if (n === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        message: "No Checking-in forum posts with enough responses found.",
      });
    }
    q = await getPulseQueue();
    return NextResponse.json({
      ok: true,
      done: false,
      justCollected: true,
      waves: n,
      progress: q ? pulseProgress(q) : null,
    });
  }

  let batches = 0;
  while (timeLeft()) {
    if (q.phase === "sentiment") {
      const did = await classifySentimentBatch(q);
      await savePulseQueue(q);
      if (did) batches++;
      else if (q.phase === "themes") continue;
      else break;
    } else if (q.phase === "themes") {
      const did = await extractThemeBatch(q);
      await savePulseQueue(q);
      if (did) batches++;
      else if (q.phase === "finalize") continue;
      else break;
    } else if (q.phase === "finalize") {
      const result = finalizePulse(q);
      await savePulseResult(result);
      await clearPulseQueue();
      return NextResponse.json({
        ok: true,
        done: true,
        waves: result.waves.length,
        totalResponses: result.meta.totalResponses,
        positive: result.positive.length,
        negative: result.negative.length,
        contention: result.contention.length,
      });
    } else {
      break;
    }
  }

  return NextResponse.json({
    ok: true,
    done: false,
    batchesThisVisit: batches,
    progress: pulseProgress(q),
  });
}
