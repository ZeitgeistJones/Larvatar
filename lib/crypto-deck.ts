// CoinGecko top-100 market-cap deck for Hive Card Sharks.
// Public endpoint — no API key required. Cached in Redis.

import { redis } from "@/lib/larvae";

export type CryptoCoin = {
  id: string;
  symbol: string;
  name: string;
  marketCap: number;
  rank: number;
};

const CACHE_KEY = "lpp:crypto:top100:v1";
const CACHE_TTL = 60 * 60; // 1 hour
const CG_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false";

export async function fetchTop100(): Promise<CryptoCoin[]> {
  const headers: Record<string, string> = { accept: "application/json" };
  const key = process.env.COINGECKO_API_KEY;
  if (key) headers["x-cg-demo-api-key"] = key;

  const res = await fetch(CG_URL, { headers, next: { revalidate: 0 } });
  if (!res.ok) {
    throw new Error(`coingecko ${res.status}`);
  }
  const data = (await res.json()) as Array<{
    id?: string;
    symbol?: string;
    name?: string;
    market_cap?: number;
    market_cap_rank?: number;
  }>;
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("coingecko empty");
  }

  return data
    .filter((c) => c.id && c.name && typeof c.market_cap === "number" && c.market_cap > 0)
    .map((c, i) => ({
      id: String(c.id),
      symbol: String(c.symbol || "").toUpperCase(),
      name: String(c.name),
      marketCap: Number(c.market_cap),
      rank: Number(c.market_cap_rank) || i + 1,
    }));
}

export async function getTop100Cached(): Promise<CryptoCoin[]> {
  const raw = await redis.get<string | CryptoCoin[]>(CACHE_KEY);
  if (raw) {
    const parsed = typeof raw === "string" ? (JSON.parse(raw) as CryptoCoin[]) : raw;
    if (Array.isArray(parsed) && parsed.length >= 50) return parsed;
  }
  const fresh = await fetchTop100();
  await redis.set(CACHE_KEY, JSON.stringify(fresh), { ex: CACHE_TTL });
  return fresh;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Deal `n` distinct coins not in `excludeIds`. */
export async function dealHand(
  n: number,
  excludeIds: string[] = []
): Promise<CryptoCoin[]> {
  const deck = await getTop100Cached();
  const ban = new Set(excludeIds);
  const pool = shuffle(deck.filter((c) => !ban.has(c.id)));
  if (pool.length < n) {
    throw new Error("not enough coins left in the deck");
  }
  return pool.slice(0, n);
}

export function formatCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

/** Public face of a coin — never includes market cap. */
export function coinPublic(c: CryptoCoin): { id: string; symbol: string; name: string } {
  return { id: c.id, symbol: c.symbol, name: c.name };
}

/** Face-up view — includes cap + rank. */
export function coinFaceUp(c: CryptoCoin): {
  id: string;
  symbol: string;
  name: string;
  marketCap: number;
  marketCapLabel: string;
  rank: number;
} {
  return {
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    marketCap: c.marketCap,
    marketCapLabel: formatCap(c.marketCap),
    rank: c.rank,
  };
}
