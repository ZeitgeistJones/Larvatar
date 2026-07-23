// lib/reception.ts
//
// Author reception: how the swarm responds to different proposers.
//
// WHAT THIS MEASURES, AND WHAT IT DOESN'T:
//
// /credibility measures voters — how often a larva's stance matched the
// swarm's eventual position. This measures the other side: proposers. For each
// author, what share of their posts ended in an approving aggregate versus a
// hedged or negative one.
//
// The honest caveat, which belongs in front of the numbers rather than under
// them: a high approval rate is equally consistent with "this person writes
// well-scoped proposals" and with "the swarm favours this person". Nothing in
// this data distinguishes those. Anyone reading a high number as evidence of
// favouritism is reading in something the measurement can't support.
//
// The per-larva-per-author matrix (below) is the sharper instrument, and the
// easier one to misread. A larva approving 75% of one author's posts means
// nothing if it approves 70% of everything — so relationships are reported as
// DEVIATION FROM THAT LARVA'S OWN BASELINE, never as a raw rate.

import { redis } from "@/lib/larvae";
import type { Stance, AlignmentResult } from "@/lib/alignment";

/* ─── Types ────────────────────────────────────────────────────────── */

/** Post id -> author wallet. Backfilled separately from the stance data. */
export type AuthorMap = Record<string, string>;

export type AuthorReception = {
  wallet: string;
  posts: number;
  /** Aggregate stance outcomes across this author's posts. */
  outcomes: Record<Stance, number>;
  /** Share of posts whose aggregate landed on "approve". */
  approvalRate: number;
  /** Share that landed anywhere other than disapprove. */
  nonNegativeRate: number;
  /** True when there are too few posts for the rates to mean anything. */
  insufficientData: boolean;
};

/**
 * One larva's stance pattern toward one author, expressed as deviation from
 * that larva's own overall behaviour.
 */
export type LarvaAuthorRelation = {
  larva: string;
  author: string;
  posts: number;
  /** How often this larva approves this author. */
  approveRate: number;
  /** How often this larva approves anyone. */
  baselineApproveRate: number;
  /** approveRate - baselineApproveRate. Positive = warmer than usual. */
  deviation: number;
};

export type ReceptionReport = {
  authors: AuthorReception[];
  /** Mean approval rate across authors meeting the post threshold. */
  meanApprovalRate: number;
  /** Only relationships that clear the significance floor. */
  relations: LarvaAuthorRelation[];
  postsWithKnownAuthor: number;
  postsTotal: number;
};

/* ─── Thresholds ───────────────────────────────────────────────────── */

/**
 * An author needs this many posts before a rate is reported rather than
 * suppressed. One post at 100% approval is noise, and publishing it as a rate
 * would be misleading.
 */
export const MIN_POSTS_FOR_AUTHOR = 5;

/** A larva needs this many posts *from a given author* before the pair counts. */
export const MIN_POSTS_FOR_RELATION = 8;

/**
 * Minimum deviation from a larva's own baseline before a relationship is worth
 * surfacing. Below this it's indistinguishable from ordinary variation.
 */
export const MIN_DEVIATION = 0.2;

/* ─── Author map storage ───────────────────────────────────────────── */

const AUTHOR_MAP_KEY = "lpp:reception:authors";

