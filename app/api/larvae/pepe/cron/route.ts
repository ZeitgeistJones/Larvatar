// app/api/larvae/pepe/cron/route.ts
//
// Pepe Incarnate — lean pipeline, one route.
//
//   collect → filter → heats → draw → rank → done
//
// Each visit does one slice and returns (Vercel Hobby ~60s cap).
//
//   Manual      : /api/larvae/pepe/cron?secret=YOUR_SECRET
//   Start over  : ...&reset=true        (published results stay up)
//   Nuke it     : ...&hardReset=true
//   Smoke test  : ...&limit=3
//   Resume      : ...&resume=rank
//
// Auth: LARVAE_BUILD_SECRET query param, or Authorization: Bearer CRON_SECRET.
// Gemini: GEMINI_PEPE_KEY or GEMINI_API_KEY (never commit secrets).

import { NextRequest, NextResponse } from "next/server";
import {
  collectSlice,
  drawHeats,
  drawRankSlates,
  freezeChampion,
  freshState,
  getState,
  hardReset,
  heatSlice,
  publish,
  rankSlice,
  resetRun,
  resolveTaxa,
  setState,
  type Phase,
} from "@/lib/pepe";

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

  const resume = params.get("resume");
  if (resume && state) {
    const allowed: Phase[] = ["collect", "filter", "heats", "draw", "rank", "done"];
    if (!allowed.includes(resume as Phase)) {
      return NextResponse.json(
        { error: `resume must be one of ${allowed.join(", ")}` },
        { status: 400 }
      );
    }
    state.phase = resume as Phase;
    state.note = `resumed at ${resume}`;
    await setState(state);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      message: `Phase set to ${resume}. Nothing was wiped. Call again to continue.`,
    });
  }

  // ── start ───────────────────────────────────────────────────────────────
  if (!state) {
    const taxonIds = await resolveTaxa();
    if (taxonIds.length === 0) {
      return NextResponse.json(
        { error: "could not resolve any frog taxon — check PEPE_TAXA" },
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
      message: "Round started. Call again to begin collecting frogs.",
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
      message: finished
        ? "Collected the frog pool. Drawing heats next."
        : "Still collecting frogs from iNaturalist.",
    });
  }

  // ── filter — draw heats ─────────────────────────────────────────────────
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
      message: `${draw.heats} larvae will each judge ${draw.perHeat} frogs.`,
    });
  }

  // ── heats ───────────────────────────────────────────────────────────────
  if (state.phase === "heats") {
    const limit = Number(params.get("limit") || 0);
    const r = await heatSlice(deadline, limit > 0 ? limit : Infinity);

    if (r.done && limit === 0) {
      state.phase = "draw";
      state.note = undefined;
      await setState(state);
      const results = await publish(state);
      return NextResponse.json({
        ok: true,
        done: false,
        phase: "draw",
        considered: results.considered,
        shortlisted: results.shortlisted,
        nominees: results.nominees.length,
        abstentions: results.abstentions,
        greenCount: results.greenCount,
        message: "Heats closed. Drawing ranking slates next.",
      });
    }

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

  // ── draw ranking slates ─────────────────────────────────────────────────
  if (state.phase === "draw") {
    const draw = await drawRankSlates();
    if (draw.slates === 0) {
      return NextResponse.json(
        { error: "no ranking slates — are there any green nominees?" },
        { status: 500 }
      );
    }
    state.phase = "rank";
    state.note = `${draw.slates} slates of ${draw.slateSize}`;
    await setState(state);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      slates: draw.slates,
      slateSize: draw.slateSize,
      viewsEach: draw.viewsEach,
      message: `Every nominee will be judged by about ${draw.viewsEach} larvae.`,
    });
  }

  // ── rank ────────────────────────────────────────────────────────────────
  if (state.phase === "rank") {
    const limit = Number(params.get("limit") || 0);
    const r = await rankSlice(deadline, limit > 0 ? limit : Infinity);

    if (r.done && limit === 0) {
      const { championId, top } = await freezeChampion();
      state.phase = "done";
      state.note = undefined;
      await setState(state);
      const results = await publish(state);
      return NextResponse.json({
        ok: true,
        done: true,
        phase: "done",
        championId,
        top: top.length,
        nominees: results.nominees.length,
        ballots: results.rankBallots.length,
        message: "Ranking closed. Pepe Incarnate decided.",
      });
    }

    await publish(state);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      votedThisRun: r.count,
      failed: r.failed,
      quotaExhausted: r.quota,
      lastError: r.lastError,
      message: r.quota ? "Daily allowance spent. Resumes tomorrow." : "Ranking pass running.",
    });
  }

  // ── done ────────────────────────────────────────────────────────────────
  return NextResponse.json({ ok: true, done: true, phase: "done", round: state.round });
}
