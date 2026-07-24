// app/api/larvae/alignment/enriched/route.ts
//
// Joins alignment stats (win rate, conviction, factions) with the profile data
// (name, tagline, avatar traits) so the map and credibility pages can render a
// real specimen rather than a hex string.
//
// Everything here is derived from data already in Redis — no LLM calls, no
// larv.ai fetches. Just a join plus the two axis computations.

import { NextResponse } from "next/server";
import { getAlignResult, type Stance } from "@/lib/alignment";
import { getIndex, getProfile } from "@/lib/larvae";
import { lookupEnsMany } from "@/lib/ens";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** How decisive a larva is: share of stances that take a hard position. */
function conviction(breakdown: Record<Stance, number>, total: number): number {
  if (total === 0) return 0;
  const decisive = breakdown.approve + breakdown.disapprove;
  return Math.round((decisive / total) * 1000) / 1000;
}

/** Net lean toward approval, -1 (all disapprove) to +1 (all approve). */
function lean(breakdown: Record<Stance, number>): number {
  const sided = breakdown.approve + breakdown.disapprove;
  if (sided === 0) return 0;
  return Math.round(((breakdown.approve - breakdown.disapprove) / sided) * 1000) / 1000;
}

export async function GET() {
  const result = await getAlignResult();
  if (!result) {
    return NextResponse.json(
      { error: "No alignment data yet. Run the alignment build first." },
      { status: 404 }
    );
  }

  // Profiles are optional — a larva can be in the alignment set without a built
  // profile. Those still render, just with a shortened wallet as the name.
  const index = await getIndex();
  const known = new Set(index.map((e) => e.wallet));

  // 125 concurrent Redis reads will trip Upstash rate limits — batch them.
  const profiles: (Awaited<ReturnType<typeof getProfile>> | null)[] = [];
  const BATCH = 20;
  for (let i = 0; i < result.credibility.length; i += BATCH) {
    const slice = result.credibility.slice(i, i + BATCH);
    const got = await Promise.all(
      slice.map((c) =>
        known.has(c.wallet) ? getProfile(c.wallet) : Promise.resolve(null)
      )
    );
    profiles.push(...got);
  }

  const factionOf = new Map<string, number>();
  for (const f of result.factions) {
    for (const m of f.members) factionOf.set(m, f.id);
  }

  // Strongest ally per larva — the single highest agreement rate with enough
  // shared posts to mean anything.
  const bestAlly = new Map<string, { wallet: string; rate: number }>();
  for (const p of result.pairs) {
    if (p.total < 10) continue;
    const cur = bestAlly.get(p.a);
    if (!cur || p.rate > cur.rate) bestAlly.set(p.a, { wallet: p.b, rate: p.rate });
    const cur2 = bestAlly.get(p.b);
    if (!cur2 || p.rate > cur2.rate) bestAlly.set(p.b, { wallet: p.a, rate: p.rate });
  }

  const ens = await lookupEnsMany(result.credibility.map((c) => c.wallet));

  const larvae = result.credibility.map((c, i) => {
    const p = profiles[i];
    const ally = bestAlly.get(c.wallet) || null;
    return {
      wallet: c.wallet,
      // Nickname only. Hex→ENS is a separate field for address display.
      name: p?.profile.name || `${c.wallet.slice(0, 6)}…${c.wallet.slice(-4)}`,
      ens: ens[c.wallet.toLowerCase()] || null,
      tagline: p?.profile.tagline || "",
      tone: p?.profile.tone || "",
      avatar: p?.avatar || null,
      posts: c.posts,
      wins: c.wins,
      winRate: c.winRate,
      breakdown: c.breakdown,
      conviction: conviction(c.breakdown, c.posts),
      lean: lean(c.breakdown),
      faction: factionOf.get(c.wallet) ?? null,
      topAlly: ally,
    };
  });

  // Hive-wide aggregates, so the pages can show where the middle actually sits
  // instead of leaving the reader to eyeball it.
  const n = larvae.length || 1;
  const totals = result.credibility.reduce(
    (acc, c) => {
      acc.approve += c.breakdown.approve;
      acc.conditional += c.breakdown.conditional;
      acc.disapprove += c.breakdown.disapprove;
      acc.neutral += c.breakdown.neutral;
      return acc;
    },
    { approve: 0, conditional: 0, disapprove: 0, neutral: 0 }
  );
  const stanceTotal =
    totals.approve + totals.conditional + totals.disapprove + totals.neutral || 1;

  const aggStances = result.posts.reduce(
    (acc, p) => {
      if (p.aggregatedStance === null) return acc;
      acc[p.aggregatedStance] = (acc[p.aggregatedStance] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return NextResponse.json({
    computedAt: result.computedAt,
    postCount: result.posts.length,
    larvaeCount: larvae.length,
    larvae,
    factions: result.factions.map((f) => ({
      ...f,
      names: f.members.map(
        (m) => larvae.find((l) => l.wallet === m)?.name || m.slice(0, 8)
      ),
    })),
    hive: {
      avgWinRate:
        Math.round((larvae.reduce((s, l) => s + l.winRate, 0) / n) * 1000) / 1000,
      avgConviction:
        Math.round((larvae.reduce((s, l) => s + l.conviction, 0) / n) * 1000) / 1000,
      stanceMix: {
        approve: Math.round((totals.approve / stanceTotal) * 1000) / 1000,
        conditional: Math.round((totals.conditional / stanceTotal) * 1000) / 1000,
        disapprove: Math.round((totals.disapprove / stanceTotal) * 1000) / 1000,
        neutral: Math.round((totals.neutral / stanceTotal) * 1000) / 1000,
      },
      aggregateStances: aggStances,
    },
    posts: result.posts.map((p) => ({
      id: p.id,
      source: p.source,
      title: p.title,
      aggregatedStance: p.aggregatedStance,
      respondentCount: p.respondentCount,
    })),
  });
}
