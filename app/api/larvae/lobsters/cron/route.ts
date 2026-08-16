// app/api/larvae/lobsters/cron/route.ts
//
// Clawd Incarnate, driven by one route.
//
//   collect → filter → heats → done
//
// Each visit does one slice and returns. Nothing runs long enough to time
// out, so it makes no difference whether Vercel Cron calls it or you refresh.
//
//   Manual      : /api/larvae/lobsters/cron?secret=YOUR_SECRET
//   Start over  : ...&reset=true        (published results stay up)
//   Nuke it     : ...&hardReset=true
//   Smoke test  : ...&limit=3           (runs at most 3 heats, then stops)
//
// There is deliberately NO automatic weekly reset. An earlier version had one
// and it deleted a completed round mid-run.

import { NextRequest, NextResponse } from "next/server";
import {
  collectSlice,
  drawHeats,
  freshState,
  getState,
  hardReset,
  heatSlice,
  publish,
  resetRun,
  resolveTaxa,
  setState,
} from "@/lib/lobsters";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 35_000;

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

  const params = req.nextUrl.searchParams;
  const deadline = Date.now() + TIME_BUDGET_MS;

  if (params.get("hardReset") === "true") await hardReset();
  else if (params.get("reset") === "true") await resetRun();

  const state = await getState();

  // ── start a round ───────────────────────────────────────────────────────
  if (!state) {
    const taxonIds = await resolveTaxa();
    if (taxonIds.length === 0) {
      return NextResponse.json(
        { error: "could not resolve any lobster taxon — check LOBSTER_TAXA" },
        { status: 502 }
      );
    }
    const fresh = freshState(taxonIds);
    await setState(fresh);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: fresh.phase,
      taxonIds,
      message: "Round started. Call again to begin collecting.",
    });
  }

  // ── collect ─────────────────────────────────────────────────────────────
  if (state.phase === "collect") {
    const finished = await collectSlice(state, deadline);
    if (finished) state.phase = "filter";
    await setState(state);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      considered: state.considered,
      message: finished ? "Collected every lobster. Drawing heats next." : "Still collecting.",
    });
  }

  // ── filter — draw the heats ─────────────────────────────────────────────
  if (state.phase === "filter") {
    const draw = await drawHeats();
    if (draw.heats === 0) {
      return NextResponse.json(
        { error: "no heats drawn — is the specimen index empty?" },
        { status: 500 }
      );
    }
    state.phase = "heats";
    state.note = `${draw.heats} heats of ${draw.perHeat}`;
    await setState(state);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      considered: state.considered,
      heats: draw.heats,
      perHeat: draw.perHeat,
      unused: draw.unused,
      message: `${draw.heats} larvae will each judge ${draw.perHeat} lobsters.`,
    });
  }

  // ── heats ───────────────────────────────────────────────────────────────
  if (state.phase === "heats") {
    const limit = Number(params.get("limit") || 0);
    const r = await heatSlice(deadline, limit > 0 ? limit : Infinity);

    if (r.done && limit === 0) {
      state.phase = "done";
      state.note = undefined;
      await setState(state);
      const results = await publish(state);
      return NextResponse.json({
        ok: true,
        done: true,
        phase: "done",
        considered: results.considered,
        shortlisted: results.shortlisted,
        nominees: results.nominees.length,
      });
    }

    // Publish as we go so the page fills in live.
    await publish(state);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      nominatedThisRun: r.count,
      failed: r.failed,
      quotaExhausted: r.quota,
      lastError: r.lastError,
      message: r.quota ? "Daily allowance spent. Resumes tomorrow." : "Heats running.",
    });
  }

  // ── done ────────────────────────────────────────────────────────────────
  return NextResponse.json({ ok: true, done: true, phase: "done", round: state.round });
}
