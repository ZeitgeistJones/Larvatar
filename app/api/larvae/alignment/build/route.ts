// app/api/larvae/alignment/build/route.ts
//
// Chunked alignment build. Keep visiting the SAME url until "done": true.
//
//   https://larvatar.vercel.app/api/larvae/alignment/build?secret=YOUR_SECRET
//
// The time budget is checked before every Haiku call, not just between posts —
// a post with 150 responses is 8 sequential calls and will not fit in one
// invocation. When the budget runs out mid-post, progress is saved on the queue
// item (cursor + partial) and the next visit resumes from that exact response.
//
// Phase 1: collect posts into the queue (no LLM calls).
// Phase 2: classify, batch by batch, across as many visits as it takes.
// Phase 3: compute the matrix, credibility, and factions once the queue empties.
//
// &reset=true wipes progress and starts over.

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
  classifyAggregate,
  classifyBatch,
  computeAlignment,
} from "@/lib/alignment";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Well under the 60s ceiling. Each iteration is one Haiku call (~2-5s), so this
// leaves room to finish the call in flight plus the Redis write after it.
const TIME_BUDGET_MS = 30_000;

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
  const timeLeft = () => Date.now() - start < TIME_BUDGET_MS;

  let queue = await getAlignQueue();
  const alreadyClassified = await getClassified();

  // ── Phase 1: collection ──
  if (queue.length === 0 && alreadyClassified.length === 0) {
    const count = await collectPostsIntoQueue();
    queue = await getAlignQueue();
    if (count === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        classified: 0,
        message: "No posts with enough responses found on larv.ai.",
      });
    }
    return NextResponse.json({
      ok: true,
      done: false,
      justCollected: true,
      postsQueued: queue.length,
      totalResponses: queue.reduce((sum, q) => sum + q.responses.length, 0),
      message: "Posts collected. Visit this same URL again to start classifying.",
    });
  }

  // ── Phase 2: classification ──
  let batchesThisRun = 0;
  let postsFinishedThisRun = 0;

  while (queue.length > 0 && timeLeft()) {
    const item = queue[0];

    // Aggregate stance first — one call, only once per post.
    if (item.aggregatedStance === null) {
      item.aggregatedStance = await classifyAggregate(item);
      batchesThisRun++;
      await setAlignQueue(queue);
      if (!timeLeft()) break;
    }

    // Responses, one batch per iteration, checking the clock between each.
    while (item.cursor < item.responses.length && timeLeft()) {
      const batch = await classifyBatch(item, item.cursor);
      item.partial.push(...batch);
      // Advance even when a batch fails. Its entries stay null and are
      // reported at the end — retrying forever would stall the run, and
      // filling them with a fabricated stance is the bug being fixed.
      item.cursor += batch.length;
      batchesThisRun++;
      await setAlignQueue(queue);
    }

    // Post complete → move it to the classified set.
    if (item.cursor >= item.responses.length) {
      await appendClassified({
        postId: item.postId,
        source: item.source,
        title: item.title,
        aggregatedStance: item.aggregatedStance ?? "neutral",
        stances: item.partial,
      });
      queue.shift();
      postsFinishedThisRun++;
      await setAlignQueue(queue);
    }
  }

  // ── Phase 3: computation ──
  if (queue.length === 0) {
    const allClassified = await getClassified();
    const result = computeAlignment(allClassified);
    await saveAlignResult(result);
    await clearClassified();

    const q = result.quality;
    return NextResponse.json({
      ok: true,
      done: true,
      postsClassified: allClassified.length,
      totalStances: result.stances.length,
      uniqueLarvae: result.credibility.length,
      factions: result.factions.length,
      quality: q
        ? {
            ...q,
            note:
              q.droppedStances > 0 || q.postsWithoutAggregate > 0
                ? "Unclassified records were dropped rather than counted as neutral. A high number here means the classifier is struggling and the results should be treated with caution."
                : "All responses and aggregates classified successfully.",
          }
        : undefined,
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
    });
  }

  const head = queue[0];
  const responsesLeft = queue.reduce(
    (sum, q) => sum + (q.responses.length - q.cursor),
    0
  );

  return NextResponse.json({
    ok: true,
    done: false,
    batchesThisRun,
    postsFinishedThisRun,
    totalPostsClassified: alreadyClassified.length + postsFinishedThisRun,
    postsRemaining: queue.length,
    responsesRemaining: responsesLeft,
    currentPost: {
      title: head.title.slice(0, 60),
      progress: `${head.cursor}/${head.responses.length}`,
    },
    message: "Not finished — visit this same URL again to continue.",
  });
}
