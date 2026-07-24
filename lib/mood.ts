// lib/mood.ts
//
// Hive mood board — present snapshot of governance sentiment.
//
// WHAT THIS RANKS:
//
//   happy      — items the swarm mostly backed
//   frustrated — items the swarm mostly opposed
//   contention — items that split the room
//
// WEIGHTING:
//
//   equal — headcount (vote tallies, or RFC stance counts)
//   cv    — larv.ai cvTotals on votes only; RFCs stay equal-weight and are
//           tagged so the UI can say so
//
// No historical rewind. Scores use whatever is in the latest gov build.

import type { GovItem, GovKind, GovResult } from "@/lib/gov";
import type { Stance } from "@/lib/alignment";

export type MoodWeight = "equal" | "cv";

export type MoodItem = {
  id: string;
  title: string;
  kind: GovKind;
  /** 0–1 primary score for ranking (support, oppose, or split intensity). */
  score: number;
  /** Participation used in the denominator. */
  n: number;
  /** Short metric for the row, e.g. "78% for". */
  metric: string;
  /** Optional detail, e.g. "52–48 · vote". */
  detail?: string;
  /** True when CV mode fell back to headcount (typical for RFCs). */
  equalWeightFallback?: boolean;
  link: string;
};

export type MoodBoard = {
  happy: MoodItem[];
  frustrated: MoodItem[];
  contention: MoodItem[];
};

export type MoodReport = {
  equal: MoodBoard;
  cv: MoodBoard;
  meta: {
    collectedAt: string;
    voteCount: number;
    rfcCount: number;
    /** Share of votes that have cvTotals. */
    cvCoverage: number;
    caveat: string;
  };
};

const LARV_GOV = (id: string) => `https://larv.ai/gov/${id}`;

const MIN_N = 5;

function sumValues(rec: Record<string, number> | null | undefined): number {
  if (!rec) return 0;
  return Object.values(rec).reduce((s, v) => s + (Number(v) || 0), 0);
}

function stanceCounts(item: GovItem): Record<Stance, number> {
  const out: Record<Stance, number> = {
    approve: 0,
    conditional: 0,
    disapprove: 0,
    neutral: 0,
  };
  for (const r of item.responses) {
    if (!r.stance) continue;
    out[r.stance]++;
  }
  return out;
}

type Scored = {
  item: GovItem;
  happy: number;
  frustrated: number;
  contention: number;
  n: number;
  happyMetric: string;
  frustratedMetric: string;
  contentionMetric: string;
  contentionDetail: string;
  equalWeightFallback: boolean;
};

/**
 * Score one item under a weighting mode.
 * Returns null when there isn't enough signal to rank.
 */
function scoreItem(item: GovItem, weight: MoodWeight): Scored | null {
  if (item.kind === "vote") {
    const useCv = weight === "cv" && item.cvTotals && sumValues(item.cvTotals) > 0;
    const bag = useCv ? item.cvTotals! : item.tallies;
    const n = sumValues(bag);
    if (n < MIN_N) return null;

    const aff = item.affirmativeOption;
    if (!aff || !bag) {
      // Unpolarized: still useful for contention via top-two split.
      const sorted = Object.entries(bag || {}).sort((a, b) => b[1] - a[1]);
      if (sorted.length < 2) return null;
      const [a, b] = sorted;
      const top = (a[1] + b[1]) / n;
      const balance = 1 - Math.abs(a[1] - b[1]) / (a[1] + b[1] || 1);
      const contention = balance * top;
      const pctA = Math.round((a[1] / n) * 100);
      const pctB = Math.round((b[1] / n) * 100);
      return {
        item,
        happy: 0,
        frustrated: 0,
        contention,
        n,
        happyMetric: "",
        frustratedMetric: "",
        contentionMetric: `split ${pctA}–${pctB}`,
        contentionDetail: useCv ? "CV · no clear yes/no" : "no clear yes/no",
        equalWeightFallback: weight === "cv" && !useCv,
      };
    }

    const forN = Number(bag[aff]) || 0;
    const againstN = n - forN;
    const happy = forN / n;
    const frustrated = againstN / n;
    const balance = 1 - Math.abs(forN - againstN) / n;
    const contention = balance; // already 0–1; participation handled by min-n + sort tiebreak

    return {
      item,
      happy,
      frustrated,
      contention,
      n,
      happyMetric: `${Math.round(happy * 100)}% for`,
      frustratedMetric: `${Math.round(frustrated * 100)}% against`,
      contentionMetric: `split ${Math.round(happy * 100)}–${Math.round(frustrated * 100)}`,
      contentionDetail: useCv ? "CV-weighted vote" : "headcount vote",
      equalWeightFallback: weight === "cv" && !useCv,
    };
  }

  // RFC — stance mix from classified prose. Always equal weight.
  const counts = stanceCounts(item);
  const classified =
    counts.approve + counts.conditional + counts.disapprove + counts.neutral;
  if (classified < MIN_N) return null;

  const happy = counts.approve / classified;
  const frustrated = counts.disapprove / classified;
  // Contention: approve vs disapprove balance among the non-hedge camp,
  // scaled by how much of the room took a side.
  const polarized = counts.approve + counts.disapprove;
  const sideShare = polarized / classified;
  const balance =
    polarized > 0 ? 1 - Math.abs(counts.approve - counts.disapprove) / polarized : 0;
  const contention = balance * sideShare;

  return {
    item,
    happy,
    frustrated,
    contention,
    n: classified,
    happyMetric: `${Math.round(happy * 100)}% approve`,
    frustratedMetric: `${Math.round(frustrated * 100)}% disapprove`,
    contentionMetric:
      polarized > 0
        ? `split ${Math.round((counts.approve / polarized) * 100)}–${Math.round((counts.disapprove / polarized) * 100)}`
        : "little polar disagreement",
    contentionDetail: "RFC · model-inferred",
    equalWeightFallback: weight === "cv",
  };
}

