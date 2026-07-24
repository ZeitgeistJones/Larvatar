// lib/validation.ts
//
// Does the forum stance classifier actually work?
//
// THE QUESTION:
//
// 11,695 forum and labs responses had their stance INFERRED by a model reading
// prose. 272 governance votes have an EXPLICIT choice the larva actually made.
// The second is ground truth. The first is a guess. This checks the guess
// against the truth.
//
// THE NAIVE VERSION IS WRONG:
//
// You cannot simply ask "did the larva who voted YES get classified as
// approve?" Larvae hedge constantly — one votes "Yes Start Burning Again" and
// then writes "yes, but only for 30 days, with a checkpoint, and we pivot if
// metrics are flat." A binary ballot forces a side; prose keeps the caveats.
// Classifying that prose as `conditional` is CORRECT, not a miss. Scoring it
// as a mismatch would punish the classifier for being right.
//
// WHAT THIS MEASURES INSTEAD:
//
// Separation. Take everyone who voted YES on a polarized vote, and everyone
// who voted NO. Compare their forum stance distributions.
//
//   - If yes-voters skew approve/conditional and no-voters skew disapprove,
//     the classifier is picking up real signal even through the hedging.
//   - If the two groups look identical, the classifier is producing noise and
//     everything built on it is unreliable.
//
// This tolerates hedging by design: it never asks any individual response to
// match a vote, only asks whether the two populations differ.

import type { AlignmentResult, Stance } from "@/lib/alignment";
import type { GovResult } from "@/lib/gov";

/* ─── Types ────────────────────────────────────────────────────────── */

export type StanceMix = Record<Stance, number>;

export type GroupProfile = {
  /** How many larvae are in this group. */
  larvae: number;
  /** Total forum/labs stances contributed by the group. */
  stances: number;
  /** Raw counts by stance. */
  counts: StanceMix;
  /** Counts as shares of the group's total, 0-1. */
  shares: StanceMix;
  /**
   * Net lean, -1 (all disapprove) to +1 (all approve), with conditional
   * counted as a half-step toward approve since it is directional support.
   */
  lean: number;
};

export type VoteValidation = {
  voteId: string;
  title: string;
  affirmativeOption: string;
  yes: GroupProfile;
  no: GroupProfile;
  /** yes.lean - no.lean. Positive means the classifier separated them correctly. */
  separation: number;
  /** How confident we can be, given group sizes. */
  reliable: boolean;
};

export type ValidationReport = {
  votes: VoteValidation[];
  /** Mean separation across usable votes. */
  meanSeparation: number;
  /** Plain-language read of what the separation means. */
  verdict: string;
  /** Votes that couldn't be used, and why. */
  skipped: { voteId: string; reason: string }[];
};

/* ─── Thresholds ───────────────────────────────────────────────────── */

/** Each side needs this many larvae before a comparison means anything. */
const MIN_GROUP_SIZE = 8;

/** Each side needs this many forum stances behind it. */
const MIN_GROUP_STANCES = 40;

/**
 * Separation below this is indistinguishable from noise. Chosen to be
 * deliberately unforgiving: a classifier that barely separates the groups is
 * not one you should build conclusions on.
 */
const WEAK_SEPARATION = 0.08;
const STRONG_SEPARATION = 0.2;

/* ─── Profiling ────────────────────────────────────────────────────── */

const EMPTY = (): StanceMix => ({
  approve: 0,
  conditional: 0,
  disapprove: 0,
  neutral: 0,
});

/**
 * Summarize the forum/labs stances of a set of larvae.
 *
 * `conditional` counts as +0.5 rather than 0. It is directional — a larva
 * saying "yes, with conditions" is closer to support than to opposition — and
 * treating it as neutral would erase most of the signal, since conditional is
 * by far the most common stance in this dataset.
 */
