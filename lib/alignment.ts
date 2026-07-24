//
// Alignment matrix + credibility scoring for larvana.
// Fetches all forum + labs posts with their aggregated_opinion and individual
// larva responses, classifies each response into a stance, then computes:
//   - pairwise agreement rates between all larvae
//   - per-larva "win rate" (how often their stance matches the aggregate)
//   - faction clusters (groups that vote together >70% of the time)
//
// RESUMABLE AT THE BATCH LEVEL. Posts here can have 150+ responses, which is
// more sequential Haiku calls than fit in one Vercel invocation. So a post
// carries its own progress (`cursor` + `partial`) and a run can stop mid-post,
// save, and pick up exactly where it left off on the next visit.
//
// Imports only redis + haiku from lib/larvae.ts — nothing existing is modified.

import { redis, haiku } from "@/lib/larvae";

// ─── Types ─────────────────────────────────────────────────────────

export type Stance = "approve" | "conditional" | "disapprove" | "neutral";

/** One larva's classified stance on one post. */
export type StanceRecord = {
  wallet: string;
  postId: string;
  source: "forum" | "labs";
  stance: Stance;
};

/**
 * A stance that may not have been determined.
 *
 * null means classification FAILED, not that the larva had no position.
 * Recording failures as "neutral" is what caused whole posts of clear
 * approvals to be counted as fence-sitting.
 */
export type MaybeStance = Stance | null;

/** Metadata for a post, including the aggregate's classified stance. */
export type PostMeta = {
  id: string;
  source: "forum" | "labs";
  title: string;
  /** null when the aggregate could not be classified. */
  aggregatedStance: MaybeStance;
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
  /**
   * How much data was unusable. Surfaced so a silent classification failure
   * shows up as a number rather than as quietly wrong results.
   */
  quality?: {
    droppedStances: number;
    postsWithoutAggregate: number;
    totalPosts: number;
  };
};

// ─── Queue types ───────────────────────────────────────────────────

/**
 * A post waiting to be classified.
 *
 * `cursor` and `partial` carry mid-post progress: cursor is the index of the
 * next response to classify, partial holds the stances resolved so far. A post
 * with cursor > 0 was interrupted and resumes rather than restarting.
 */
export type AlignmentQueueItem = {
  postId: string;
  source: "forum" | "labs";
  title: string;
  aggregatedOpinion: string;
  responses: { wallet: string; text: string }[];
  cursor: number;
  partial: { wallet: string; stance: MaybeStance }[];
  aggregatedStance: MaybeStance;
};

