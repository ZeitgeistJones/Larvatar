// lib/pulse.ts
//
// Topic Trends / overall pulse — sourced from the recurring "Checking in"
// forum posts (same prompt family), not governance votes.
//
// WHAT WE BUILD:
//
//   waves        — per check-in overall vibe (% upbeat / frustrated / mixed)
//   positive     — top themes people liked
//   negative     — top themes people complained about
//   mixed_themes — themes the swarm both liked and complained about
//
// Build is resumable (sentiment batches, then theme batches) so it fits
// Vercel time budgets.

import { redis, haiku } from "@/lib/larvae";

/* ─── Types ────────────────────────────────────────────────────────── */

export type PulseSentiment = "upbeat" | "frustrated" | "mixed" | "unclear";

export type PulseWave = {
  postId: string;
  title: string;
  createdAt: string;
  n: number;
  upbeat: number;
  frustrated: number;
  mixed: number;
  unclear: number;
  /** 0–1 share of classified (non-unclear) that are upbeat. */
  pctUpbeat: number;
  /** 0–1 share frustrated among classified. */
  pctFrustrated: number;
  /** 0–1 share mixed among classified. */
  pctMixed: number;
  aggregateShort: string;
  link: string;
  /** Top themes for this check-in only. */
  positive: PulseTheme[];
  negative: PulseTheme[];
  /** Themes this wave both liked and complained about. */
  mixed_themes: PulseTheme[];
  /** Every theme this wave surfaced, kept so later waves can show movement. */
  ledger: ThemeTally[];
};

/** How a theme moved versus the previous check-in. */
export type ThemeDelta = {
  /** Praise count in the prior wave, or null if the theme is brand new. */
  praisePrev: number | null;
  pushbackPrev: number | null;
  /** current - prev; null when there is no prior wave to compare. */
  praiseDelta: number | null;
  pushbackDelta: number | null;
};

export type PulseTheme = {
  id: string;
  label: string;
  /** Mention mass used for ranking. */
  n: number;
  /** How many liked this theme. */
  praise: number;
  /** How many complained about it. */
  pushback: number;
  metric: string;
  detail?: string;
  /** Movement vs the previous check-in wave. */
  delta?: ThemeDelta;
  /** Check-in post ids that surfaced this theme. */
  waves: string[];
};

/** Compact per-wave record of one theme; drives cross-wave deltas. */
export type ThemeTally = {
  id: string;
  label: string;
  praise: number;
  pushback: number;
};

export type PulseResult = {
  waves: PulseWave[];
  /** All-time boards across every check-in (fallback / overview). */
  positive: PulseTheme[];
  negative: PulseTheme[];
  mixed_themes: PulseTheme[];
  /** The shared check-in prompt, shown once at the top of the page. */
  prompt: string;
  meta: {
    builtAt: string;
    waveCount: number;
    totalResponses: number;
    caveat: string;
  };
};

type QueueResponse = { wallet: string; text: string };

type ThemeHit = {
  label: string;
  /** Replies in the batch that spoke well of this theme. */
  praise: number;
  /** Replies in the batch that complained about it. */
  pushback: number;
};

type WaveWork = {
  postId: string;
  title: string;
  createdAt: string;
  aggregateShort: string;
  /** Full post body — the shared "Checking in" prompt. */
  prompt: string;
  responses: QueueResponse[];
  /** Sentiment progress. */
  sentCursor: number;
  sentiments: PulseSentiment[];
  /** Theme extraction progress (independent cursor). */
  themeCursor: number;
  themeHits: ThemeHit[];
};

export type PulseQueue = {
  waves: WaveWork[];
  /** Which LLM phase we are in. */
  phase: "sentiment" | "themes" | "finalize";
  /** True after one pass re-classifying high-unclear waves. */
  repairPass?: boolean;
};

/* ─── Redis ────────────────────────────────────────────────────────── */

const RESULT_KEY = "lpp:pulse:result";
const QUEUE_KEY = "lpp:pulse:queue";

