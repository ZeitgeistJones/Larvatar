// app/api/larvae/lobsters/cron/route.ts
//
// The whole Lobster Crown pipeline, driven by one route.
//
// Each visit reads the phase marker, does one slice of whatever comes next,
// saves progress, and returns. It never runs long enough to time out, so it
// does not matter whether it is Vercel Cron calling it or you refreshing.
//
//   Vercel Cron : Authorization: Bearer $CRON_SECRET
//   Manual      : /api/larvae/lobsters/cron?secret=YOUR_SECRET
//   Start over  : ...&reset=true          (keeps the published results visible)
//   Nuke it     : ...&hardReset=true      (also clears the published results)
//   Smoke test  : ...&limit=5             (scores 5 and stops — run this first)

import { NextRequest, NextResponse } from "next/server";
import {
  buildScoreQueue,
  collectSlice,
  freshState,
  getState,
  hardReset,
  pickFinalists,
  publish,
  resetRun,
  resolveTaxa,
  scoreSlice,
  seedVoteQueue,
  setState,
  voteSlice,
} from "@/lib/lobsters";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 45_000;

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
  const start = Date.now();
  // Leave a little headroom so we always get to write state before the cutoff.
  const deadline = start + TIME_BUDGET_MS;

  if (params.get("hardReset") === "true") await hardReset();
  else if (params.get("reset") === "true") await resetRun();

  let state = await getState();

  // ── nothing in flight: start a round ────────────────────────────────────
  if (!state) {
    const taxonIds = await resolveTaxa();
    if (taxonIds.length === 0) {
      return NextResponse.json(
        { error: "could not resolve any lobster taxon — check LOBSTER_TAXA" },
        { status: 502 }
      );
    }
    state = freshState(taxonIds);
    await setState(state);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
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
      message: finished
        ? "Collected every lobster. Filtering next."
        : "Still collecting — call again to continue.",
    });
  }

  // ── filter ──────────────────────────────────────────────────────────────
  if (state.phase === "filter") {
    const queued = await buildScoreQueue();
    state.phase = "score";
    state.note = `${queued} to score`;
    await setState(state);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      considered: state.considered,
      queued,
    });
  }

  // ── score ───────────────────────────────────────────────────────────────
  if (state.phase === "score") {
    // ?limit=5 scores a handful and stops, so the very first run tells you
    // whether the key and the model actually work before it burns quota.
    const limit = Number(params.get("limit") || 0);
    const sliceDeadline = limit > 0 ? Math.min(deadline, Date.now() + 15_000) : deadline;

    const r = await scoreSlice(sliceDeadline);
    if (r.done && limit === 0) {
      state.phase = "vote";
      state.note = undefined;
      await setState(state);
      await seedVoteQueue();
    } else {
      await setState(state);
    }
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      scoredThisRun: r.scored,
      failed: r.failed,
      quotaExhausted: r.quota,
      message: r.quota
        ? "Daily allowance spent. Picks up automatically tomorrow."
        : r.done
          ? "Scoring finished. Larvae vote next."
          : "Still scoring — call again to continue.",
    });
  }

  // ── vote ────────────────────────────────────────────────────────────────
  if (state.phase === "vote") {
    const finalists = await pickFinalists();
    if (finalists.length === 0) {
      state.phase = "done";
      await setState(state);
      return NextResponse.json({ ok: true, done: true, error: "no finalists — nothing scored" });
    }

    const r = await voteSlice(finalists, deadline);
    if (r.done) {
      state.phase = "done";
      await setState(state);
      const results = await publish(state);
      return NextResponse.json({
        ok: true,
        done: true,
        phase: "done",
        considered: results.considered,
        scored: results.scored,
        votes: results.votes.length,
        championId: results.championId,
      });
    }

    // Publish partial results as we go so the page fills in live.
    await publish(state);
    await setState(state);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      castThisRun: r.cast,
      failed: r.failed,
      quotaExhausted: r.quota,
      message: r.quota
        ? "Daily allowance spent. Picks up automatically tomorrow."
        : "Still voting — call again to continue.",
    });
  }

  // ── done ────────────────────────────────────────────────────────────────
  // Weekly re-run: clear the working keys on a Monday and start fresh. The
  // published results stay up the whole time.
  const weekly = process.env.LOBSTER_WEEKLY !== "false";
  if (weekly && new Date().getUTCDay() === 1 && state.round !== new Date().toISOString().slice(0, 10)) {
    await resetRun();
    return NextResponse.json({
      ok: true,
      done: false,
      phase: "restarting",
      message: "New week — starting a fresh round on the next call.",
    });
  }

  return NextResponse.json({ ok: true, done: true, phase: "done", round: state.round });
}
