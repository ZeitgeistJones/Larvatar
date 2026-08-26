// lib/build-intent.ts
//
// Forum build-intent radar — scores each larv.ai forum post for how much
// the thread pushes toward an actual build or structural/protocol change.
// General Q&A without a build path is flagged and filtered from the default view.
//
// Separate score for Austin larva (Austin Exact) when he responded.

import { haiku, parseJsonLoose, redis } from "@/lib/larvae";

const BASE = "https://larv.ai/api";
const QUEUE_KEY = "lpp:build-intent:queue";
const PARTIAL_KEY = "lpp:build-intent:partial";
const RESULT_KEY = "lpp:build-intent:result";

export const AUSTIN_WALLET = (
  process.env.AUSTIN_LARVA_WALLET || "0xedef7cdfbf6bbffa01edd9eb98c3d9cff83aab39"
).toLowerCase();

/** Minimum community score to count as notable (when not a general question). */
export const NOTABLE_THRESHOLD = 40;

export type BuildIntentPost = {
  postId: string;
  title: string;
  bodySnippet: string;
  respondentCount: number;
  communityBuildIntent: number;
  isGeneralQuestion: boolean;
  notable: boolean;
  rationale: string;
  austinBuildIntent: number | null;
  austinResponded: boolean;
  austinSnippet: string | null;
  link: string;
};

export type BuildIntentResult = {
  posts: BuildIntentPost[];
  computedAt: string;
  austinWallet: string;
  meta: {
    totalForumPosts: number;
    scored: number;
    notable: number;
    filtered: number;
  };
};

export type BuildIntentQueueItem = {
  postId: string;
  title: string;
  body: string;
  aggregatedOpinion: string;
  responses: { wallet: string; text: string }[];
  austinText: string | null;
};

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function safeTitle(val: unknown): string {
  if (typeof val === "string") return val.slice(0, 200);
  return "";
}

function extractResponses(detail: any): { wallet: string; text: string }[] {
  const arr = detail?.larvaResponses;
  if (!Array.isArray(arr)) return [];
  const out: { wallet: string; text: string }[] = [];
  for (const r of arr) {
    const wallet = r?.wallet || r?.address || r?.wallet_address || null;
    const text = r?.response || r?.content || r?.body || r?.text || r?.message || null;
    if (wallet && typeof text === "string" && text.trim().length > 0) {
      out.push({
        wallet: String(wallet).toLowerCase(),
        text: text.trim().slice(0, 400),
      });
    }
  }
  return out;
}