export type ClassifiedPost = {
  postId: string;
  source: "forum" | "labs";
  title: string;
  aggregatedStance: MaybeStance;
  stances: { wallet: string; stance: MaybeStance }[];
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

// ─── larv.ai fetchers ──────────────────────────────────────────────

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
      // Trim at collection time — full response bodies blow up the Redis payload
      // and only the first couple of sentences carry the stance anyway.
      out.push({
        wallet: String(wallet).toLowerCase(),
        text: text.trim().slice(0, 400),
      });
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

/** Safely extract a string title from a field that might be an object. */
function safeTitle(val: unknown): string {
  if (typeof val === "string") return val.slice(0, 200);
  if (val && typeof val === "object") {
    // Labs titles can be objects — try common string subfields
    const obj = val as Record<string, unknown>;
    const str = obj.en || obj.text || obj.title || obj.name || obj.idea || "";
    if (typeof str === "string") return str.slice(0, 200);
    // Last resort: first string value in the object
    for (const v of Object.values(obj)) {
      if (typeof v === "string" && v.length > 5) return v.slice(0, 200);
    }
  }
  return "";
}

/**
 * Fetch all forum + labs posts and build the classification queue.
 * No LLM calls here — this is the fast phase.
 *
 * Metadata (id, title, aggregated_opinion) comes from the LIST response.
 * Detail is only used for larvaResponses.
 */
export async function collectPostsIntoQueue(): Promise<number> {
  const queue: AlignmentQueueItem[] = [];

  // Forum posts
  const posts = await getJson(`${BASE}/forum`);
  if (Array.isArray(posts)) {
    const details = await fetchWithConcurrency(posts, 8, (p: any) =>
      p?.id != null ? getJson(`${BASE}/forum/${p.id}`) : Promise.resolve(null)
    );
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i]; // LIST item — has id, title, aggregated_opinion_short
      const detail = details[i]; // DETAIL — only used for larvaResponses
      if (!detail) continue;
      const responses = extractResponses(detail);
      if (responses.length < 3) continue;
      queue.push({
        postId: String(p.id ?? ""),
        source: "forum",
        title: safeTitle(p.title) || safeTitle(p.subject) || safeTitle(p.question) || "",
        aggregatedOpinion: String(
          p.aggregated_opinion_short || p.aggregated_opinion || ""
        ).slice(0, 1200),
        responses,
        cursor: 0,
        partial: [],
        aggregatedStance: null,
      });
    }
  }

  // Labs ideas
  const ideas = await getJson(`${BASE}/labs`);
  if (Array.isArray(ideas)) {
    const details = await fetchWithConcurrency(ideas, 8, (idea: any) =>
      idea?.id != null ? getJson(`${BASE}/labs/${idea.id}`) : Promise.resolve(null)
    );
    for (let i = 0; i < ideas.length; i++) {
      const idea = ideas[i]; // LIST item
      const detail = details[i]; // DETAIL — only used for larvaResponses
      if (!detail) continue;
      const responses = extractResponses(detail);
      if (responses.length < 3) continue;
      queue.push({
        postId: String(idea.id ?? ""),
        source: "labs",
        title: safeTitle(idea.title) || safeTitle(idea.name) || safeTitle(idea.idea) || "",
        aggregatedOpinion: String(
          idea.aggregated_opinion_short || idea.aggregated_opinion || ""
        ).slice(0, 1200),
        responses,
        cursor: 0,
        partial: [],
        aggregatedStance: null,
      });
    }
  }

  // Smallest posts first so early visits clear many and progress is visible
  queue.sort((a, b) => a.responses.length - b.responses.length);

  await setAlignQueue(queue);
  return queue.length;
}

// ─── Stance classification ─────────────────────────────────────────

const VALID_STANCES: Stance[] = ["approve", "conditional", "disapprove", "neutral"];

function isValidStance(s: unknown): s is Stance {
  return typeof s === "string" && VALID_STANCES.includes(s as Stance);
}

const CLASSIFY_SYSTEM = `You classify governance agent responses into stances on a proposal or topic.

For each numbered response, classify as exactly one of:
- approve — clearly supports the proposal/idea
- conditional — supports with reservations, caveats, or conditions
- disapprove — opposes or rejects the proposal/idea
- neutral — no clear position, off-topic, or purely procedural

Classify on the position actually taken, in any language. If ambiguous, prefer "conditional" over "approve", and "neutral" over "disapprove".

Return one entry per response, in the same order, same count.

Respond with ONLY a JSON array of stance strings, no markdown, no preamble:
["approve","conditional","neutral", ...]`;

const CLASSIFY_AGGREGATE_SYSTEM = `You classify the overall stance of an aggregated consensus opinion on a governance proposal.

Classify as exactly one of: approve, conditional, disapprove, neutral.
Aggregated opinions synthesize multiple views, so "conditional" is common and correct.

Respond with ONLY the stance word, nothing else.`;

const BATCH_SIZE = 20;

/**
 * Parse a JSON array of stance strings, tolerant of markdown fences.
 *
 * Returns null on ANY failure — malformed JSON, wrong shape, or an
 * unrecognized stance token. The caller must be able to distinguish "the model
 * answered" from "the model did not", because the previous behaviour of
 * returning a partial array and letting the caller pad with "neutral" silently
 * converted entire batches of clear positions into fabricated fence-sitting.
 */
