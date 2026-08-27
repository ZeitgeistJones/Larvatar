// lib/build-intent.ts
//
// Forum build-intent radar — precise multi-axis scoring of each larv.ai forum
// post for whether it pushes toward an actual build or structural change.
//
// Design goals (v2):
 // - Stop score clustering at 80–95 (previous pass was too generous / generic).
// - Force the model to score four independent axes, then we compute the rollup.
// - Require concrete evidence nouns from the post (not "the thread proposes…").
// - Score Austin separately against his known governance-infrastructure lens.
// - Filter general Q&A / vibe checks / check-ins from the default notable view.

import { parseJsonLoose, redis } from "@/lib/larvae";

const BASE = "https://larv.ai/api";
const QUEUE_KEY = "lpp:build-intent:queue";
const PARTIAL_KEY = "lpp:build-intent:partial";
const RESULT_KEY = "lpp:build-intent:result";

/** Prefer a stronger model for this scoring path; override with GEMINI_BUILD_INTENT_MODEL. */
const SCORE_MODELS = [
  process.env.GEMINI_BUILD_INTENT_MODEL,
  "gemini-3.1-pro",
  process.env.GEMINI_MODEL,
  "gemini-3.6-flash",
].filter((m, i, a): m is string => Boolean(m) && a.indexOf(m) === i);

let activeScoreModel = SCORE_MODELS[0];

export const AUSTIN_WALLET = (
  process.env.AUSTIN_LARVA_WALLET || "0xedef7cdfbf6bbffa01edd9eb98c3d9cff83aab39"
).toLowerCase();

/** Stricter bar than v1 (was 40) — only clear build/structure push. */
export const NOTABLE_THRESHOLD = 55;

export type PostCategory =
  | "proposal"
  | "rfc"
  | "build_ask"
  | "governance_change"
  | "discussion"
  | "check_in"
  | "meta"
  | "support"
  | "other";

export type ScoreAxes = {
  /** How concrete / named / scoped is the thing being asked for? */
  specificity: number;
  /** How close is this to something someone could start building this week? */
  actionability: number;
  /** How much does this change protocol / governance / system architecture? */
  structuralDepth: number;
  /** How hard is the swarm pushing for this to actually happen? */
  swarmUrgency: number;
};

export type BuildIntentPost = {
  postId: string;
  title: string;
  bodySnippet: string;
  respondentCount: number;
  category: PostCategory;
  axes: ScoreAxes;
  communityBuildIntent: number;
  isGeneralQuestion: boolean;
  notable: boolean;
  rationale: string;
  evidence: string[];
  austinBuildIntent: number | null;
  austinAxes: ScoreAxes | null;
  austinResponded: boolean;
  austinSnippet: string | null;
  austinNote: string | null;
  link: string;
};

export type BuildIntentResult = {
  posts: BuildIntentPost[];
  computedAt: string;
  austinWallet: string;
  model: string;
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

const CATEGORIES: PostCategory[] = [
  "proposal",
  "rfc",
  "build_ask",
  "governance_change",
  "discussion",
  "check_in",
  "meta",
  "support",
  "other",
];

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
        // Longer excerpts — stance-only snippets were starving the scorer of detail
        text: text.trim().slice(0, 700),
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

function parseAxes(raw: unknown): ScoreAxes {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    specificity: clampScore(o.specificity),
    actionability: clampScore(o.actionability),
    structuralDepth: clampScore(o.structuralDepth),
    swarmUrgency: clampScore(o.swarmUrgency),
  };
}

/**
 * Weighted rollup — specificity + actionability carry the most weight.
 * Structural depth matters, but a deep philosophical take with no build path
 * should not win. Swarm urgency is a smaller boost, not a substitute.
 */
function rollupAxes(axes: ScoreAxes): number {
  return clampScore(
    axes.specificity * 0.3 +
      axes.actionability * 0.3 +
      axes.structuralDepth * 0.25 +
      axes.swarmUrgency * 0.15
  );
}

