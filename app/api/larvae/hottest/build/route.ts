// app/api/larvae/hottest/build/route.ts
//
// Attach a 🔥 hottest take to every specimen profile.
// Prefer The Outlier Test + Outlier Test 2 forum answers; otherwise synthesize
// from the larva's existing personality (history proxy).
//
//   /api/larvae/hottest/build?secret=YOUR_SECRET
//   &reset=true  — rewrite takes for everyone
//
// Keep visiting until done: true.

import { NextRequest, NextResponse } from "next/server";
import {
  applyHottestTake,
  clearHottestBuild,
  getCachedOutlierMap,
  getHottestQueue,
  seedHottestQueue,
  setHottestQueue,
} from "@/lib/hottest";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 45_000;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const reset = req.nextUrl.searchParams.get("reset") === "true";
  if (reset) await clearHottestBuild();

  const start = Date.now();
  const timeLeft = () => Date.now() - start < TIME_BUDGET_MS;

  let queue = await getHottestQueue();
  let map = await getCachedOutlierMap();
  let justSeeded = false;

  if (!map || queue.length === 0) {
    const seeded = await seedHottestQueue(reset || !map);
    queue = await getHottestQueue();
    map = await getCachedOutlierMap();
    justSeeded = true;
    if (queue.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        message: "Every specimen already has a hottest take.",
        withOutlier: seeded.withOutlier,
      });
    }
    // Fall through and start writing takes on this same visit when time remains.
  }

  if (!map) {
    return NextResponse.json({ error: "failed to load outlier map" }, { status: 502 });
  }

  let ok = 0;
  let skip = 0;
  let fail = 0;

  while (queue.length > 0 && timeLeft()) {
    const wallet = queue.shift()!;
    const status = await applyHottestTake(wallet, map);
    if (status === "ok") ok += 1;
    else if (status === "skip") skip += 1;
    else fail += 1;
    await setHottestQueue(queue);
  }

  if (queue.length === 0) {
    return NextResponse.json({
      ok: true,
      done: true,
      justSeeded,
      written: ok,
      skipped: skip,
      failed: fail,
    });
  }

  return NextResponse.json({
    ok: true,
    done: false,
    justSeeded,
    written: ok,
    skipped: skip,
    failed: fail,
    remaining: queue.length,
    message: "Not finished — visit this same URL again to continue.",
  });
}