function parseStanceArray(text: string): Stance[] | null {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1) return null;
  try {
    const arr = JSON.parse(clean.slice(start, end + 1));
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const out: Stance[] = [];
    for (const raw of arr) {
      const v = String(raw).toLowerCase().replace(/[^a-z]/g, "");
      if (!isValidStance(v)) return null;
      out.push(v);
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Classify the aggregated opinion for a post.
 *
 * The token budget here was 20, which is below what Gemini needs — it counts
 * its own overhead against maxOutputTokens and returns empty text when the
 * ceiling is that tight. Every aggregate was therefore failing and defaulting
 * to "neutral", which is why essentially no post ever registered as
 * "approve" and why win rates computed against these aggregates were
 * meaningless.
 *
 * Returns null when classification genuinely fails, so the caller can tell an
 * unclassified post from a neutral one.
 */
export async function classifyAggregate(
  item: AlignmentQueueItem
): Promise<MaybeStance> {
  if (item.aggregatedOpinion.length <= 10) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await haiku(
        CLASSIFY_AGGREGATE_SYSTEM,
        `Post: "${item.title}"\n\nAggregated opinion:\n${item.aggregatedOpinion}`,
        200
      );
      const cleaned = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
      if (isValidStance(cleaned)) return cleaned;
      // Sometimes the word arrives inside a sentence despite the instruction.
      for (const v of VALID_STANCES) {
        if (new RegExp(`\\b${v}\\b`, "i").test(raw)) return v;
      }
    } catch {
      // retry
    }
  }
  return null;
}

/**
 * Classify ONE batch of responses starting at `cursor`.
 * Returns the stances for that batch only — the caller advances the cursor.
 */
export async function classifyBatch(
  item: AlignmentQueueItem,
  cursor: number
): Promise<{ wallet: string; stance: MaybeStance }[]> {
  const batch = item.responses.slice(cursor, cursor + BATCH_SIZE);
  if (batch.length === 0) return [];

  const numbered = batch
    .map((r, idx) => `${idx + 1}. ${r.text.slice(0, 280)}`)
    .join("\n");

  // Real headroom. The old budget (batch.length * 12 + 60) gave 300 tokens for
  // 20 responses, and Gemini counts overhead against that, so arrays were
  // being truncated mid-output and rejected by the parser.
  const budget = batch.length * 25 + 200;
  const user = `Post: "${item.title}"\n\nResponses:\n${numbered}`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await haiku(CLASSIFY_SYSTEM, user, budget);
      const stances = parseStanceArray(raw);
      // Count must match exactly — a short array means stance[i] would be
      // assigned to the wrong larva.
      if (stances && stances.length === batch.length) {
        return batch.map((r, i) => ({ wallet: r.wallet, stance: stances[i] }));
      }
    } catch {
      // retry
    }
  }

  return batch.map((r) => ({ wallet: r.wallet, stance: null }));
}

/** How many batches a post still needs. Used for progress reporting. */
export function batchesRemaining(item: AlignmentQueueItem): number {
  return Math.ceil(Math.max(0, item.responses.length - item.cursor) / BATCH_SIZE);
}

// ─── Computation ───────────────────────────────────────────────────

