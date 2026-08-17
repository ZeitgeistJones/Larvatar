// app/api/larvae/lobsters/cron/route.ts
//
// Clawd Incarnate, driven by one route.
//
//   collect → filter → heats → draw → semi
//     → dossier → ask → answer → f1 → f2 → verdict → done
//
// Each visit does one slice and returns. Nothing runs long enough to time
// out, so it makes no difference whether Vercel Cron calls it or you refresh.
//
//   Manual      : /api/larvae/lobsters/cron?secret=YOUR_SECRET
//   Start over  : ...&reset=true        (published results stay up)
//   Nuke it     : ...&hardReset=true
//   Smoke test  : ...&limit=3           (runs at most 3 judgements, then stops)
//   Resume      : ...&resume=draw       (move the phase marker WITHOUT wiping
//                                        anything — needed when new phases are
//                                        added after a run already finished)
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
  type Phase,
} from "@/lib/lobsters";
import { drawSlates, freezeFinalists, semiSlice } from "@/lib/lobster-semi";
import {
  answerSlice,
  askSlice,
  buildDossiers,
  closeStageOne,
  closeStageTwo,
  seedAnswerQueue,
  seedAskQueue,
  seedVerdictQueue,
  seedVoteQueue,
  verdictSlice,
  voteSlice,
} from "@/lib/lobster-final";

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

  // Move the phase marker without touching any collected data. This exists
  // because new phases get added after a run has already reached `done`, and
  // a reset would throw away work that is still perfectly good.
  const resume = params.get("resume");
  if (resume && state) {
    const allowed: Phase[] = [
      "collect",
      "filter",
      "heats",
      "draw",
      "semi",
      "dossier",
      "ask",
      "answer",
      "f1",
      "f2",
      "verdict",
      "done",
    ];
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
        message: "Heats closed. Drawing the semifinal next.",
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

  // ── draw — deal the semifinal slates ────────────────────────────────────
  if (state.phase === "draw") {
    const draw = await drawSlates();
    if (draw.slates === 0) {
      return NextResponse.json(
        { error: "no slates drawn — are there any nominees?" },
        { status: 500 }
      );
    }
    state.phase = "semi";
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

  // ── semi ────────────────────────────────────────────────────────────────
  if (state.phase === "semi") {
    const limit = Number(params.get("limit") || 0);
    const r = await semiSlice(deadline, limit > 0 ? limit : Infinity);

    if (r.done && limit === 0) {
      const finalists = await freezeFinalists();
      state.phase = "dossier";
      state.note = undefined;
      await setState(state);
      const results = await publish(state);
      return NextResponse.json({
        ok: true,
        done: false,
        phase: "dossier",
        nominees: results.nominees.length,
        finalists: finalists.length,
        message: "Semifinal closed. Press conference next.",
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
      message: r.quota ? "Daily allowance spent. Resumes tomorrow." : "Semifinal running.",
    });
  }

  // ── dossier ─────────────────────────────────────────────────────────────
  if (state.phase === "dossier") {
    const built = await buildDossiers(deadline);
    if (built === 0) {
      const seeded = await seedAskQueue();
      state.phase = "ask";
      state.note = `${seeded} questions to ask`;
      await setState(state);
      return NextResponse.json({
        ok: true,
        done: false,
        phase: state.phase,
        message: "Species records ready. Larvae asking next.",
      });
    }
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      dossiersBuilt: built,
      message: "Fetching species records.",
    });
  }

  // ── ask ─────────────────────────────────────────────────────────────────
  if (state.phase === "ask") {
    const limit = Number(params.get("limit") || 0);
    const r = await askSlice(deadline, limit > 0 ? limit : Infinity);
    if (r.done && limit === 0) {
      const seeded = await seedAnswerQueue();
      state.phase = "answer";
      state.note = `${seeded} to answer`;
      await setState(state);
    }
    await publish(state);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      askedThisRun: r.count,
      failed: r.failed,
      quotaExhausted: r.quota,
      lastError: r.lastError,
      message: r.quota ? "Daily allowance spent. Resumes tomorrow." : "Larvae asking questions.",
    });
  }

  // ── answer ──────────────────────────────────────────────────────────────
  if (state.phase === "answer") {
    const limit = Number(params.get("limit") || 0);
    const r = await answerSlice(deadline, limit > 0 ? limit : Infinity);
    if (r.done && limit === 0) {
      const seeded = await seedVoteQueue(1);
      state.phase = "f1";
      state.note = `${seeded} voters`;
      await setState(state);
    }
    await publish(state);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      answeredThisRun: r.count,
      failed: r.failed,
      quotaExhausted: r.quota,
      lastError: r.lastError,
      message: r.quota ? "Daily allowance spent. Resumes tomorrow." : "Answering from the record.",
    });
  }

  // ── f1 — vote on 12, cut to 5 (seeded) ──────────────────────────────────
  if (state.phase === "f1") {
    const limit = Number(params.get("limit") || 0);
    const r = await voteSlice(1, deadline, limit > 0 ? limit : Infinity);
    if (r.done && limit === 0) {
      const five = await closeStageOne();
      const seeded = await seedVoteQueue(2);
      state.phase = "f2";
      state.note = `${five.length} left, ${seeded} voters`;
      await setState(state);
      await publish(state);
      return NextResponse.json({
        ok: true,
        done: false,
        phase: "f2",
        cutTo: five.length,
        message: "First cut made. Final vote next.",
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
      message: r.quota ? "Daily allowance spent. Resumes tomorrow." : "Voting on the twelve.",
    });
  }

  // ── f2 — vote on 5, champion (live vote only) ───────────────────────────
  if (state.phase === "f2") {
    const limit = Number(params.get("limit") || 0);
    const r = await voteSlice(2, deadline, limit > 0 ? limit : Infinity);
    if (r.done && limit === 0) {
      const championId = await closeStageTwo();
      const queued = await seedVerdictQueue();
      state.phase = "verdict";
      state.note = `${queued} verdicts to write`;
      await setState(state);
      await publish(state);
      return NextResponse.json({
        ok: true,
        done: false,
        phase: "verdict",
        championId,
        message: "Champion decided. Writing up why each one placed where it did.",
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
      message: r.quota ? "Daily allowance spent. Resumes tomorrow." : "Final vote.",
    });
  }

  // ── verdict — one synthesis per finalist, from the ballots only ─────────
  if (state.phase === "verdict") {
    const r = await verdictSlice(deadline);
    if (r.done) {
      state.phase = "done";
      state.note = undefined;
      await setState(state);
      const results = await publish(state);
      return NextResponse.json({
        ok: true,
        done: true,
        phase: "done",
        championId: results.championId,
        questions: results.questions.length,
        ballots: results.finalBallots.length,
        placings: results.placings.length,
      });
    }
    await publish(state);
    return NextResponse.json({
      ok: true,
      done: false,
      phase: state.phase,
      writtenThisRun: r.count,
      failed: r.failed,
      quotaExhausted: r.quota,
      lastError: r.lastError,
      message: r.quota ? "Daily allowance spent. Resumes tomorrow." : "Writing verdicts.",
    });
  }

  // ── done ────────────────────────────────────────────────────────────────
  return NextResponse.json({ ok: true, done: true, phase: "done", round: state.round });
}
