// lib/alignment.ts
//
// Alignment matrix + credibility scoring for larvana.
// Fetches all forum + labs posts with their aggregated_opinion and individual
// larva responses, classifies each response into a stance, then computes:
//   - pairwise agreement rates between all larvae
//   - per-larva "win rate" (how often their stance matches the aggregate)
//   - faction clusters (groups that vote together >70% of the time)
//
// Uses the same chunked-resumable build pattern as the profile and election builds.
// Imports redis + haiku from lib/larvae.ts — everything else is self-contained.

import { redis, haiku, parseJsonLoose } from "@/lib/larvae";

// ─── Types ─────────────────────────────────────────────────────────

export type Stance = "approve" | "conditional" | "disapprove" | "neutral";

/** One larva's classified stance on one post. */
export type StanceRecord = {
  wallet: string;
  postId: string;
  source: "forum" | "labs";
  stance: Stance;
};

/** Metadata for a post, including the aggregate's classified stance. */
export type PostMeta = {
  id: string;
  source: "forum" | "labs";
  title: string;
  aggregatedStance: Stance;
  respondentCount: number;
};

/** Pairwise agreement between two larvae across all shared posts. */
export type PairScore = {
  a: string;
  b: string;
  agreed: number;
  total: number;
  rate: number; // 0–1
};

/** Per-larva track record against the aggregate. */
export type CredibilityRecord = {
  wallet: string;
  posts: number;
  wins: number;
  winRate: number; // 0–1
  breakdown: Record<Stance, number>;
};

/** A cluster of larvae that vote together above the cohesion threshold. */
export type Faction = {
  id: number;
  members: string[];
  avgWinRate: number;
  cohesion: number; // avg pairwise agreement within faction
};

/** Full alignment result stored in Redis. */
export type AlignmentResult = {
  stances: StanceRecord[];
  posts: PostMeta[];
  pairs: PairScore[];
  credibility: CredibilityRecord[];
  factions: Faction[];
  computedAt: string;
};

// ─── Queue types (internal to the build process) ───────────────────

export type AlignmentQueueItem = {
  postId: string;
  source: "forum" | "labs";
  title: string;
  aggregatedOpinion: string;
  responses: { wallet: string; text: string }[];
};

export type ClassifiedPost = {
  postId: string;
  source: "forum" | "labs";
  title: string;
  aggregatedStance: Stance;
  stances: { wallet: string; stance: Stance }[];
};

// ─── Redis keys ────────────────────────────────────────────────────

const QUEUE_KEY = "lpp:align:queue";
const CLASSIFIED_KEY = "lpp:align:classified";
const RESULT_KEY = "lpp:align:result";

// ─── Redis ops ─────────────────────────────────────────────────────