/** Build the full alignment result from classified posts. */
export function computeAlignment(classified: ClassifiedPost[]): AlignmentResult {
  const stances: StanceRecord[] = [];
  const posts: PostMeta[] = [];

  // Unclassified records are DROPPED, not counted.
  //
  // A response whose classification failed carries no information about that
  // larva's position. Including it as "neutral" — which is what happened
  // before — invented a stance the larva never took, and did so systematically
  // enough to flatten every downstream measure built on this data.
  let droppedStances = 0;
  let postsWithoutAggregate = 0;

  for (const cp of classified) {
    if (cp.aggregatedStance === null) postsWithoutAggregate++;

    const usable = cp.stances.filter((s) => s.stance !== null);
    droppedStances += cp.stances.length - usable.length;

    posts.push({
      id: cp.postId,
      source: cp.source,
      title: cp.title,
      aggregatedStance: cp.aggregatedStance,
      respondentCount: usable.length,
    });

    for (const s of usable) {
      stances.push({
        wallet: s.wallet,
        postId: cp.postId,
        source: cp.source,
        stance: s.stance as Stance,
      });
    }
  }

  // Post keys are namespaced by source — forum/12 and labs/12 are different posts.
  const postKey = (source: string, id: string) => `${source}/${id}`;

  // wallet → postKey → stance
  const walletStances = new Map<string, Map<string, Stance>>();
  for (const s of stances) {
    if (!walletStances.has(s.wallet)) walletStances.set(s.wallet, new Map());
    walletStances.get(s.wallet)!.set(postKey(s.source, s.postId), s.stance);
  }

  const wallets = [...walletStances.keys()];

  // ── Pairwise agreement ──
  const pairs: PairScore[] = [];
  for (let i = 0; i < wallets.length; i++) {
    const aMap = walletStances.get(wallets[i])!;
    for (let j = i + 1; j < wallets.length; j++) {
      const bMap = walletStances.get(wallets[j])!;
      let agreed = 0;
      let total = 0;
      // Iterate the smaller map — with 100+ wallets this matters.
      const [small, large] = aMap.size <= bMap.size ? [aMap, bMap] : [bMap, aMap];
      for (const [key, stance] of small) {
        const other = large.get(key);
        if (other !== undefined) {
          total++;
          if (stance === other) agreed++;
        }
      }
      if (total >= 3) {
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

  // ── Credibility ──
  // Only posts with a successfully classified aggregate can score a win.
  // Posts without one are excluded from the denominator entirely — scoring a
  // larva against an aggregate we never determined would be scoring it against
  // nothing.
  const aggByPost = new Map<string, Stance>();
  for (const p of posts) {
    if (p.aggregatedStance !== null) {
      aggByPost.set(postKey(p.source, p.id), p.aggregatedStance);
    }
  }

  const credibility: CredibilityRecord[] = wallets.map((wallet) => {
    const wMap = walletStances.get(wallet)!;
    let wins = 0;
    const breakdown: Record<Stance, number> = {
      approve: 0,
      conditional: 0,
      disapprove: 0,
      neutral: 0,
    };
    let scorable = 0;
    for (const [key, stance] of wMap) {
      breakdown[stance]++;
      const agg = aggByPost.get(key);
      if (agg === undefined) continue; // no aggregate — cannot be right or wrong
      scorable++;
      if (agg === stance) wins++;
    }
    const postCount = scorable;
    return {
      wallet,
      posts: postCount,
      wins,
      winRate: postCount > 0 ? Math.round((wins / postCount) * 1000) / 1000 : 0,
      breakdown,
    };
  });

  // ── Factions ──
  const FACTION_THRESHOLD = 0.7;
  const MIN_OVERLAP = 5;

  const pairIndex = new Map<string, PairScore>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const p of pairs) pairIndex.set(pairKey(p.a, p.b), p);

  const adj = new Map<string, Set<string>>();
  for (const w of wallets) adj.set(w, new Set());
  for (const p of pairs) {
    if (p.rate >= FACTION_THRESHOLD && p.total >= MIN_OVERLAP) {
      adj.get(p.a)!.add(p.b);
      adj.get(p.b)!.add(p.a);
    }
  }

  const credByWallet = new Map(credibility.map((c) => [c.wallet, c]));
  const visited = new Set<string>();
  const factions: Faction[] = [];
  let factionId = 0;

  for (const wallet of wallets) {
    if (visited.has(wallet)) continue;
    if (adj.get(wallet)!.size === 0) continue;

    const component: string[] = [];
    const queue = [wallet];
    while (queue.length > 0) {
      const w = queue.shift()!;
      if (visited.has(w)) continue;
      visited.add(w);
      component.push(w);
      for (const n of adj.get(w)!) if (!visited.has(n)) queue.push(n);
    }

    if (component.length < 2) continue;

    const avgWinRate =
      component.reduce((sum, w) => sum + (credByWallet.get(w)?.winRate ?? 0), 0) /
      component.length;

    let cohesionSum = 0;
    let cohesionCount = 0;
    for (let i = 0; i < component.length; i++) {
      for (let j = i + 1; j < component.length; j++) {
        const pair = pairIndex.get(pairKey(component[i], component[j]));
        if (pair) {
          cohesionSum += pair.rate;
          cohesionCount++;
        }
      }
    }

    factions.push({
      id: factionId++,
      members: component,
      avgWinRate: Math.round(avgWinRate * 1000) / 1000,
      cohesion:
        cohesionCount > 0
          ? Math.round((cohesionSum / cohesionCount) * 1000) / 1000
          : 0,
    });
  }

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
    quality: {
      droppedStances,
      postsWithoutAggregate,
      totalPosts: posts.length,
    },
  };
}
````

## File: lib/avatar.ts