function toMoodItem(
  s: Scored,
  kind: "happy" | "frustrated" | "contention"
): MoodItem {
  const score =
    kind === "happy" ? s.happy : kind === "frustrated" ? s.frustrated : s.contention;
  const metric =
    kind === "happy"
      ? s.happyMetric
      : kind === "frustrated"
        ? s.frustratedMetric
        : s.contentionMetric;

  return {
    id: s.item.id,
    title: s.item.title || s.item.question.slice(0, 120) || `Item ${s.item.id}`,
    kind: s.item.kind,
    score,
    n: s.n,
    metric,
    detail: kind === "contention" ? s.contentionDetail : undefined,
    equalWeightFallback: s.equalWeightFallback || undefined,
    link: LARV_GOV(s.item.id),
  };
}

function rankBoard(scored: Scored[]): MoodBoard {
  const usable = scored.filter((s) => {
    // Unpolarized votes only appear in contention.
    if (!s.item.affirmativeOption && s.item.kind === "vote") {
      return s.contention > 0;
    }
    return true;
  });

  const byHappy = [...usable]
    .filter((s) => s.happyMetric && s.happy > 0)
    .sort((a, b) => b.happy - a.happy || b.n - a.n)
    .slice(0, 10)
    .map((s) => toMoodItem(s, "happy"));

  const byFrustrated = [...usable]
    .filter((s) => s.frustratedMetric && s.frustrated > 0)
    .sort((a, b) => b.frustrated - a.frustrated || b.n - a.n)
    .slice(0, 10)
    .map((s) => toMoodItem(s, "frustrated"));

  const byContention = [...usable]
    .filter((s) => s.contention > 0.15 && s.n >= MIN_N)
    .sort((a, b) => b.contention - a.contention || b.n - a.n)
    .slice(0, 5)
    .map((s) => toMoodItem(s, "contention"));

  return { happy: byHappy, frustrated: byFrustrated, contention: byContention };
}

/** Build present-day mood boards from the latest governance snapshot. */
export function buildMoodReport(result: GovResult): MoodReport {
  const equalScored = result.items
    .map((i) => scoreItem(i, "equal"))
    .filter(Boolean) as Scored[];
  const cvScored = result.items
    .map((i) => scoreItem(i, "cv"))
    .filter(Boolean) as Scored[];

  const votes = result.items.filter((i) => i.kind === "vote");
  const withCv = votes.filter((i) => i.cvTotals && sumValues(i.cvTotals) > 0);
  const cvCoverage = votes.length ? withCv.length / votes.length : 0;

  return {
    equal: rankBoard(equalScored),
    cv: rankBoard(cvScored),
    meta: {
      collectedAt: result.collectedAt,
      voteCount: votes.length,
      rfcCount: result.items.filter((i) => i.kind === "rfc").length,
      cvCoverage: Math.round(cvCoverage * 1000) / 1000,
      caveat:
        "Present snapshot of all accumulated governance data. Vote % use recorded tallies (or CV totals in CV mode). RFC % are model-inferred from prose, not ballots.",
    },
  };
}
