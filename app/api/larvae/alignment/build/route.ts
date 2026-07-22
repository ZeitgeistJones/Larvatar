// app/api/larvae/alignment/build/route.ts
//
// Chunked alignment build — same resumable pattern as profile and election builds.
// Just keep visiting the SAME url until it says "done": true.
//
//   https://larvatar.vercel.app/api/larvae/alignment/build?secret=YOUR_SECRET
//
// Phase 1 (collection): fetches all forum + labs posts into a classification queue.
// Phase 2 (classification): classifies stances for one post per visit.
// Phase 3 (computation): once all posts are classified, computes alignment matrix,
//   credibility scores, and factions. Stores final result.
//
// Add &reset=true to wipe progress and start from scratch.

import { NextRequest, NextResponse } from "next/server";
import {
  collectPostsIntoQueue,
  getAlignQueue,
  setAlignQueue,
  clearAlignQueue,
  getClassified,
  appendClassified,
  clearClassified,
  clearAlignResult,
  saveAlignResult,
  classifyPost,
  computeAlignment,
} from "@/lib/alignment";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 45_000;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const reset = req.nextUrl.searchParams.get("reset") === "true";
  if (reset) {
    await clearAlignQueue();
    await clearClassified();
    await clearAlignResult();
  }

  const start = Date.now();
  let queue = await getAlignQueue();
  const alreadyClassified = await getClassified();

  // Phase 1: collection (if nothing queued and nothing classified yet)
  let justCollected = false;
  if (queue.length === 0 && alreadyClassified.length === 0) {
    const count = await collectPostsIntoQueue();
    queue = await getAlignQueue();
    justCollected = true;
    if (count === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        classified: 0,
        message: "No posts with enough responses found on larv.ai.",
      });
    }
    // Return after collection — let the user visit again to start classification
    return NextResponse.json({
      ok: true,
      done: false,
      justCollected: true,
      postsQueued: queue.length,
      totalResponses: queue.reduce((sum, q) => sum + q.responses.length, 0),
      message:
        "Posts collected. Visit this same URL again to start classifying stances.",
    });
  }

  // Phase 2: classification — process posts until time budget runs out
  const classifiedThisRun: string[] = [];
  const failed: string[] = [];

  while (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
    const item = queue.shift()!;

    try {
      const classified = await classifyPost(item);
      await appendClassified(classified);
      classifiedThisRun.push(`${item.source}/${item.postId}`);
    } catch {
      failed.push(`${item.source}/${item.postId}`);
    }

    await setAlignQueue(queue);
  }

  // Phase 3: computation (when queue is empty)
  if (queue.length === 0) {
    const allClassified = await getClassified();
    const result = computeAlignment(allClassified);
    await saveAlignResult(result);
    await clearClassified();

    return NextResponse.json({
      ok: true,
      done: true,
      postsClassified: allClassified.length,
      totalStances: result.stances.length,
      uniqueLarvae: result.credibility.length,
      factions: result.factions.length,
      topWinRate: result.credibility[0]
        ? {
            wallet: result.credibility[0].wallet,
            winRate: result.credibility[0].winRate,
            posts: result.credibility[0].posts,
          }
        : null,
      largestFaction: result.factions[0]
        ? {
            members: result.factions[0].members.length,
            avgWinRate: result.factions[0].avgWinRate,
            cohesion: result.factions[0].cohesion,
          }
        : null,
      failed,
    });
  }

  return NextResponse.json({
    ok: true,
    done: false,
    justCollected,
    classifiedThisRun: classifiedThisRun.length,
    totalClassifiedSoFar: alreadyClassified.length + classifiedThisRun.length,
    remaining: queue.length,
    failed: failed.length > 0 ? failed : undefined,
    message: "Not finished — visit this same URL again to continue.",
  });
}