export async function getAuthorMap(): Promise<AuthorMap> {
  const raw = await redis.get<string | AuthorMap>(AUTHOR_MAP_KEY);
  if (!raw) return {};
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function saveAuthorMap(map: AuthorMap) {
  await redis.set(AUTHOR_MAP_KEY, JSON.stringify(map));
}

/**
 * Fetch author wallets for every forum post and labs idea.
 *
 * This exists as a separate backfill because the alignment collector never
 * stored the poster's wallet — only the responders'. Re-running the full
 * classification to capture one field would mean reclassifying ~11,700
 * responses, so instead we fetch just the list endpoints (two calls, no LLM)
 * and key by the same source/id the stance records use.
 */
export async function backfillAuthors(): Promise<{
  fetched: number;
  forum: number;
  labs: number;
}> {
  const BASE = "https://larv.ai/api";
  const map: AuthorMap = {};
  let forum = 0;
  let labs = 0;

  const getJson = async (url: string) => {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };

  const posts = await getJson(`${BASE}/forum`);
  if (Array.isArray(posts)) {
    for (const p of posts) {
      const w = p?.wallet || p?.author || p?.creator;
      if (p?.id != null && typeof w === "string") {
        map[`forum/${p.id}`] = w.toLowerCase();
        forum++;
      }
    }
  }

  const ideas = await getJson(`${BASE}/labs`);
  if (Array.isArray(ideas)) {
    for (const i of ideas) {
      const w = i?.wallet || i?.author || i?.creator;
      if (i?.id != null && typeof w === "string") {
        map[`labs/${i.id}`] = w.toLowerCase();
        labs++;
      }
    }
  }

  await saveAuthorMap(map);
  return { fetched: forum + labs, forum, labs };
}

/* ─── Computation ──────────────────────────────────────────────────── */

const postKey = (source: string, id: string) => `${source}/${id}`;

/**
 * Compute reception from existing alignment data plus the author map.
 * No LLM calls, no refetching — this is a join over data already classified.
 */
export function computeReception(
  alignment: AlignmentResult,
  authors: AuthorMap
): ReceptionReport {
  /* ── Per-author aggregate outcomes ── */

  const byAuthor = new Map<string, Record<Stance, number>>();
  let withAuthor = 0;

  for (const p of alignment.posts) {
    const author = authors[postKey(p.source, p.id)];
    if (!author) continue;
    withAuthor++;
    if (!byAuthor.has(author)) {
      byAuthor.set(author, { approve: 0, conditional: 0, disapprove: 0, neutral: 0 });
    }
    byAuthor.get(author)![p.aggregatedStance]++;
  }

  const authorList: AuthorReception[] = [...byAuthor.entries()].map(
    ([wallet, outcomes]) => {
      const total =
        outcomes.approve + outcomes.conditional + outcomes.disapprove + outcomes.neutral;
      return {
        wallet,
        posts: total,
        outcomes,
        approvalRate: total > 0 ? Math.round((outcomes.approve / total) * 1000) / 1000 : 0,
        nonNegativeRate:
          total > 0
            ? Math.round(((total - outcomes.disapprove) / total) * 1000) / 1000
            : 0,
        insufficientData: total < MIN_POSTS_FOR_AUTHOR,
      };
    }
  );

  const qualifying = authorList.filter((a) => !a.insufficientData);
  const meanApprovalRate =
    qualifying.length > 0
      ? Math.round(
          (qualifying.reduce((s, a) => s + a.approvalRate, 0) / qualifying.length) * 1000
        ) / 1000
      : 0;

  /* ── Per-larva baselines ── */

  const larvaTotals = new Map<string, { approve: number; total: number }>();
  for (const s of alignment.stances) {
    if (!larvaTotals.has(s.wallet)) larvaTotals.set(s.wallet, { approve: 0, total: 0 });
    const t = larvaTotals.get(s.wallet)!;
    t.total++;
    if (s.stance === "approve") t.approve++;
  }

  /* ── Larva x author ── */

  const pairs = new Map<string, { approve: number; total: number }>();
  for (const s of alignment.stances) {
    const author = authors[postKey(s.source, s.postId)];
    if (!author) continue;
    // A larva responding to its own post isn't a relationship worth measuring.
    if (author === s.wallet) continue;
    const key = `${s.wallet}|${author}`;
    if (!pairs.has(key)) pairs.set(key, { approve: 0, total: 0 });
    const p = pairs.get(key)!;
    p.total++;
    if (s.stance === "approve") p.approve++;
  }

  const relations: LarvaAuthorRelation[] = [];
  for (const [key, counts] of pairs) {
    if (counts.total < MIN_POSTS_FOR_RELATION) continue;
    const [larva, author] = key.split("|");
    const base = larvaTotals.get(larva);
    if (!base || base.total === 0) continue;

    const approveRate = counts.approve / counts.total;
    const baseline = base.approve / base.total;
    const deviation = approveRate - baseline;

    // Only surface relationships that actually depart from the larva's own
    // habits. Without this, every larva that approves a lot would look like it
    // "favours" whoever posts most.
    if (Math.abs(deviation) < MIN_DEVIATION) continue;

    relations.push({
      larva,
      author,
      posts: counts.total,
      approveRate: Math.round(approveRate * 1000) / 1000,
      baselineApproveRate: Math.round(baseline * 1000) / 1000,
      deviation: Math.round(deviation * 1000) / 1000,
    });
  }

  relations.sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));

  return {
    authors: authorList.sort((a, b) => b.posts - a.posts),
    meanApprovalRate,
    relations,
    postsWithKnownAuthor: withAuthor,
    postsTotal: alignment.posts.length,
  };
}
