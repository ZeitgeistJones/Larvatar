// app/api/larvae/pepe/final/route.ts
//
// Equal-exposure FINAL among near-perfect ranking frogs.
// Does NOT wipe heats/ranking — only pepe:final:* keys.
//
//   Seed   : GET /api/larvae/pepe/final?secret=SECRET&action=seed
//   Run    : GET /api/larvae/pepe/final?secret=SECRET&action=run&limit=3
//   Freeze : GET /api/larvae/pepe/final?secret=SECRET&action=freeze
//   Status : GET /api/larvae/pepe/final?secret=SECRET&action=status
//   Reset  : GET /api/larvae/pepe/final?secret=SECRET&action=reset
//
// Auth: LARVAE_BUILD_SECRET query param, or Authorization: Bearer CRON_SECRET.
// Gemini: GEMINI_PEPE_KEY → GEMINI_LOBSTER_KEY → GEMINI_API_KEY.

import { NextRequest, NextResponse } from "next/server";
import {
  finalSlice,
  freezeFinalChampion,
  getFinalRound,
  resetFinal,
  seedFinal,
} from "@/lib/pepe";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 52_000;

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

  const action = (req.nextUrl.searchParams.get("action") || "status").toLowerCase();
  const deadline = Date.now() + TIME_BUDGET_MS;

  try {
    if (action === "reset") {
      await resetFinal();
      return NextResponse.json({
        ok: true,
        action: "reset",
        message: "Final round cleared. Ranking results untouched.",
      });
    }

    if (action === "seed") {
      const seeded = await seedFinal();
      return NextResponse.json({
        ok: true,
        action: "seed",
        done: false,
        ...seeded,
        message: `Final seeded: ${seeded.species.join(" · ")}. Call action=run to vote.`,
      });
    }

    if (action === "run") {
      const limit = Number(req.nextUrl.searchParams.get("limit") || 0);
      const r = await finalSlice(deadline, limit > 0 ? limit : Infinity);
      const round = await getFinalRound();

      if (r.done && limit === 0 && !r.quota) {
        const frozen = await freezeFinalChampion();
        const after = await getFinalRound();
        return NextResponse.json({
          ok: true,
          action: "run",
          done: true,
          votedThisRun: r.count,
          failed: r.failed,
          ...frozen,
          final: after,
          message: frozen.changed
            ? `Final closed. Champion changed ${frozen.preliminaryChampionId} → ${frozen.championId}.`
            : `Final closed. Champion confirmed: ${frozen.championId}.`,
        });
      }

      return NextResponse.json({
        ok: true,
        action: "run",
        done: false,
        votedThisRun: r.count,
        failed: r.failed,
        quotaExhausted: r.quota,
        lastError: r.lastError,
        ballots: round?.ballots.length ?? 0,
        target: round?.ballotTarget,
        message: r.quota
          ? "Daily allowance spent. Call again tomorrow."
          : "Final ballots running — call again.",
      });
    }

    if (action === "freeze") {
      const frozen = await freezeFinalChampion();
      const after = await getFinalRound();
      return NextResponse.json({
        ok: true,
        action: "freeze",
        done: true,
        ...frozen,
        final: after,
        message: frozen.changed
          ? `Champion changed ${frozen.preliminaryChampionId} → ${frozen.championId}.`
          : `Champion confirmed: ${frozen.championId}.`,
      });
    }

    // status
    const round = await getFinalRound();
    return NextResponse.json({
      ok: true,
      action: "status",
      ready: !!round,
      final: round,
    });
  } catch (e) {
    console.error("pepe final:", e);
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e).slice(0, 400) },
      { status: 500 }
    );
  }
}