function profile(wallets: Set<string>, alignment: AlignmentResult): GroupProfile {
  const counts = EMPTY();
  let total = 0;

  for (const s of alignment.stances) {
    if (!wallets.has(s.wallet)) continue;
    counts[s.stance]++;
    total++;
  }

  const shares = EMPTY();
  if (total > 0) {
    for (const k of Object.keys(counts) as Stance[]) {
      shares[k] = Math.round((counts[k] / total) * 1000) / 1000;
    }
  }

  // Neutral is excluded from lean entirely — it carries no direction, and
  // including it would just dilute both groups equally.
  const directional = counts.approve + counts.conditional + counts.disapprove;
  const lean =
    directional > 0
      ? Math.round(
          ((counts.approve + counts.conditional * 0.5 - counts.disapprove) /
            directional) *
            1000
        ) / 1000
      : 0;

  return { larvae: wallets.size, stances: total, counts, shares, lean };
}

/* ─── Validation ───────────────────────────────────────────────────── */

export function validateClassifier(
  alignment: AlignmentResult,
  gov: GovResult
): ValidationReport {
  const votes: VoteValidation[] = [];
  const skipped: { voteId: string; reason: string }[] = [];

  for (const item of gov.items) {
    if (item.kind !== "vote") continue;

    // Without a readable yes-side there is no direction to test against.
    if (!item.affirmativeOption) {
      skipped.push({
        voteId: item.id,
        reason: "options had no clear yes/no side, so there is no direction to compare",
      });
      continue;
    }

    const yesWallets = new Set<string>();
    const noWallets = new Set<string>();
    for (const r of item.responses) {
      if (!r.chosenOption) continue;
      if (r.chosenOption === item.affirmativeOption) yesWallets.add(r.wallet);
      else noWallets.add(r.wallet);
    }

    const yes = profile(yesWallets, alignment);
    const no = profile(noWallets, alignment);

    if (
      yes.larvae < MIN_GROUP_SIZE ||
      no.larvae < MIN_GROUP_SIZE ||
      yes.stances < MIN_GROUP_STANCES ||
      no.stances < MIN_GROUP_STANCES
    ) {
      skipped.push({
        voteId: item.id,
        reason: `one side too small to compare (yes: ${yes.larvae} larvae / ${yes.stances} stances, no: ${no.larvae} / ${no.stances})`,
      });
      continue;
    }

    const separation = Math.round((yes.lean - no.lean) * 1000) / 1000;

    votes.push({
      voteId: item.id,
      title: item.title,
      affirmativeOption: item.affirmativeOption,
      yes,
      no,
      separation,
      reliable: true,
    });
  }

  const meanSeparation =
    votes.length > 0
      ? Math.round(
          (votes.reduce((s, v) => s + v.separation, 0) / votes.length) * 1000
        ) / 1000
      : 0;

  return {
    votes,
    meanSeparation,
    verdict: verdictFor(votes.length, meanSeparation),
    skipped,
  };
}

function verdictFor(usableVotes: number, sep: number): string {
  if (usableVotes === 0) {
    return "No vote had two sides large enough to compare. The classifier cannot be validated against this governance data.";
  }

  const base =
    usableVotes === 1
      ? "Based on a single usable vote, so treat this as indicative rather than settled. "
      : `Based on ${usableVotes} usable votes. `;

  if (sep >= STRONG_SEPARATION) {
    return (
      base +
      "Larvae who voted yes lean clearly more supportive in their forum writing than those who voted no. The classifier is picking up real signal through the hedging, which means forum-based stances can be trusted as a rough directional measure."
    );
  }
  if (sep >= WEAK_SEPARATION) {
    return (
      base +
      "There is a modest difference between yes-voters and no-voters in their forum writing. The classifier is picking up something, but weakly — forum stances are suggestive rather than dependable, and conclusions drawn from small differences in them are not safe."
    );
  }
  if (sep > -WEAK_SEPARATION) {
    return (
      base +
      "Yes-voters and no-voters look essentially the same in their forum writing. The classifier is not separating them, which means forum-inferred stances are close to noise and anything built on them should be treated with real suspicion."
    );
  }
  return (
    base +
    "Yes-voters lean LESS supportive than no-voters in their forum writing, which is backwards. Either the polarity of the vote options was read wrong, or the classifier is inverted. This needs investigation before any forum-based conclusion is used."
  );
}
