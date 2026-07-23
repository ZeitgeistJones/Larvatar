// app/api/larvae/reception/route.ts
//
// GET  → author reception, computed from existing alignment data.
//        ?relations=true also returns the per-larva-per-author matrix. That is
//        deliberately opt-in: it's the sharpest cut of this data and the
//        easiest to misread, so the page doesn't request it.
//        ?backfill=true&secret=... refreshes the post -> author map first.
//
// No LLM calls. This is a join over data already classified by the alignment
// build, plus two list fetches for the author map.

import { NextRequest, NextResponse } from "next/server";
import { getAlignResult } from "@/lib/alignment";
import {
  getAuthorMap,
  backfillAuthors,
  computeReception,
  MIN_POSTS_FOR_AUTHOR,
  MIN_POSTS_FOR_RELATION,
  MIN_DEVIATION,
} from "@/lib/reception";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wantRelations = req.nextUrl.searchParams.get("relations") === "true";
  const wantBackfill = req.nextUrl.searchParams.get("backfill") === "true";

  let backfilled: { fetched: number; forum: number; labs: number } | null = null;
  if (wantBackfill) {
    const secret = req.nextUrl.searchParams.get("secret");
    if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    backfilled = await backfillAuthors();
  }

  const alignment = await getAlignResult();
  if (!alignment) {
    return NextResponse.json(
      { error: "No alignment data. Run the alignment build first." },
      { status: 404 }
    );
  }

  const authors = await getAuthorMap();
  if (Object.keys(authors).length === 0) {
    return NextResponse.json(
      {
        error:
          "No author map yet. Call this endpoint with &backfill=true&secret=... once to build it.",
      },
      { status: 404 }
    );
  }

  const report = computeReception(alignment, authors);

  const body: Record<string, unknown> = {
    computedAt: alignment.computedAt,
    thresholds: {
      minPostsForAuthor: MIN_POSTS_FOR_AUTHOR,
      minPostsForRelation: MIN_POSTS_FOR_RELATION,
      minDeviation: MIN_DEVIATION,
    },
    coverage: {
      postsWithKnownAuthor: report.postsWithKnownAuthor,
      postsTotal: report.postsTotal,
    },
    meanApprovalRate: report.meanApprovalRate,
    authors: report.authors,
    relationCount: report.relations.length,
  };

  if (backfilled) body.backfilled = backfilled;

  if (wantRelations) {
    body.relations = report.relations;
    body.note =
      "Deviation is relative to each larva's own overall approval rate, not to the swarm. A positive value means this larva approves this author more often than it approves anyone. It does not establish why.";
  }

  return NextResponse.json(body);
}
