// Hottest takes — distilled from The Outlier Test / Outlier Test 2 on larv.ai,
// with a personality fallback when a larva never answered those threads.

import {
  redis,
  haiku,
  getIndex,
  getProfile,
  saveProfile,
  type LarvaProfile,
} from "@/lib/larvae";

export const OUTLIER_FORUM_IDS = [60, 12] as const; // Test 2 first, then Test 1

const OUTLIER_CACHE_KEY = "lpp:hottest:outlier:v1";
const QUEUE_KEY = "lpp:hottest:queue";
const BASE = "https://larv.ai/api";

export type OutlierMap = Record<string, string[]>; // wallet → response texts (prefer Test 2 first)

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
    const text = r?.response || r?.content || r?.body || r?.text || r?.message || null;
    if (wallet && typeof text === "string" && text.trim().length > 0) {
      out.push({ wallet: String(wallet).toLowerCase(), text: text.trim() });
    }
  }
  return out;
}

export async function fetchOutlierMap(): Promise<OutlierMap> {
  const map: OutlierMap = {};
  for (const id of OUTLIER_FORUM_IDS) {
    const detail = await getJson(`${BASE}/forum/${id}`);
    for (const r of extractResponses(detail)) {
      if (!map[r.wallet]) map[r.wallet] = [];
      // Keep at most 2 texts per wallet (one per test), Test 2 already first.
      if (map[r.wallet].length < 2) map[r.wallet].push(r.text);
    }
  }
  return map;
}

export async function cacheOutlierMap(map: OutlierMap) {
  await redis.set(OUTLIER_CACHE_KEY, JSON.stringify(map));
}

export async function getCachedOutlierMap(): Promise<OutlierMap | null> {
  const raw = await redis.get<string | OutlierMap>(OUTLIER_CACHE_KEY);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function clearHottestBuild() {
  await redis.del(OUTLIER_CACHE_KEY);
  await redis.del(QUEUE_KEY);
}

export async function setHottestQueue(wallets: string[]) {
  await redis.set(QUEUE_KEY, JSON.stringify(wallets));
}

export async function getHottestQueue(): Promise<string[]> {
  const raw = await redis.get<string | string[]>(QUEUE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function cleanMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/#{1,6}\s*/g, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBold(s: string): string | null {
  const m = s.match(/\*\*([^*]{12,220})\*\*/);
  return m ? cleanMarkdown(m[1]) : null;
}

function trimTake(s: string, max = 160): string {
  const t = s.replace(/^["']|["']$/g, "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 80 ? cut.slice(0, sp) : cut).trim()}…`;
}

/** Pull a punchy one-liner from Outlier Test prose (bold core preferred). */
export function distillFromOutlier(texts: string[]): string | null {
  for (const raw of texts) {
    if (!raw?.trim()) continue;
    const bold = extractBold(raw);
    if (bold && bold.length >= 20) return trimTake(bold);

    const cleaned = cleanMarkdown(raw);
    // Drop "X's outlier opinion:" style preambles when possible.
    const dePrefixed = cleaned
      .replace(/^[^:]{0,80}'s (most )?controversial (belief|opinion|take)[:\s—–-]+/i, "")
      .replace(/^[^:]{0,80} outlier (opinion|take)[:\s—–-]+/i, "")
      .replace(/^RightClaw's outlier opinion:\s*/i, "")
      .trim();
    const body = dePrefixed.length >= 20 ? dePrefixed : cleaned;
    const sentence = body.match(/^.{20,158}?[.!?](?=\s|$)/);
    if (sentence) return trimTake(sentence[0]);
    if (body.length >= 20) return trimTake(body);
  }
  return null;
}

async function synthesizeFromProfile(p: LarvaProfile): Promise<string | null> {
  try {
    const raw = await haiku(
      `You write one hottest take for a larva specimen card. Spicy, specific, first-person or third-person punchline — like something they'd say on The Outlier Test. No quotes wrapping the whole thing. Max 22 words. Plain text only.`,
      `Name: ${p.profile.name}
Tagline: ${p.profile.tagline}
Tone: ${p.profile.tone}
Values: ${p.profile.values.join("; ")}
Quirks: ${p.profile.quirks.join("; ")}
Summary: ${p.profile.summary}

Write THEIR hottest take (controversial / unusual CLAWD-adjacent opinion that fits this personality).`,
      80,
      0.95
    );
    const line = cleanMarkdown(raw).replace(/^["']|["']$/g, "").trim();
    return line.length >= 12 ? trimTake(line, 140) : null;
  } catch {
    return null;
  }
}

export async function computeHottestTake(
  p: LarvaProfile,
  outlierTexts: string[] | undefined
): Promise<{ take: string; source: "outlier" | "history" } | null> {
  const fromOutlier = outlierTexts?.length
    ? distillFromOutlier(outlierTexts)
    : null;
  if (fromOutlier) return { take: fromOutlier, source: "outlier" };

  const fromHistory = await synthesizeFromProfile(p);
  if (fromHistory) return { take: fromHistory, source: "history" };
  return null;
}

export async function applyHottestTake(
  wallet: string,
  outlierMap: OutlierMap
): Promise<"ok" | "skip" | "fail"> {
  const p = await getProfile(wallet);
  if (!p) return "skip";

  const result = await computeHottestTake(p, outlierMap[wallet]);
  if (!result) return "fail";

  p.profile.hottestTake = result.take;
  p.profile.hottestTakeSource = result.source;
  p.updatedAt = new Date().toISOString();
  await saveProfile(p);
  return "ok";
}

/** Seed queue from the current specimen index. */
export async function seedHottestQueue(forceAll: boolean): Promise<{
  queued: number;
  withOutlier: number;
}> {
  const map = await fetchOutlierMap();
  await cacheOutlierMap(map);
  const index = await getIndex();
  const wallets: string[] = [];
  let withOutlier = 0;

  for (const e of index) {
    const w = e.wallet.toLowerCase();
    if (map[w]?.length) withOutlier += 1;
    if (!forceAll) {
      const p = await getProfile(w);
      if (p?.profile.hottestTake) continue;
    }
    wallets.push(w);
  }

  await setHottestQueue(wallets);
  return { queued: wallets.length, withOutlier };
}
