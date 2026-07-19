// lib/larvae.ts
// shared types + redis + larv.ai fetchers + anthropic helper

import { Redis } from "@upstash/redis";

export const redis = Redis.fromEnv();

// ---------- types ----------

export type LarvaProfile = {
  wallet: string;
  responseCount: number;
  sources: { forum: number; labs: number };
  profile: {
    name: string;       // invented specimen name, e.g. "The Skeptic"
    tagline: string;    // one line
    tone: "fiery" | "chill" | "analytical" | "chaotic" | "earnest" | "cynical";
    values: string[];   // 2-4 short phrases
    quirks: string[];   // 1-3 short phrases
    summary: string;    // 2-3 sentences
  };
  avatar: { hue: number; tone: string };
  updatedAt: string;
};

const PROFILE_KEY = (w: string) => `lpp:profile:${w.toLowerCase()}`;
const INDEX_KEY = "lpp:index"; // JSON array of { wallet, responseCount } sorted desc

// ---------- redis helpers ----------

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

// larvaResponses field names aren't documented — extract defensively
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

export async function pullAllResponses(): Promise<Map<string, { texts: string[]; forum: number; labs: number }>> {
  const byWallet = new Map<string, { texts: string[]; forum: number; labs: number }>();

  const add = (wallet: string, text: string, source: "forum" | "labs") => {
    const key = wallet.toLowerCase();
    const cur = byWallet.get(key) || { texts: [], forum: 0, labs: 0 };
    cur.texts.push(text);
    cur[source] += 1;
    byWallet.set(key, cur);
  };

  // forum
  const posts = await getJson(`${BASE}/forum`);
  if (Array.isArray(posts)) {
    for (const p of posts) {
      const id = p?.id;
      if (id == null) continue;
      const detail = await getJson(`${BASE}/forum/${id}`);
      for (const r of extractResponses(detail)) add(r.wallet, r.text, "forum");
    }
  }

  // labs
  const ideas = await getJson(`${BASE}/labs`);
  if (Array.isArray(ideas)) {
    for (const i of ideas) {
      const id = i?.id;
      if (id == null) continue;
      const detail = await getJson(`${BASE}/labs/${id}`);
      for (const r of extractResponses(detail)) add(r.wallet, r.text, "labs");
    }
  }

  return byWallet;
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

// deterministic hue from wallet
export function walletHue(wallet: string): number {
  let h = 0;
  for (const c of wallet.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