export async function getPulseResult(): Promise<PulseResult | null> {
  const raw = await redis.get<string | PulseResult>(RESULT_KEY);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function savePulseResult(result: PulseResult) {
  await redis.set(RESULT_KEY, JSON.stringify(result));
}

export async function clearPulse() {
  await redis.del(RESULT_KEY);
  await redis.del(QUEUE_KEY);
}

export async function clearPulseQueue() {
  await redis.del(QUEUE_KEY);
}

export async function getPulseQueue(): Promise<PulseQueue | null> {
  const raw = await redis.get<string | PulseQueue>(QUEUE_KEY);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function savePulseQueue(q: PulseQueue) {
  await redis.set(QUEUE_KEY, JSON.stringify(q));
}

/* ─── Fetch ────────────────────────────────────────────────────────── */

const BASE = "https://larv.ai/api";
const FORUM = (id: string) => `https://larv.ai/forum/${id}`;

/** Known check-in series + title pattern for future waves. */
const KNOWN_CHECKIN_IDS = new Set(["39", "85", "98", "103"]);
const CHECKIN_TITLE = /^\s*checking in(\s*\(?\d+\)?)?\s*$/i;

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function extractResponses(detail: any): QueueResponse[] {
  const arr = detail?.larvaResponses;
  if (!Array.isArray(arr)) return [];
  const out: QueueResponse[] = [];
  for (const r of arr) {
    const wallet = r?.wallet || r?.address || r?.wallet_address || null;
    const text =
      r?.response || r?.content || r?.body || r?.text || r?.message || null;
    if (wallet && typeof text === "string" && text.trim().length > 0) {
      out.push({
        wallet: String(wallet).toLowerCase(),
        text: text.trim().slice(0, 500),
      });
    }
  }
  return out;
}

function isCheckIn(p: { id?: unknown; title?: unknown }): boolean {
  const id = String(p?.id ?? "");
  if (KNOWN_CHECKIN_IDS.has(id)) return true;
  const title = typeof p?.title === "string" ? p.title : "";
  return CHECKIN_TITLE.test(title);
}

/**
 * Discover check-in posts, fetch responses, stash a build queue.
 * Returns how many waves were collected.
 */
export async function collectCheckInsIntoQueue(): Promise<number> {
  const list = await getJson(`${BASE}/forum`);
  if (!Array.isArray(list)) return 0;

  const candidates = list.filter(isCheckIn);
  // Oldest → newest for a readable timeline
  candidates.sort((a: any, b: any) =>
    String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );

  const waves: WaveWork[] = [];
  for (const p of candidates) {
    const id = String(p.id);
    const detail = await getJson(`${BASE}/forum/${id}`);
    if (!detail) continue;
    const responses = extractResponses(detail);
    if (responses.length < 5) continue;
    const post = detail.post || p;
    waves.push({
      postId: id,
      title: String(post.title || p.title || `Checking in ${id}`),
      createdAt: String(post.created_at || p.created_at || ""),
      aggregateShort: String(
        post.aggregated_opinion_short ||
          p.aggregated_opinion_short ||
          post.aggregated_opinion ||
          ""
      ).slice(0, 400),
      prompt: String(post.body || p.body || "").slice(0, 800),
      responses,
      sentCursor: 0,
      sentiments: [],
      themeCursor: 0,
      themeHits: [],
    });
  }

  if (waves.length === 0) return 0;

  await savePulseQueue({ waves, phase: "sentiment" });
  return waves.length;
}

/* ─── Sentiment classification ─────────────────────────────────────── */

const SENT_BATCH = 10;
const VALID_SENT: PulseSentiment[] = ["upbeat", "frustrated", "mixed", "unclear"];

async function haikuRetry(
  system: string,
  user: string,
  maxTokens: number,
  temperature: number,
  tries = 3
): Promise<string | null> {
  let last = "";
  for (let i = 0; i < tries; i++) {
    try {
      const text = await haiku(system, user, maxTokens, temperature);
      if (text && text.trim()) return text;
      last = "empty";
    } catch (e) {
      last = e instanceof Error ? e.message : "error";
      // brief backoff for rate limits
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  console.warn("[pulse] haikuRetry failed:", last);
  return null;
}

const SENT_SYSTEM = `You classify larva check-in replies about a holder's experience with larv.ai.

The post asks how things are going / how the holder's experience has been.
For each numbered reply, classify overall vibe as exactly one of:
- upbeat — mostly positive, patient, hopeful, impressed
- frustrated — mostly negative, impatient, disappointed, skeptical of progress
- mixed — clear mix of praise and criticism
- unclear — off-topic, too thin, or no readable vibe

Return ONLY a JSON array of those strings, same order and count as the inputs.
Example: ["upbeat","frustrated","mixed",...]`;

function parseSentimentArray(text: string, expect: number): PulseSentiment[] | null {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1) return null;
  try {
    const arr = JSON.parse(clean.slice(start, end + 1));
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const out: PulseSentiment[] = [];
    for (let i = 0; i < expect; i++) {
      const raw = arr[i];
      const v = String(raw ?? "unclear")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
      out.push(VALID_SENT.includes(v as PulseSentiment) ? (v as PulseSentiment) : "unclear");
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * Classify one sentiment batch on the first incomplete wave.
 * Returns true if any work happened.
 */
export async function classifySentimentBatch(q: PulseQueue): Promise<boolean> {
  const wave = q.waves.find((w) => w.sentCursor < w.responses.length);
  if (!wave) {
    q.phase = "themes";
    return false;
  }

  const slice = wave.responses.slice(wave.sentCursor, wave.sentCursor + SENT_BATCH);
  const user = slice
    .map((r, i) => `${i + 1}. ${r.text.replace(/\s+/g, " ").slice(0, 380)}`)
    .join("\n");

  const raw = await haikuRetry(SENT_SYSTEM, user, 500, 0.1, 3);
  const parsed = raw ? parseSentimentArray(raw, slice.length) : null;
  if (!parsed) {
    wave.sentiments.push(...slice.map(() => "unclear" as PulseSentiment));
  } else {
    wave.sentiments.push(...parsed);
  }

  wave.sentCursor += slice.length;
  if (q.waves.every((w) => w.sentCursor >= w.responses.length)) {
    // One repair pass for waves that mostly failed classification.
    if (!q.repairPass) {
      const heavy = q.waves.filter((w) => {
        const unclear = w.sentiments.filter((s) => s === "unclear").length;
        return w.responses.length > 0 && unclear / w.responses.length >= 0.6;
      });
      if (heavy.length > 0) {
        q.repairPass = true;
        for (const w of heavy) {
          w.sentCursor = 0;
          w.sentiments = [];
        }
        return true;
      }
    }
    q.phase = "themes";
  }
  return true;
}

/* ─── Theme extraction ─────────────────────────────────────────────── */

const THEME_BATCH = 10;

const THEME_SYSTEM = `You extract themes from larva check-in replies about holders' experience with larv.ai.

These are NOT votes on a proposal. Pull out concrete recurring topics people feel about
(e.g. shipping speed, governance utility, burns, patience, price action, product proof).

Return ONLY JSON:
{
  "themes": [
    { "label": "short theme name", "praise": 2, "pushback": 1 }
  ]
}

Rules:
- praise = how many replies in this batch speak well of that theme
- pushback = how many replies in this batch complain about it
- most themes are one-sided: give praise OR pushback and leave the other at 0
- only set both above 0 when replies genuinely disagree about that theme
- every theme needs praise + pushback >= 1
- label is 1-4 plain words, lowercase, no "and" lists — split compound topics apart
- give 6 to 8 themes, a healthy mix of liked and complained-about topics
- merge near-duplicates into one label
- skip overall mood with no topic ("things are fine")
- no markdown`;

function parseThemeHits(text: string): ThemeHit[] {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) return [];
  try {
    const obj = JSON.parse(clean.slice(start, end + 1));
    const arr = Array.isArray(obj?.themes) ? obj.themes : [];
    const out: ThemeHit[] = [];
    for (const t of arr) {
      const label = String(t?.label || "").trim().slice(0, 60);
      if (!label || label.length < 3) continue;

      let praise = Math.max(0, Math.min(50, Number(t?.praise) || 0));
      let pushback = Math.max(0, Math.min(50, Number(t?.pushback) || 0));

      // Tolerate the older {polarity, count} shape.
      if (praise === 0 && pushback === 0) {
        const polarity = String(t?.polarity || "").toLowerCase();
        const count = Math.max(1, Math.min(50, Number(t?.count) || 1));
        if (polarity === "positive") praise = count;
        else if (polarity === "negative") pushback = count;
        else if (polarity === "contested") {
          praise = Math.ceil(count / 2);
          pushback = Math.floor(count / 2) || 1;
        } else continue;
      }

      if (praise + pushback === 0) continue;
      out.push({ label, praise, pushback });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Extract themes from one batch on the first incomplete wave.
 */
export async function extractThemeBatch(q: PulseQueue): Promise<boolean> {
  if (q.phase !== "themes") return false;
  const wave = q.waves.find((w) => w.themeCursor < w.responses.length);
  if (!wave) {
    q.phase = "finalize";
    return false;
  }

  const slice = wave.responses.slice(wave.themeCursor, wave.themeCursor + THEME_BATCH);
  const user = slice
    .map((r, i) => `${i + 1}. ${r.text.replace(/\s+/g, " ").slice(0, 380)}`)
    .join("\n");

  const raw = await haikuRetry(THEME_SYSTEM, user, 800, 0.2, 3);
  if (raw) wave.themeHits.push(...parseThemeHits(raw));

  wave.themeCursor += slice.length;
  if (themesComplete(q)) {
    q.phase = "finalize";
  }
  return true;
}

export function themesComplete(q: PulseQueue): boolean {
  return q.waves.every((w) => w.themeCursor >= w.responses.length);
}

/** True when a stored result is complete enough to keep (else auto-rebuild). */
export function isPulseHealthy(result: PulseResult): boolean {
  if (!result.waves.length) return false;
  // Old payloads (pre praise/pushback) lack ledgers/prompt — force a rebuild.
  if (!("prompt" in result)) return false;

  const latest = result.waves[result.waves.length - 1];
  if (latest.n > 0 && latest.unclear / latest.n >= 0.6) return false;

  // Every wave should carry near-full liked and complaint boards.
  for (const w of result.waves) {
    if ((w.positive?.length || 0) < 4) return false;
    if ((w.negative?.length || 0) < 4) return false;
  }
  return true;
}

/* ─── Finalize ─────────────────────────────────────────────────────── */

function themeKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 60);
}

function buildWaves(work: WaveWork[]): PulseWave[] {
  return work.map((w) => {
    const sentiments =
      w.sentiments.length === w.responses.length
        ? w.sentiments
        : [
            ...w.sentiments,
            ...Array(Math.max(0, w.responses.length - w.sentiments.length)).fill(
              "unclear" as PulseSentiment
            ),
          ];

    let upbeat = 0;
    let frustrated = 0;
    let mixed = 0;
    let unclear = 0;
    for (const s of sentiments) {
      if (s === "upbeat") upbeat++;
      else if (s === "frustrated") frustrated++;
      else if (s === "mixed") mixed++;
      else unclear++;
    }
    const classified = upbeat + frustrated + mixed;
    const denom = classified > 0 ? classified : 1;

    return {
      postId: w.postId,
      title: w.title,
      createdAt: w.createdAt,
      n: w.responses.length,
      upbeat,
      frustrated,
      mixed,
      unclear,
      pctUpbeat: upbeat / denom,
      pctFrustrated: frustrated / denom,
      pctMixed: mixed / denom,
      aggregateShort: w.aggregateShort,
      link: FORUM(w.postId),
      positive: [],
      negative: [],
      mixed_themes: [],
      ledger: [],
    };
  });
}

/** Flatten one wave's merged themes into a compact tally for delta matching. */
function buildLedger(merged: Acc[]): ThemeTally[] {
  return merged
    .map((a) => ({
      id: themeKey(a.label),
      label: a.label,
      praise: a.praise,
      pushback: a.pushback,
    }))
    .sort((x, y) => y.praise + y.pushback - (x.praise + x.pushback));
}

/**
 * Attach movement vs the previous wave's ledger onto each ranked theme.
 * Matches by fuzzy token overlap so "shipping speed" lines up across waves.
 */
function attachDeltas(
  themes: PulseTheme[],
  prevLedger: ThemeTally[] | null
): void {
  for (const t of themes) {
    if (!prevLedger) {
      // First wave: nothing to compare against.
      t.delta = {
        praisePrev: null,
        pushbackPrev: null,
        praiseDelta: null,
        pushbackDelta: null,
      };
      continue;
    }
    const tokens = tokenize(t.label);
    const prior = prevLedger.find((p) => sameTheme(tokenize(p.label), tokens));
    const praisePrev = prior ? prior.praise : 0;
    const pushbackPrev = prior ? prior.pushback : 0;
    t.delta = {
      praisePrev: prior ? praisePrev : null,
      pushbackPrev: prior ? pushbackPrev : null,
      praiseDelta: prior ? t.praise - praisePrev : t.praise,
      pushbackDelta: prior ? t.pushback - pushbackPrev : t.pushback,
    };
  }
}

type Acc = {
  label: string;
  tokens: Set<string>;
  praise: number;
  pushback: number;
  waves: Set<string>;
};

const STOPWORDS = new Set([
  "and",
  "or",
  "the",
  "of",
  "for",
  "to",
  "in",
  "on",
  "a",
  "an",
  "with",
  "its",
  "their",
  "larv",
  "ai",
  "clawd",
]);

/** A queue saved before the praise/pushback change still holds the old shape. */
function normalizeHit(hit: ThemeHit): ThemeHit | null {
  const label = String(hit?.label || "").trim();
  if (!label) return null;
  const praise = Number(hit?.praise);
  const pushback = Number(hit?.pushback);
  if (Number.isFinite(praise) || Number.isFinite(pushback)) {
    const p = Number.isFinite(praise) ? praise : 0;
    const b = Number.isFinite(pushback) ? pushback : 0;
    if (p + b > 0) return { label, praise: p, pushback: b };
  }
  const legacy = hit as unknown as { polarity?: string; count?: number };
  const count = Math.max(1, Number(legacy.count) || 1);
  if (legacy.polarity === "positive") return { label, praise: count, pushback: 0 };
  if (legacy.polarity === "negative") return { label, praise: 0, pushback: count };
  if (legacy.polarity === "contested") {
    return { label, praise: Math.ceil(count / 2), pushback: Math.floor(count / 2) || 1 };
  }
  return null;
}

function tokenize(label: string): Set<string> {
  return new Set(
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((t) => t.length > 2 && !STOPWORDS.has(t))
  );
}

/**
 * "shipping speed" and "shipping speed and execution" are the same complaint.
 * Without fuzzy merging the boards fill up with near-duplicate rows.
 */
function sameTheme(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  if (shared === 0) return false;
  const smaller = Math.min(a.size, b.size);
  if (shared === smaller) return true;
  const union = a.size + b.size - shared;
  return shared / union >= 0.5;
}

function mergeThemes(work: WaveWork[]): Acc[] {
  const accs: Acc[] = [];

  for (const w of work) {
    for (const raw of w.themeHits) {
      const hit = normalizeHit(raw);
      if (!hit) continue;
      const tokens = tokenize(hit.label);
      if (tokens.size === 0) continue;

      let acc = accs.find((a) => sameTheme(a.tokens, tokens));
      if (!acc) {
        acc = {
          label: hit.label.trim(),
          tokens: new Set(tokens),
          praise: 0,
          pushback: 0,
          waves: new Set(),
        };
        accs.push(acc);
      } else {
        // Keep the tightest wording; long "x and y" labels read worse.
        if (tokens.size < acc.tokens.size) {
          acc.label = hit.label.trim();
          acc.tokens = new Set(tokens);
        }
      }

      acc.praise += hit.praise;
      acc.pushback += hit.pushback;
      acc.waves.add(w.postId);
    }
  }

  return accs;
}

function toTheme(
  label: string,
  praise: number,
  pushback: number,
  n: number,
  metric: string,
  detail: string | undefined,
  waves: string[]
): PulseTheme {
  return { id: themeKey(label), label, n, praise, pushback, metric, detail, waves };
}

const SYNTH_SYSTEM = `You extract the main themes from one larv.ai "Checking in" wave.

Return ONLY JSON:
{
  "themes": [
    { "label": "short theme name", "praise": 4, "pushback": 2 }
  ]
}

Use the aggregate summary and sample replies. Prefer concrete topics (shipping, burns,
governance proof, patience, price, product utility, onboarding, transparency).
Labels are 1-4 plain lowercase words, no "and" lists. Give 8 themes: at least 5 with
praise > 0 and at least 5 with pushback > 0. praise/pushback are weights 0-10.`;

async function synthesizeWaveThemes(w: WaveWork): Promise<ThemeHit[]> {
  const step = Math.max(1, Math.floor(w.responses.length / 16));
  const sample = w.responses.filter((_, i) => i % step === 0).slice(0, 16);
  const user = [
    `Title: ${w.title}`,
    `Aggregate: ${w.aggregateShort || "(none)"}`,
    "",
    "Sample replies:",
    ...sample.map((r, i) => `${i + 1}. ${r.text.replace(/\s+/g, " ").slice(0, 280)}`),
  ].join("\n");

  const raw = await haikuRetry(SYNTH_SYSTEM, user, 900, 0.3, 3);
  return raw ? parseThemeHits(raw) : [];
}

function rankThemes(merged: Acc[], singleWave = false): {
  positive: PulseTheme[];
  negative: PulseTheme[];
  mixed_themes: PulseTheme[];
} {
  const across = (a: Acc) =>
    singleWave || a.waves.size <= 1
      ? undefined
      : `across ${a.waves.size} check-ins`;

  const positive = [...merged]
    .filter((a) => a.praise >= 1)
    .sort((a, b) => b.praise - a.praise || b.waves.size - a.waves.size)
    .slice(0, 5)
    .map((a) =>
      toTheme(
        a.label,
        a.praise,
        a.pushback,
        a.praise,
        `${a.praise} liked it`,
        across(a),
        [...a.waves]
      )
    );

  const negative = [...merged]
    .filter((a) => a.pushback >= 1)
    .sort((a, b) => b.pushback - a.pushback || b.waves.size - a.waves.size)
    .slice(0, 5)
    .map((a) =>
      toTheme(
        a.label,
        a.praise,
        a.pushback,
        a.pushback,
        `${a.pushback} complained`,
        across(a),
        [...a.waves]
      )
    );

  // A mixed take needs both sides. One-sided themes live on the boards above.
  const mixed_themes = [...merged]
    .map((a) => {
      const total = a.praise + a.pushback;
      const balance = total > 0 ? Math.min(a.praise, a.pushback) / total : 0;
      return { a, total, score: balance * total };
    })
    .filter((x) => x.a.praise >= 1 && x.a.pushback >= 1)
    .sort((x, y) => y.score - x.score || y.total - x.total)
    .slice(0, 3)
    .map(({ a }) =>
      toTheme(
        a.label,
        a.praise,
        a.pushback,
        Math.min(a.praise, a.pushback),
        `${a.praise} liked · ${a.pushback} complained`,
        across(a),
        [...a.waves]
      )
    );

  return { positive, negative, mixed_themes };
}

export async function finalizePulse(q: PulseQueue): Promise<PulseResult> {
  // Every wave needs its own full top-5 boards, so top up any wave whose
  // ranked lists come out thin rather than only checking raw hit count.
  for (const w of q.waves) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const board = rankThemes(mergeThemes([w]), true);
      if (board.positive.length >= 5 && board.negative.length >= 5) break;
      const extra = await synthesizeWaveThemes(w);
      if (extra.length === 0) break;
      w.themeHits.push(...extra);
    }
  }

  // Waves are stored oldest → newest; each compares to the one before it.
  let prevLedger: ThemeTally[] | null = null;
  const waves: PulseWave[] = buildWaves(q.waves).map((bw, i) => {
    const merged = mergeThemes([q.waves[i]]);
    const ranked = rankThemes(merged, true);
    const ledger = buildLedger(merged);

    attachDeltas(ranked.positive, prevLedger);
    attachDeltas(ranked.negative, prevLedger);
    attachDeltas(ranked.mixed_themes, prevLedger);

    prevLedger = ledger;
    return { ...bw, ...ranked, ledger };
  });

  const ranked = rankThemes(mergeThemes(q.waves));
  const totalResponses = q.waves.reduce((n, w) => n + w.responses.length, 0);
  // The check-in prompt is essentially the same each wave; show the latest.
  const prompt =
    [...q.waves].reverse().find((w) => w.prompt && w.prompt.length > 20)?.prompt || "";

  return {
    waves,
    positive: ranked.positive,
    negative: ranked.negative,
    mixed_themes: ranked.mixed_themes,
    prompt,
    meta: {
      builtAt: new Date().toISOString(),
      waveCount: waves.length,
      totalResponses,
      caveat:
        "Built from recurring “Checking in” forum posts (same prompt family). Overall pulse is model-classified vibe per reply; theme boards are model-extracted per check-in — not ballots.",
    },
  };
}

/** Progress helper for the build route. */
export function pulseProgress(q: PulseQueue): {
  phase: string;
  sentimentDone: number;
  sentimentTotal: number;
  themeDone: number;
  themeTotal: number;
} {
  const sentimentTotal = q.waves.reduce((n, w) => n + w.responses.length, 0);
  const sentimentDone = q.waves.reduce((n, w) => n + w.sentiments.length, 0);
  const themeTotal = sentimentTotal;
  const themeDone = q.waves.reduce((n, w) => n + w.themeCursor, 0);
  return {
    phase: q.phase,
    sentimentDone,
    sentimentTotal,
    themeDone,
    themeTotal,
  };
}
