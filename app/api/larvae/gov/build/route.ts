// app/api/larvae/gov/build/route.ts
//
// Collect governance data. Keep visiting until "done": true.
//
//   https://larvatar.vercel.app/api/larvae/gov/build?secret=YOUR_SECRET
//
// Phase 1 — collection. Fetches all gov items. VOTES ARE FINISHED HERE: every
// response carries chosen_option, so the stance is read, not inferred, and
// costs no model calls at all.
//
// Phase 2 — RFC classification only. RFCs are prose and need the same batched
// treatment as forum posts. Resumable mid-item, since an RFC can carry 118
// responses.
//
// &reset=true starts over.

import { NextRequest, NextResponse } from "next/server";
import {
  collectGov,
  classifyRfcBatch,
  getGovResult,
  saveGovResult,
  clearGovResult,
  majorityAlignment,
  suspiciousItems,
  type GovResult,
} from "@/lib/gov";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 30_000;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (req.nextUrl.searchParams.get("reset") === "true") {
    await clearGovResult();
  }

  const start = Date.now();
  const timeLeft = () => Date.now() - start < TIME_BUDGET_MS;

  let result = await getGovResult();

  /* ── Phase 1: collection ── */
  if (!result) {
    const { items, votes, rfcs, unpolarized } = await collectGov();
    if (items.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        message: "No governance items with enough responses found.",
      });
    }

    result = { items, collectedAt: new Date().toISOString(), unpolarized };
    await saveGovResult(result);

    const rfcResponses = items
      .filter((i) => i.kind === "rfc")
      .reduce((n, i) => n + i.responses.length, 0);

    return NextResponse.json({
      ok: true,
      done: rfcResponses === 0,
      justCollected: true,
      votes,
      rfcs,
      voteResponsesResolved: items
        .filter((i) => i.kind === "vote")
        .reduce((n, i) => n + i.responses.length, 0),
      rfcResponsesToClassify: rfcResponses,
      unpolarized:
        unpolarized.length > 0
          ? `${unpolarized.length} vote(s) had options with no clear yes/no side; choices recorded without a stance.`
          : undefined,
      message:
        rfcResponses > 0
          ? "Votes are done (no model calls needed). Visit again to classify RFC responses."
          : "Nothing further to classify.",
    });
  }

  /* ── Phase 2: RFC classification ── */
  let classified = 0;

  let failedBatches = 0;

  for (const item of result.items) {
    if (item.kind !== "rfc") continue;
    if (!timeLeft()) break;

    // Resume from the first unclassified response in this item.
    let cursor = item.responses.findIndex((r) => r.stance === null);
    if (cursor === -1) continue;

    while (cursor < item.responses.length && timeLeft()) {
      const stances = await classifyRfcBatch(item, item.responses, cursor);
      if (stances.length === 0) break;

      const resolved = stances.filter((x) => x !== null).length;
      if (resolved === 0) failedBatches++;

      for (let i = 0; i < stances.length; i++) {
        item.responses[cursor + i].stance = stances[i];
      }
      // Advance regardless of success. A batch that cannot be classified stays
      // null and is reported, rather than being retried forever or quietly
      // filled with a fabricated stance.
      cursor += stances.length;
      classified += resolved;
      await saveGovResult(result);
    }
  }

  // Every RFC response has now been attempted; nulls are permanent failures,
  // not pending work, so the run is complete once the cursor reaches the end.
  const remaining = result.items
    .filter((i) => i.kind === "rfc")
    .reduce((n, i) => n + i.responses.filter((r) => r.stance === null).length, 0);

  const doneClassifying = failedBatches === 0 ? remaining === 0 : true;

  if (doneClassifying) {
    const suspicious = suspiciousItems(result);
    return NextResponse.json({
      ok: true,
      done: true,
      classifiedThisRun: classified,
      items: result.items.length,
      votes: result.items.filter((i) => i.kind === "vote").length,
      rfcs: result.items.filter((i) => i.kind === "rfc").length,
      unclassified: remaining,
      failedBatches,
      suspicious:
        suspicious.length > 0
          ? suspicious
          : "none — no item classified suspiciously uniformly",
      topMajorityAlignment: majorityAlignment(result).slice(0, 5),
    });
  }

  return NextResponse.json({
    ok: true,
    done: false,
    classifiedThisRun: classified,
    rfcResponsesRemaining: remaining,
    message: "Not finished — visit this same URL again to continue.",
  });
}
