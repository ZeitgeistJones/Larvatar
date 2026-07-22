// app/api/larvae/alignment/route.ts
// GET → alignment matrix, credibility scores, factions.
// Optional query params:
//   ?wallet=0x... — filter to one larva's relationships
//   ?factions=true — include full faction data
//   ?pairs=true — include the full pairwise matrix (large)

import { NextRequest, NextResponse } from "next/server";
import { getAlignResult } from "@/lib/alignment";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const result = await getAlignResult();
  if (!result) {
    return NextResponse.json(
      { error: "No alignment data yet. Run the alignment build first." },
      { status: 404 }
    );
  }

  const walletFilter = req.nextUrl.searchParams.get("wallet")?.toLowerCase();
  const includePairs = req.nextUrl.searchParams.get("pairs") === "true";
  const includeFactions = req.nextUrl.searchParams.get("factions") !== "false"; // default true

  // Always return credibility + factions + post metadata
  const response: Record<string, any> = {
    computedAt: result.computedAt,
    postCount: result.posts.length,
    larvaeCount: result.credibility.length,
    factionCount: result.factions.length,
  };

  if (walletFilter) {
    // Single-wallet view: their credibility + their pairwise relationships + their factions
    const cred = result.credibility.find((c) => c.wallet === walletFilter);
    if (!cred) {
      return NextResponse.json(
        { error: "Wallet not found in alignment data." },
        { status: 404 }
      );
    }

    const walletPairs = result.pairs
      .filter((p) => p.a === walletFilter || p.b === walletFilter)
      .map((p) => ({
        partner: p.a === walletFilter ? p.b : p.a,
        agreed: p.agreed,
        total: p.total,
        rate: p.rate,
      }))
      .sort((a, b) => b.rate - a.rate);

    const walletFaction = result.factions.find((f) =>
      f.members.includes(walletFilter)
    );

    // Per-post stance history for this wallet
    const stanceHistory = result.stances
      .filter((s) => s.wallet === walletFilter)
      .map((s) => {
        const post = result.posts.find((p) => p.id === s.postId && p.source === s.source);
        return {
          postId: s.postId,
          source: s.source,
          title: post?.title || "",
          stance: s.stance,
          aggregatedStance: post?.aggregatedStance || "neutral",
          matchedAggregate: s.stance === post?.aggregatedStance,
        };
      });

    response.wallet = walletFilter;
    response.credibility = cred;
    response.topAllies = walletPairs.slice(0, 10);
    response.topRivals = walletPairs.slice(-5).reverse();
    response.faction = walletFaction || null;
    response.stanceHistory = stanceHistory;
  } else {
    // Full view
    response.credibility = result.credibility;

    if (includeFactions) {
      response.factions = result.factions;
    }

    if (includePairs) {
      response.pairs = result.pairs;
    } else {
      // Summary: just the strongest connections
      response.strongestPairs = result.pairs
        .filter((p) => p.rate >= 0.8 && p.total >= 5)
        .sort((a, b) => b.rate - a.rate)
        .slice(0, 20);
    }

    response.posts = result.posts;
  }

  return NextResponse.json(response);
}
