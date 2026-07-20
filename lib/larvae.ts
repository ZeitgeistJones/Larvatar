import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();

export type LarvaProfile = {
  wallet: string;
  responseCount: number;
  sources: { forum: number; labs: number };
  profile: {
    name: string;
    tagline: string;
    tone: "fiery" | "chill" | "analytical" | "chaotic" | "earnest" | "cynical";
    values: string[];
    quirks: string[];
    summary: string;
  };
  avatar: { hue: number; tone: string };
  updatedAt: string;
};

const PROFILE_KEY = (w: string) => `lpp:profile:${w.toLowerCase()}`;
const INDEX_KEY = "lpp:index";
const QUEUE_KEY = "lpp:build:queue"; // JSON: { wallet, texts, forum, labs }[] still pending
const DONE_KEY = "lpp:build:done";   // JSON: { wallet, responseCount }[] finished this build run

export async function saveProfile(p: LarvaProfile) {
  await redis.set(PROFILE_KEY(p.wallet), JSON.stringify(p));
}

export async function getProfile(wallet: string): Promise<LarvaProfile | null> {
  const raw = await redis.get<string | LarvaProfile>(PROFILE_KEY(wallet));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function saveIndex(entries: { wallet: string; responseCount: number }[]) {
  await redis.set(INDEX_KEY, JSON.stringify(entries));
}

export async function getIndex(): Promise<{ wallet: string; responseCount: number }[]> {
  const raw = await redis.get<string | any[]>(INDEX_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// ---------- chunked build queue ----------

type QueueItem = { wallet: string; texts: string[]; forum: number; labs: number };

export async function setQueue(items: QueueItem[]) {
  await redis.set(QUEUE_KEY, JSON.stringify(items));
}

export async function getQueue(): Promise<QueueItem[]> {
  const raw = await redis.get<string | QueueItem[]>(QUEUE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function clearQueue() {
  await redis.del(QUEUE_KEY);
}

export async function appendDone(entries: { wallet: string; responseCount: number }[]) {
  const raw = await redis.get<string | any[]>(DONE_KEY);
  const cur: { wallet: string; responseCount: number }[] = raw
    ? typeof raw === "string" ? JSON.parse(raw) : raw
    : [];
  const merged = [...cur, ...entries];
  await redis.set(DONE_KEY, JSON.stringify(merged));
  return merged;
}

export async function getDone(): Promise<{ wallet: string; responseCount: number }[]> {
  const raw = await redis.get<string | any[]>(DONE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function clearDone() {
  await redis.del(DONE_KEY);
}

// ---------- larv.ai fetchers ----------

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
    const text = r?.response || r?.content || r?.body || r?.text || r?.message || null;
    if (wallet && typeof text === "string" && text.trim().length > 0) {
      out.push({ wallet: String(wallet), text: text.trim() });
    }
  }
  return out;
}

// fetch a list of detail URLs with limited concurrency, so we don't hammer larv.ai
// or blow the time budget on a single huge sequential loop
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

// collection phase: pull everything, build the pending queue, store it in redis.
// this does NOT call the LLM, so it's the fast part — just fetches.
export async function collectIntoQueue(): Promise<number> {
  const byWallet = new Map<string, QueueItem>();

  const add = (wallet: string, text: string, source: "forum" | "labs") => {
    const key = wallet.toLowerCase();
    const cur = byWallet.get(key) || { wallet: key, texts: [], forum: 0, labs: 0 };
    cur.texts.push(text);
    cur[source] += 1;
    byWallet.set(key, cur);
  };

  const posts = await getJson(`${BASE}/forum`);
  if (Array.isArray(posts)) {
    const details = await mapWithConcurrency(posts, 8, (p: any) =>
      p?.id != null ? getJson(`${BASE}/forum/${p.id}`) : Promise.resolve(null)
    );
    for (const detail of details) {
      for (const r of extractResponses(detail)) add(r.wallet, r.text, "forum");
    }
  }

  const ideas = await getJson(`${BASE}/labs`);
  if (Array.isArray(ideas)) {
    const details = await mapWithConcurrency(ideas, 8, (i: any) =>
      i?.id != null ? getJson(`${BASE}/labs/${i.id}`) : Promise.resolve(null)
    );
    for (const detail of details) {
      for (const r of extractResponses(detail)) add(r.wallet, r.text, "labs");
    }
  }

  const MIN_RESPONSES = 2;
  const queue = Array.from(byWallet.values()).filter(
    (q) => q.forum + q.labs >= MIN_RESPONSES
  );

  await setQueue(queue);
  return queue.length;
}

// ---------- anthropic (haiku) ----------

export async function haiku(system: string, user: string, maxTokens = 700): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.content || [])
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}

export function parseJsonLoose(text: string): any {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no json found");
  return JSON.parse(clean.slice(start, end + 1));
}

export function walletHue(wallet: string): number {
  let h = 0;
  for (const c of wallet.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
