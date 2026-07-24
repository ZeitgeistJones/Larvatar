// lib/pulse.ts
//
// Topic Trends / overall pulse — sourced from the recurring "Checking in"
// forum posts (same prompt family), not governance votes.
//
// WHAT WE BUILD:
//
//   waves       — per check-in overall vibe (% upbeat / frustrated / mixed)
//   positive    — top themes people celebrate
//   negative    — top themes people complain about
//   contention  — themes that split the room
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
};

export type PulseTheme = {
  id: string;
  label: string;
  /** Mention mass used for ranking. */
  n: number;
  metric: string;
  detail?: string;
  /** Check-in post ids that surfaced this theme. */
  waves: string[];
};

export type PulseResult = {
  waves: PulseWave[];
  positive: PulseTheme[];
  negative: PulseTheme[];
  contention: PulseTheme[];
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
  polarity: "positive" | "negative" | "contested";
  count: number;
};

type WaveWork = {
  postId: string;
  title: string;
  createdAt: string;
  aggregateShort: string;
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
    { "label": "short theme name", "polarity": "positive"|"negative"|"contested", "count": 1 }
  ]
}

Rules:
- polarity positive = celebrated / working / hopeful about that theme
- polarity negative = complaint / worry about that theme
- polarity contested = replies clearly split on that theme inside this batch
- count = roughly how many replies in this batch touched it (integer >= 1)
- max 8 themes; merge near-duplicates into one label
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
      const label = String(t?.label || "").trim().slice(0, 80);
      const polarity = String(t?.polarity || "").toLowerCase();
      const count = Math.max(1, Math.min(50, Number(t?.count) || 1));
      if (!label || label.length < 3) continue;
      if (polarity !== "positive" && polarity !== "negative" && polarity !== "contested") {
        continue;
      }
      out.push({ label, polarity, count });
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

/** True when a stored result looks too thin / broken to keep. */
export function isPulseHealthy(result: PulseResult): boolean {
  if (!result.waves.length) return false;
  const latest = result.waves[result.waves.length - 1];
  if (latest.n > 0 && latest.unclear / latest.n >= 0.6) return false;
  const themes =
    result.positive.length + result.negative.length + result.contention.length;
  if (themes === 0) return false;
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
    };
  });
}

type Acc = {
  label: string;
  positive: number;
  negative: number;
  contested: number;
  waves: Set<string>;
};

function mergeThemes(work: WaveWork[]): Acc[] {
  const map = new Map<string, Acc>();
  for (const w of work) {
    for (const hit of w.themeHits) {
      const key = themeKey(hit.label);
      if (!key) continue;
      let acc = map.get(key);
      if (!acc) {
        acc = {
          label: hit.label.trim(),
          positive: 0,
          negative: 0,
          contested: 0,
          waves: new Set(),
        };
        map.set(key, acc);
      }
      // Prefer a cleaner / Title-ish label when longer
      if (hit.label.length > acc.label.length) acc.label = hit.label.trim();
      if (hit.polarity === "positive") acc.positive += hit.count;
      else if (hit.polarity === "negative") acc.negative += hit.count;
      else acc.contested += hit.count;
      acc.waves.add(w.postId);
    }
  }
  return [...map.values()];
}

function toTheme(
  id: string,
  label: string,
  n: number,
  metric: string,
  detail: string | undefined,
  waves: string[]
): PulseTheme {
  return { id, label, n, metric, detail, waves };
}

const SYNTH_SYSTEM = `You extract the main themes from one larv.ai "Checking in" wave.

Return ONLY JSON:
{
  "themes": [
    { "label": "short theme name", "polarity": "positive"|"negative"|"contested", "count": 3 }
  ]
}

Use the aggregate summary and sample replies. Prefer concrete topics (shipping, burns, governance proof, patience, price, product utility). Max 6 themes. count is an importance weight 1-10.`;

async function synthesizeWaveThemes(w: WaveWork): Promise<ThemeHit[]> {
  const step = Math.max(1, Math.floor(w.responses.length / 12));
  const sample = w.responses.filter((_, i) => i % step === 0).slice(0, 12);
  const user = [
    `Title: ${w.title}`,
    `Aggregate: ${w.aggregateShort || "(none)"}`,
    "",
    "Sample replies:",
    ...sample.map((r, i) => `${i + 1}. ${r.text.replace(/\s+/g, " ").slice(0, 280)}`),
  ].join("\n");

  const raw = await haikuRetry(SYNTH_SYSTEM, user, 700, 0.2, 3);
  return raw ? parseThemeHits(raw) : [];
}

function rankThemes(merged: Acc[]): {
  positive: PulseTheme[];
  negative: PulseTheme[];
  contention: PulseTheme[];
} {
  const positive = [...merged]
    .filter((a) => a.positive >= 1)
    .sort((a, b) => b.positive - a.positive || b.waves.size - a.waves.size)
    .slice(0, 5)
    .map((a) =>
      toTheme(
        themeKey(a.label),
        a.label,
        a.positive,
        `${a.positive} positive mentions`,
        a.waves.size > 1 ? `across ${a.waves.size} check-ins` : undefined,
        [...a.waves]
      )
    );

  const negative = [...merged]
    .filter((a) => a.negative >= 1)
    .sort((a, b) => b.negative - a.negative || b.waves.size - a.waves.size)
    .slice(0, 5)
    .map((a) =>
      toTheme(
        themeKey(a.label),
        a.label,
        a.negative,
        `${a.negative} negative mentions`,
        a.waves.size > 1 ? `across ${a.waves.size} check-ins` : undefined,
        [...a.waves]
      )
    );

  const contention = [...merged]
    .map((a) => {
      const split = Math.min(a.positive, a.negative);
      const score = a.contested * 2 + split;
      return { a, score, split };
    })
    .filter((x) => x.score >= 1 && (x.a.contested >= 1 || x.split >= 1))
    .sort((x, y) => y.score - x.score || y.a.waves.size - x.a.waves.size)
    .slice(0, 3)
    .map(({ a }) =>
      toTheme(
        themeKey(a.label),
        a.label,
        a.contested + Math.min(a.positive, a.negative),
        a.contested
          ? `${a.contested} contested · ${a.positive}+/${a.negative}−`
          : `split ${a.positive}+ / ${a.negative}−`,
        a.waves.size > 1 ? `across ${a.waves.size} check-ins` : undefined,
        [...a.waves]
      )
    );

  return { positive, negative, contention };
}

export async function finalizePulse(q: PulseQueue): Promise<PulseResult> {
  // If batch theme extraction was thin, synthesize per wave from aggregates + samples.
  const hitCount = q.waves.reduce((n, w) => n + w.themeHits.length, 0);
  if (hitCount < 6) {
    for (const w of q.waves) {
      const extra = await synthesizeWaveThemes(w);
      w.themeHits.push(...extra);
    }
  }

  const waves = buildWaves(q.waves);
  const ranked = rankThemes(mergeThemes(q.waves));
  const totalResponses = q.waves.reduce((n, w) => n + w.responses.length, 0);

  return {
    waves,
    ...ranked,
    meta: {
      builtAt: new Date().toISOString(),
      waveCount: waves.length,
      totalResponses,
      caveat:
        "Built from recurring “Checking in” forum posts (same prompt family). Overall pulse is model-classified vibe per reply; theme boards are model-extracted topics across those replies — not ballots.",
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