/** Soft category ceilings so discussion/check-ins can't fake a 90. */
function applyCategoryCeiling(score: number, category: PostCategory): number {
  const ceilings: Partial<Record<PostCategory, number>> = {
    discussion: 58,
    check_in: 35,
    meta: 45,
    support: 40,
    other: 50,
  };
  const cap = ceilings[category];
  return cap != null ? Math.min(score, cap) : score;
}

function isNotable(
  community: number,
  isGeneralQuestion: boolean,
  category: PostCategory
): boolean {
  if (isGeneralQuestion) return false;
  if (category === "check_in" || category === "support" || category === "meta") return false;
  return community >= NOTABLE_THRESHOLD;
}

function parseCategory(raw: unknown): PostCategory {
  const s = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z_]/g, "");
  return CATEGORIES.includes(s as PostCategory) ? (s as PostCategory) : "other";
}

const SCORE_SYSTEM = `You are a harsh, precise analyst for the CLAWD / larv.ai forum.

Your job is NOT to be impressed. Most posts are discussion, vibes, or soft ideas.
Only a minority deserve high build-intent scores. Use the FULL 0–100 range.
Clustering scores in the 80–95 band is a FAILURE MODE — avoid it.

════════════════════════════════════════
WHAT “BUILD INTENT” MEANS
════════════════════════════════════════
A post has high build intent ONLY if it pushes toward one of:
• a concrete product / tool / service someone could ship
• a named protocol / governance / infrastructure change with a clear mechanism
• a scoped build ask with deliverables, constraints, or acceptance criteria

Low / zero build intent:
• general questions, “how do I…”, support
• vibe checks, personality quizzes, outlier tests, check-ins
• open-ended strategy talk with no artifact to build
• “we should think about X” without X being buildable
• marketing / branding / social-media ideas with no product surface
• retrospective chat about already-shipped work with no next build

════════════════════════════════════════
CATEGORY (pick exactly one)
════════════════════════════════════════
proposal          — concrete buildable thing with scope
rfc               — design doc / architecture for a specific change
build_ask         — explicit request that Labs / Clawd / a builder ship something
governance_change — protocol rule, CV, staking, veto, treasury, agent constraint
discussion        — debate / opinions; may mention builds but does not specify one
check_in          — recurring pulse / mood / “checking in”
meta              — process about the forum/larvae themselves
support           — help / troubleshooting / how-to
other             — does not fit

════════════════════════════════════════
FOUR AXES (score EACH 0–100 independently — do NOT copy the same number)
════════════════════════════════════════
specificity      — named artifact, mechanism, interfaces, constraints, success criteria
actionability    — could a competent builder start THIS WEEK from this post alone?
structuralDepth  — changes how the protocol / governance / agent stack works (not just UI gloss)
swarmUrgency     — larva responses demand shipping / funding / scoping NOW (not polite interest)

Calibration anchors (use these; do not invent softer ones):
  0–15  chat / vibe / question with no build path
 16–35  soft idea or wishlist; no mechanism
 36–55  interesting direction; still needs a real spec
 56–70  clear ask or RFC-shaped; some gaps remain
 71–85  sharp proposal: named deliverable + path + constraints
 86–100 rare. Build-ready: who / what / how / done-when almost fully specified
Reserve 86+ for posts a builder could implement without inventing the product.

════════════════════════════════════════
AUSTIN LARVA (wallet known to you as “Austin Exact”)
════════════════════════════════════════
Score ONLY from Austin’s own response text. If none provided → austinAxes null, austinBuildIntent null, austinNote null.

Austin’s lens (use this — he is not a generic larva):
• cares about governance infrastructure, explicit frameworks, burn/utility over extraction
• distrusts soft social engineering / hivemind vibes
• elevates structural backbone over “nice tools”
• will score HIGH when he pushes for concrete infrastructure, guardrails, or in-house execution
• will score LOW when he is hedging, philosophizing, or rejecting the ask

Score Austin on the SAME four axes, but from HIS text alone (swarmUrgency for Austin = how hard HE pushes).

════════════════════════════════════════
EVIDENCE + RATIONALE
════════════════════════════════════════
evidence: 2–4 short strings. Each MUST quote or name a concrete noun/phrase FROM THE POST OR RESPONSES (repo name, module, mechanism, hire, contract, KPI…). Forbidden: “the thread proposes…”, “community wants…”, “structural change…”
rationale: ≤28 words. Name the actual artifact or say why there isn’t one. No filler.

════════════════════════════════════════
OUTPUT — ONLY JSON, no markdown
════════════════════════════════════════
{
  "category": "proposal|rfc|build_ask|governance_change|discussion|check_in|meta|support|other",
  "isGeneralQuestion": boolean,
  "axes": {
    "specificity": 0-100,
    "actionability": 0-100,
    "structuralDepth": 0-100,
    "swarmUrgency": 0-100
  },
  "evidence": ["…", "…"],
  "rationale": "…",
  "austinAxes": {
    "specificity": 0-100,
    "actionability": 0-100,
    "structuralDepth": 0-100,
    "swarmUrgency": 0-100
  } | null,
  "austinNote": "≤20 words naming what Austin actually pushed for, or null"
}

Do NOT invent communityBuildIntent / austinBuildIntent — those are computed server-side from axes.
isGeneralQuestion=true when the post is primarily Q&A / chat / vibe with no credible build path (even if larvae talk about the protocol).`;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryMs(body: string): number {
  const m =
    body.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i) ||
    body.match(/Please retry in ([\d.]+)s/i);
  if (!m) return 25_000;
  return Math.min(60_000, Math.max(5_000, Math.ceil(parseFloat(m[1]) * 1000) + 500));
}