export async function getAlignQueue(): Promise<AlignmentQueueItem[]> {
  const raw = await redis.get<string | AlignmentQueueItem[]>(QUEUE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function setAlignQueue(items: AlignmentQueueItem[]) {
  await redis.set(QUEUE_KEY, JSON.stringify(items));
}

export async function clearAlignQueue() {
  await redis.del(QUEUE_KEY);
}

export async function getClassified(): Promise<ClassifiedPost[]> {
  const raw = await redis.get<string | ClassifiedPost[]>(CLASSIFIED_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function appendClassified(post: ClassifiedPost) {
  const cur = await getClassified();
  cur.push(post);
  await redis.set(CLASSIFIED_KEY, JSON.stringify(cur));
}

export async function clearClassified() {
  await redis.del(CLASSIFIED_KEY);
}

export async function getAlignResult(): Promise<AlignmentResult | null> {
  const raw = await redis.get<string | AlignmentResult>(RESULT_KEY);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function saveAlignResult(result: AlignmentResult) {
  await redis.set(RESULT_KEY, JSON.stringify(result));
}

export async function clearAlignResult() {
  await redis.del(RESULT_KEY);
}

// ─── larv.ai fetchers (self-contained — doesn't touch lib/larvae.ts internals) ─

const BASE = "https://larv.ai/api";

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function extractResponses(detail: any): { wallet: string; text: string }[] {
  const arr = detail?.larvaResponses;
  if (!Array.isArray(arr)) return [];
  const out: { wallet: string; text: string }[] = [];
  for (const r of arr) {
    const wallet = r?.wallet || r?.address || r?.wallet_address || null;
    const text =
      r?.response || r?.content || r?.body || r?.text || r?.message || null;
    if (wallet && typeof text === "string" && text.trim().length > 0) {
      out.push({ wallet: String(wallet).toLowerCase(), text: text.trim() });
    }
  }
  return out;
}

async function fetchWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(new Array(Math.min(limit, items.length)).fill(0).map(worker));
  return results;
}

/**
 * Fetch all forum + labs posts and build a queue of posts to classify.
 * Each queue item has the post's responses and aggregated opinion.
 * Returns the number of posts queued.
 */
export async function collectPostsIntoQueue(): Promise<number> {
  const queue: AlignmentQueueItem[] = [];

  // Forum posts
  const posts = await getJson(`${BASE}/forum`);
  if (Array.isArray(posts)) {
    const details = await fetchWithConcurrency(posts, 8, (p: any) =>
      p?.id != null ? getJson(`${BASE}/forum/${p.id}`) : Promise.resolve(null)
    );
    for (const detail of details) {
      if (!detail) continue;
      const responses = extractResponses(detail);
      if (responses.length < 3) continue; // skip posts with too few responses to matter
      queue.push({
        postId: String(detail.id ?? detail._id ?? ""),
        source: "forum",
        title: String(
          detail.title || detail.subject || detail.question || ""
        ).slice(0, 200),
        aggregatedOpinion: String(
          detail.aggregated_opinion || detail.aggregatedOpinion || ""
        ).slice(0, 1500),
        responses,
      });
    }
  }

  // Labs ideas
  const ideas = await getJson(`${BASE}/labs`);
  if (Array.isArray(ideas)) {
    const details = await fetchWithConcurrency(ideas, 8, (i: any) =>
      i?.id != null ? getJson(`${BASE}/labs/${i.id}`) : Promise.resolve(null)
    );
    for (const detail of details) {
      if (!detail) continue;
      const responses = extractResponses(detail);
      if (responses.length < 3) continue;
      queue.push({
        postId: String(detail.id ?? detail._id ?? ""),
        source: "labs",
        title: String(
          detail.title || detail.name || detail.idea || ""
        ).slice(0, 200),
        aggregatedOpinion: String(
          detail.aggregated_opinion || detail.aggregatedOpinion || ""
        ).slice(0, 1500),
        responses,
      });
    }
  }

  await setAlignQueue(queue);
  return queue.length;
}

// ─── Stance classification ─────────────────────────────────────────

const VALID_STANCES: Stance[] = ["approve", "conditional", "disapprove", "neutral"];

function isValidStance(s: unknown): s is Stance {
  return typeof s === "string" && VALID_STANCES.includes(s as Stance);
}

const CLASSIFY_SYSTEM = `You classify governance agent responses into stances on a proposal or topic.

For each response, classify as exactly one of:
- approve — clearly supports the proposal/idea
- conditional — supports with reservations, caveats, or conditions
- disapprove — opposes or rejects the proposal/idea
- neutral — doesn't take a clear position, off-topic, or purely procedural

Classify based on the actual position taken, regardless of language (responses may be in any language). If ambiguous, lean toward "conditional" over "approve" or "neutral" over "disapprove".

Respond with ONLY a JSON array, no markdown, no preamble:
[{"wallet":"0x...","stance":"approve"}, ...]`;

const CLASSIFY_AGGREGATE_SYSTEM = `You classify the overall stance of an aggregated consensus opinion on a governance proposal.

Classify as exactly one of: approve, conditional, disapprove, neutral.
Most aggregated opinions synthesize multiple views, so "conditional" is common and correct.

Respond with ONLY the stance word, nothing else.`;

/**
 * Classify a batch of responses for one post into stances.
 * Batches at 25 responses per Haiku call to stay within token limits.
 */
export async function classifyPost(
  item: AlignmentQueueItem
): Promise<ClassifiedPost> {
  // 1. Classify the aggregated opinion
  let aggregatedStance: Stance = "neutral";
  if (item.aggregatedOpinion.length > 10) {
    try {
      const raw = await haiku(
        CLASSIFY_AGGREGATE_SYSTEM,
        `Post: "${item.title}"\n\nAggregated opinion:\n${item.aggregatedOpinion}`,
        20
      );
      const cleaned = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
      if (isValidStance(cleaned)) aggregatedStance = cleaned;
    } catch {
      // default stays neutral
    }
  }

  // 2. Classify individual responses in batches of 25
  const allStances: { wallet: string; stance: Stance }[] = [];
  const BATCH_SIZE = 25;

  for (let i = 0; i < item.responses.length; i += BATCH_SIZE) {
    const batch = item.responses.slice(i, i + BATCH_SIZE);
    const numbered = batch
      .map(
        (r, idx) =>
          `${idx + 1}. [${r.wallet.slice(0, 8)}]: "${r.text.slice(0, 300)}"`
      )
      .join("\n");

    try {
      const raw = await haiku(
        CLASSIFY_SYSTEM,
        `Post: "${item.title}"\n\nResponses:\n${numbered}`,
        batch.length * 50
      );
      const parsed = parseJsonArray(raw);

      // Match parsed results back to the batch by position or wallet
      for (let j = 0; j < batch.length; j++) {
        const match = parsed[j];
        const stance = match && isValidStance(match.stance) ? match.stance : "neutral";
        allStances.push({ wallet: batch[j].wallet, stance });
      }
    } catch {
      // If classification fails for this batch, default all to neutral
      for (const r of batch) {
        allStances.push({ wallet: r.wallet, stance: "neutral" });
      }
    }
  }

  return {
    postId: item.postId,
    source: item.source,
    title: item.title,
    aggregatedStance,
    stances: allStances,
  };
}

/** Parse a JSON array from LLM output, tolerant of markdown fences. */
function parseJsonArray(text: string): any[] {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(clean.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// ─── Computation ───────────────────────────────────────────────────

/**
 * Build the full alignment result from classified posts.
 * Called once when the classification queue is empty.
 */
export function computeAlignment(classified: ClassifiedPost[]): AlignmentResult {
  // Flatten all stance records
  const stances: StanceRecord[] = [];
  const posts: PostMeta[] = [];

  for (const cp of classified) {
    posts.push({
      id: cp.postId,
      source: cp.source,
      title: cp.title,
      aggregatedStance: cp.aggregatedStance,
      respondentCount: cp.stances.length,
    });
    for (const s of cp.stances) {
      stances.push({
        wallet: s.wallet,
        postId: cp.postId,
        source: cp.source,
        stance: s.stance,
      });
    }
  }

  // Index: wallet → postId → stance
  const walletStances = new Map<string, Map<string, Stance>>();
  for (const s of stances) {
    if (!walletStances.has(s.wallet)) walletStances.set(s.wallet, new Map());
    walletStances.get(s.wallet)!.set(s.postId, s.stance);
  }

  const wallets = [...walletStances.keys()];

  // ── Pairwise agreement matrix ──
  const pairs: PairScore[] = [];
  for (let i = 0; i < wallets.length; i++) {
    const aMap = walletStances.get(wallets[i])!;
    for (let j = i + 1; j < wallets.length; j++) {
      const bMap = walletStances.get(wallets[j])!;
      let agreed = 0;
      let total = 0;
      for (const [postId, aStance] of aMap) {
        const bStance = bMap.get(postId);
        if (bStance !== undefined) {
          total++;
          if (aStance === bStance) agreed++;
        }
      }
      if (total >= 3) {
        // Only include pairs with enough shared posts to be meaningful
        pairs.push({
          a: wallets[i],
          b: wallets[j],
          agreed,
          total,
          rate: Math.round((agreed / total) * 1000) / 1000,
        });
      }
    }
  }

  // ── Credibility (win rate vs aggregate) ──
  const postAggStance = new Map<string, Stance>();
  for (const p of posts) postAggStance.set(p.id, p.aggregatedStance);

  const credibility: CredibilityRecord[] = wallets.map((wallet) => {
    const wMap = walletStances.get(wallet)!;
    let wins = 0;
    const breakdown: Record<Stance, number> = {
      approve: 0,
      conditional: 0,
      disapprove: 0,
      neutral: 0,
    };
    for (const [postId, stance] of wMap) {
      breakdown[stance]++;
      const aggStance = postAggStance.get(postId);
      if (aggStance === stance) wins++;
    }
    const posts = wMap.size;
    return {
      wallet,
      posts,
      wins,
      winRate: posts > 0 ? Math.round((wins / posts) * 1000) / 1000 : 0,
      breakdown,
    };
  });

  // ── Faction detection (connected components at >70% agreement) ──
  const FACTION_THRESHOLD = 0.7;
  const MIN_OVERLAP = 5; // need at least 5 shared posts to consider a pair

  // Build adjacency list
  const adj = new Map<string, Set<string>>();
  for (const w of wallets) adj.set(w, new Set());
  for (const p of pairs) {
    if (p.rate >= FACTION_THRESHOLD && p.total >= MIN_OVERLAP) {
      adj.get(p.a)!.add(p.b);
      adj.get(p.b)!.add(p.a);
    }
  }

  // BFS to find connected components
  const visited = new Set<string>();
  const factions: Faction[] = [];
  let factionId = 0;

  for (const wallet of wallets) {
    if (visited.has(wallet)) continue;
    const neighbors = adj.get(wallet)!;
    if (neighbors.size === 0) continue; // solo wallets aren't factions

    const component: string[] = [];
    const queue = [wallet];
    while (queue.length > 0) {
      const w = queue.shift()!;
      if (visited.has(w)) continue;
      visited.add(w);
      component.push(w);
      for (const n of adj.get(w)!) {
        if (!visited.has(n)) queue.push(n);
      }
    }

    if (component.length < 2) continue; // need at least 2 to be a faction

    // Compute faction-level metrics
    const memberCred = component.map(
      (w) => credibility.find((c) => c.wallet === w)!
    );
    const avgWinRate =
      memberCred.reduce((sum, c) => sum + c.winRate, 0) / memberCred.length;

    // Avg pairwise agreement within faction
    let cohesionSum = 0;
    let cohesionCount = 0;
    for (let i = 0; i < component.length; i++) {
      for (let j = i + 1; j < component.length; j++) {
        const pair = pairs.find(
          (p) =>
            (p.a === component[i] && p.b === component[j]) ||
            (p.a === component[j] && p.b === component[i])
        );
        if (pair) {
          cohesionSum += pair.rate;
          cohesionCount++;
        }
      }
    }
    const cohesion =
      cohesionCount > 0
        ? Math.round((cohesionSum / cohesionCount) * 1000) / 1000
        : 0;

    factions.push({
      id: factionId++,
      members: component,
      avgWinRate: Math.round(avgWinRate * 1000) / 1000,
      cohesion,
    });
  }

  // Sort factions by size descending, then by win rate
  factions.sort(
    (a, b) => b.members.length - a.members.length || b.avgWinRate - a.avgWinRate
  );

  return {
    stances,
    posts,
    pairs,
    credibility: credibility.sort((a, b) => b.winRate - a.winRate),
    factions,
    computedAt: new Date().toISOString(),
  };
}
