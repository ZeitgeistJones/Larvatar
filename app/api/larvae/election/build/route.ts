// app/api/larvae/election/build/route.ts
//
// Mock hive election. Two phases, both chunked/resumable — just keep visiting
// the SAME url until it says "done": true, same pattern as the profile build.
//
//   https://yourapp.vercel.app/api/larvae/election/build?secret=YOUR_SECRET
//
// Phase 1 (pitches): every larva gets a 200-char campaign pitch from its profile.
// Phase 2 (voting): once every candidate has a pitch, every larva reads every
//   OTHER larva's pitch (no self-votes) and casts one vote + a one-line reason.
//   Vote matching is resilient — a near-miss name still lands. Tally is computed
//   automatically once all votes are in.
//
// Add &reset=true to wipe the whole election and start fresh.

import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/larvae";
import {
  getCandidates,
  saveCandidates,
  initCandidatesFromProfiles,
  getVoteQueue,
  setVoteQueue,
  isVotingStarted,
  markVotingStarted,
  appendVote,
  getVotes,
  getVotedSet,
  getFailed,
  setFailed,
  computeTally,
  saveTally,
  resetElection,
  generatePitch,
  castVote,
  resolveVotedWallet,
} from "@/lib/election";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 45_000;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (req.nextUrl.searchParams.get("reset") === "true") {
    await resetElection();
  }

  const start = Date.now();

  let candidates = await getCandidates();
  if (candidates.length === 0) {
    candidates = await initCandidatesFromProfiles();
    if (candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        message: "No larva profiles found — run the main profile build first.",
      });
    }
  }

  // ---------- phase 1: pitches ----------
  const pendingPitches = candidates.filter((c) => !c.pitch);
  if (pendingPitches.length > 0) {
    let pitchesThisRun = 0;
    const byWallet = new Map(candidates.map((c) => [c.wallet, c]));

    for (const cand of pendingPitches) {
      if (Date.now() - start > TIME_BUDGET_MS) break;
      const p = await getProfile(cand.wallet);
      if (!p) continue;
      try {
        const pitch = await generatePitch({
          name: p.profile.name,
          tagline: p.profile.tagline,
          tone: p.profile.tone,
          values: p.profile.values,
          quirks: p.profile.quirks,
          summary: p.profile.summary,
        });
        byWallet.get(cand.wallet)!.pitch = pitch;
        pitchesThisRun++;
      } catch {
        // leave null, retry next visit
      }
      await saveCandidates(Array.from(byWallet.values())); // persist per pitch
    }

    const stillPending = Array.from(byWallet.values()).filter((c) => !c.pitch).length;
    return NextResponse.json({
      ok: true,
      done: false,
      phase: "pitches",
      pitchesThisRun,
      totalCandidates: candidates.length,
      remaining: stillPending,
      message: "Not finished — visit this same URL again to continue.",
    });
  }

  // ---------- phase 2: voting ----------
  if (!(await isVotingStarted())) {
    await setVoteQueue(candidates.map((c) => c.wallet));
    await markVotingStarted();
  }

  let queue = await getVoteQueue();
  const alreadyVoted = await getVotedSet();
  const byNameNarrow = candidates; // matcher handles normalization

  let votesThisRun = 0;
  const failedThisRun: string[] = [];

  while (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
    const voterWallet = queue.shift()!;

    // skip anyone who already has a recorded vote (safe re-run)
    if (alreadyVoted.has(voterWallet)) {
      await setVoteQueue(queue);
      continue;
    }

    const voterProfile = await getProfile(voterWallet);
    const voterCandidate = candidates.find((c) => c.wallet === voterWallet);

    if (!voterProfile || !voterCandidate) {
      failedThisRun.push(voterWallet);
      await setVoteQueue(queue);
      continue;
    }

    const ballot = candidates
      .filter((c) => c.wallet !== voterWallet && c.pitch)
      .map((c) => ({ name: c.name, pitch: c.pitch as string }));

    try {
      const result = await castVote(
        {
          name: voterProfile.profile.name,
          tone: voterProfile.profile.tone,
          values: voterProfile.profile.values,
          quirks: voterProfile.profile.quirks,
          summary: voterProfile.profile.summary,
        },
        ballot
      );

      const matched = result
        ? resolveVotedWallet(result.votedForName, byNameNarrow, voterWallet)
        : null;

      if (result && matched) {
        await appendVote({
          voter: voterWallet,
          voterName: voterCandidate.name,
          votedFor: matched.wallet,
          votedForName: matched.name,
          reasoning: result.reasoning,
        });
        alreadyVoted.add(voterWallet);
        votesThisRun++;
      } else {
        failedThisRun.push(voterWallet);
      }
    } catch {
      failedThisRun.push(voterWallet);
    }

    await setVoteQueue(queue);
  }

  // merge this run's failures into the persistent failed set
  if (failedThisRun.length > 0) {
    const priorFailed = await getFailed();
    const mergedFailed = Array.from(new Set([...priorFailed, ...failedThisRun]));
    await setFailed(mergedFailed);
  }

  if (queue.length === 0) {
    const votes = await getVotes();
    const tally = computeTally(candidates, votes);
    await saveTally(tally);
    const allFailed = await getFailed();
    return NextResponse.json({
      ok: true,
      done: true,
      phase: "voting",
      totalVotes: votes.length,
      totalCandidates: candidates.length,
      winner: tally.winnerName,
      failedCount: allFailed.length,
      failed: allFailed,
    });
  }

  const allFailed = await getFailed();
  return NextResponse.json({
    ok: true,
    done: false,
    phase: "voting",
    votesThisRun,
    remaining: queue.length,
    failedSoFar: allFailed.length,
    message: "Not finished — visit this same URL again to continue.",
  });
}