/** Dedicated Gemini call for scoring — stronger model first, low temp, roomy output. */
async function scoreGemini(system: string, user: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const baseBody = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
  };

  // Pro models may reject thinkingBudget:0 — try with then without.
  const configs = [
    {
      maxOutputTokens: 4096,
      temperature: 0.15,
      thinkingConfig: { thinkingBudget: 0 },
    },
    { maxOutputTokens: 4096, temperature: 0.15 },
  ];

  let lastErr = "";
  // Prefer the last model that worked in this process; otherwise walk the list.
  const models = [
    activeScoreModel,
    ...SCORE_MODELS.filter((m) => m !== activeScoreModel),
  ];

  for (const model of models) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
      `?key=${encodeURIComponent(key)}`;

    for (const generationConfig of configs) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...baseBody, generationConfig }),
          signal: AbortSignal.timeout(45_000),
        });
        if (res.status === 429) {
          const body = await res.text();
          lastErr = `gemini 429 (${model}): ${body.slice(0, 200)}`;
          await sleep(parseRetryMs(body));
          continue;
        }
        if (!res.ok) {
          lastErr = `gemini ${res.status} (${model}): ${(await res.text()).slice(0, 300)}`;
          // 404 / invalid model → try next model
          if (res.status === 404 || res.status === 400) break;
          break;
        }
        const data = await res.json();
        const text = (data.candidates || [])
          .flatMap((c: any) => c.content?.parts || [])
          .filter((p: any) => p?.text && !p.thought)
          .map((p: any) => p.text || "")
          .join("")
          .trim();
        if (!text) {
          lastErr = `gemini empty (${model}, ${data.candidates?.[0]?.finishReason || "unknown"})`;
          break;
        }
        activeScoreModel = model;
        return text;
      }
    }
  }
  throw new Error(lastErr || "gemini failed");
}

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
      body: String(p.body || p.content || "").slice(0, 4500),
      aggregatedOpinion: String(
        p.aggregated_opinion_short || p.aggregated_opinion || ""
      ).slice(0, 2000),
      responses,
      austinText: austin ? austin.text.slice(0, 1400) : null,
    });
  }

  // Longer / denser threads first so partial builds already show useful data
  queue.sort((a, b) => b.responses.length - a.responses.length || b.body.length - a.body.length);
  await saveBuildIntentQueue(queue);
  return queue.length;
}