async function mapWithConcurrency<T, R>(
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

function clampScore(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function isNotable(community: number, isGeneralQuestion: boolean): boolean {
  return !isGeneralQuestion && community >= NOTABLE_THRESHOLD;
}

const SCORE_SYSTEM = `You score larv.ai forum posts for BUILD INTENT.

BUILD INTENT means the thread pushes toward:
- a concrete product or tool build
- a protocol, governance, or structural change
- a scoped Labs proposal with deliverables

NOT build intent:
- general questions without an implied build/change path
- support, troubleshooting, or "how do I…"
- vibe checks and social chat
- curiosity with no actionable direction

Read the original post, hive aggregate, and larva response themes.

Return ONLY JSON (no markdown):
{
  "communityBuildIntent": 0-100,
  "isGeneralQuestion": boolean,
  "rationale": "max 25 words",
  "austinBuildIntent": number or null
}

communityBuildIntent: how much the whole thread (post + swarm) pushes build/structural change.
isGeneralQuestion: true only when the post is primarily Q&A/chat with no credible build path.
austinBuildIntent: score ONLY Austin's own response text for build/structural-change push (0-100). null if no Austin text was provided.`;

export async function getBuildIntentQueue(): Promise<BuildIntentQueueItem[] | null> {
  const raw = await redis.get<string | BuildIntentQueueItem[]>(QUEUE_KEY);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function saveBuildIntentQueue(items: BuildIntentQueueItem[]) {
  await redis.set(QUEUE_KEY, JSON.stringify(items));
}

export async function clearBuildIntentQueue() {
  await redis.del(QUEUE_KEY);
}

export async function getBuildIntentPartial(): Promise<BuildIntentPost[]> {
  const raw = await redis.get<string | BuildIntentPost[]>(PARTIAL_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function saveBuildIntentPartial(posts: BuildIntentPost[]) {
  await redis.set(PARTIAL_KEY, JSON.stringify(posts));
}

export async function clearBuildIntentPartial() {
  await redis.del(PARTIAL_KEY);
}

export async function getBuildIntentResult(): Promise<BuildIntentResult | null> {
  const raw = await redis.get<string | BuildIntentResult>(RESULT_KEY);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function saveBuildIntentResult(result: BuildIntentResult) {
  await redis.set(RESULT_KEY, JSON.stringify(result));
}

export async function clearBuildIntentProgress() {
  await redis.del(QUEUE_KEY);
  await redis.del(PARTIAL_KEY);
}

export async function clearBuildIntent() {
  await clearBuildIntentProgress();
  await redis.del(RESULT_KEY);
}

/** Fetch forum posts + larva responses; no LLM. */
export async function collectForumIntoQueue(): Promise<number> {
  const posts = await getJson(`${BASE}/forum`);
  if (!Array.isArray(posts) || posts.length === 0) return 0;

  const details = await mapWithConcurrency(posts, 8, (p: any) =>
    p?.id != null ? getJson(`${BASE}/forum/${p.id}`) : Promise.resolve(null)
  );

  const queue: BuildIntentQueueItem[] = [];

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const detail = details[i];
    const postId = String(p?.id ?? "");
    if (!postId) continue;

    const responses = extractResponses(detail);
    const austin = responses.find((r) => r.wallet === AUSTIN_WALLET);

    queue.push({
      postId,
      title:
        safeTitle(p.title) ||
        safeTitle(p.subject) ||
        safeTitle(p.question) ||
        `Forum #${postId}`,
      body: String(p.body || p.content || "").slice(0, 2000),
      aggregatedOpinion: String(
        p.aggregated_opinion_short || p.aggregated_opinion || ""
      ).slice(0, 1200),
      responses,
      austinText: austin ? austin.text.slice(0, 800) : null,
    });
  }

  queue.sort((a, b) => a.responses.length - b.responses.length);
  await saveBuildIntentQueue(queue);
  return queue.length;
}

function responseSample(responses: { wallet: string; text: string }[], max = 8): string {
  const sample = responses.slice(0, max);
  if (sample.length === 0) return "(no larva responses yet)";
  return sample.map((r, i) => `${i + 1}. ${r.text.slice(0, 220)}`).join("\n");
}

/** Score one queued post. Returns scored row or null on failure. */
export async function scoreQueueItem(item: BuildIntentQueueItem): Promise<BuildIntentPost | null> {
  const user = [
    `Title: ${item.title}`,
    "",
    "Original post:",
    item.body.slice(0, 1500) || "(no body)",
    "",
    `Hive aggregate (${item.responses.length} larva responses):`,
    item.aggregatedOpinion || "(none)",
    "",
    "Sample larva responses:",
    responseSample(item.responses),
    "",
    item.austinText
      ? `Austin larva response (score this separately as austinBuildIntent):\n${item.austinText}`
      : "Austin larva did not respond on this post (austinBuildIntent must be null).",
  ].join("\n");

  try {
    const raw = await haiku(SCORE_SYSTEM, user, 400, 0.2);
    const obj = parseJsonLoose(raw);
    const community = clampScore(obj.communityBuildIntent);
    const isGeneralQuestion = Boolean(obj.isGeneralQuestion);
    const austinBuildIntent =
      item.austinText && obj.austinBuildIntent != null
        ? clampScore(obj.austinBuildIntent)
        : null;

    return {
      postId: item.postId,
      title: item.title,
      bodySnippet: item.body.slice(0, 160),
      respondentCount: item.responses.length,
      communityBuildIntent: community,
      isGeneralQuestion,
      notable: isNotable(community, isGeneralQuestion),
      rationale: String(obj.rationale || "").slice(0, 200),
      austinBuildIntent,
      austinResponded: Boolean(item.austinText),
      austinSnippet: item.austinText ? item.austinText.slice(0, 120) : null,
      link: `https://larv.ai/forum/${item.postId}`,
    };
  } catch {
    return null;
  }
}

export function buildIntentProgress(
  queue: BuildIntentQueueItem[],
  scored: BuildIntentPost[]
): { remaining: number; scored: number; total: number } {
  return {
    remaining: queue.length,
    scored: scored.length,
    total: queue.length + scored.length,
  };
}

export function finalizeBuildIntent(
  scored: BuildIntentPost[],
  totalForumPosts: number
): BuildIntentResult {
  const notable = scored.filter((p) => p.notable);
  const filtered = scored.filter((p) => !p.notable);

  scored.sort((a, b) => b.communityBuildIntent - a.communityBuildIntent);

  return {
    posts: scored,
    computedAt: new Date().toISOString(),
    austinWallet: AUSTIN_WALLET,
    meta: {
      totalForumPosts,
      scored: scored.length,
      notable: notable.length,
      filtered: filtered.length,
    },
  };
}