/**
 * Spread sample across the response list so we don't only see the first few
 * (often the most agreeable / earliest) larvae.
 */
function responseSample(responses: { wallet: string; text: string }[], max = 14): string {
  if (responses.length === 0) return "(no larva responses yet)";
  if (responses.length <= max) {
    return responses.map((r, i) => `${i + 1}. ${r.text.slice(0, 320)}`).join("\n");
  }
  const picks: { wallet: string; text: string }[] = [];
  const seen = new Set<number>();
  const step = (responses.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * step);
    if (seen.has(idx)) continue;
    seen.add(idx);
    picks.push(responses[idx]);
  }
  return picks.map((r, i) => `${i + 1}. ${r.text.slice(0, 320)}`).join("\n");
}

function normalizeEvidence(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((e) => String(e || "").trim())
    .filter((e) => e.length > 2)
    .slice(0, 4)
    .map((e) => e.slice(0, 160));
}

/** Score one queued post. Returns scored row or null on failure. */
export async function scoreQueueItem(item: BuildIntentQueueItem): Promise<BuildIntentPost | null> {
  const user = [
    `Forum post #${item.postId}`,
    `Title: ${item.title}`,
    "",
    "══ ORIGINAL POST ══",
    item.body.slice(0, 4000) || "(no body)",
    "",
    `══ HIVE AGGREGATE (${item.responses.length} larva responses) ══`,
    item.aggregatedOpinion || "(none)",
    "",
    "══ SPREAD SAMPLE OF LARVA RESPONSES ══",
    responseSample(item.responses),
    "",
    item.austinText
      ? `══ AUSTIN EXACT — SCORE HIS TEXT ONLY ══\n${item.austinText}`
      : "══ AUSTIN EXACT DID NOT RESPOND — austinAxes and austinNote MUST be null ══",
    "",
    "Score harshly. Prefer lower scores when unsure. Return ONLY the JSON object.",
  ].join("\n");

  try {
    const raw = await scoreGemini(SCORE_SYSTEM, user);
    const obj = parseJsonLoose(raw);

    const category = parseCategory(obj.category);
    const axes = parseAxes(obj.axes);
    let community = applyCategoryCeiling(rollupAxes(axes), category);
    const isGeneralQuestion = Boolean(obj.isGeneralQuestion);

    // Belt-and-suspenders: general Q&A / check-ins can't stay high even if axes lie
    if (isGeneralQuestion) community = Math.min(community, 32);
    if (category === "check_in") community = Math.min(community, 28);

    let austinAxes: ScoreAxes | null = null;
    let austinBuildIntent: number | null = null;
    let austinNote: string | null = null;

    if (item.austinText && obj.austinAxes != null) {
      austinAxes = parseAxes(obj.austinAxes);
      austinBuildIntent = rollupAxes(austinAxes);
      austinNote = obj.austinNote ? String(obj.austinNote).slice(0, 160) : null;
    }

    return {
      postId: item.postId,
      title: item.title,
      bodySnippet: item.body.slice(0, 200),
      respondentCount: item.responses.length,
      category,
      axes,
      communityBuildIntent: community,
      isGeneralQuestion,
      notable: isNotable(community, isGeneralQuestion, category),
      rationale: String(obj.rationale || "").slice(0, 240),
      evidence: normalizeEvidence(obj.evidence),
      austinBuildIntent,
      austinAxes,
      austinResponded: Boolean(item.austinText),
      austinSnippet: item.austinText ? item.austinText.slice(0, 140) : null,
      austinNote,
      link: `https://larv.ai/forum/${item.postId}`,
    };
  } catch (e) {
    console.error("build-intent score failed", item.postId, String(e).slice(0, 300));
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
    model: activeScoreModel,
    meta: {
      totalForumPosts,
      scored: scored.length,
      notable: notable.length,
      filtered: filtered.length,
    },
  };
}
