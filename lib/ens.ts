// lib/ens.ts
//
// Reverse-resolve ENS names for wallets. larv.ai's API only returns addresses;
// any .eth labels on their UI are client-side. We look them up ourselves and
// cache in Redis so pages don't hammer a public API.
//
// ENS replaces displayed wallet hex only. Specimen nicknames are never ENS.

import { redis } from "@/lib/larvae";

const ENS_KEY = (w: string) => `lpp:ens:${w.toLowerCase()}`;
/** Empty string = known miss (no ENS). */
const MISS = "";
const HIT_TTL_SEC = 60 * 60 * 24 * 7; // 7 days
const MISS_TTL_SEC = 60 * 60 * 24; // 1 day

async function fetchEns(wallet: string): Promise<string | null> {
  const url = `https://api.ensideas.com/ens/resolve/${encodeURIComponent(wallet)}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { name?: unknown };
  const name = typeof data.name === "string" ? data.name.trim() : "";
  if (!name || !/\.eth$/i.test(name)) return null;
  return name;
}

/** Reverse-resolve one wallet. Cached. Returns null when no primary ENS. */
export async function lookupEns(wallet: string): Promise<string | null> {
  const w = wallet.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(w)) return null;

  try {
    const cached = await redis.get<string>(ENS_KEY(w));
    if (cached !== null && cached !== undefined) {
      return cached === MISS ? null : String(cached);
    }
  } catch {
    // Redis blip — still try the network
  }

  let name: string | null = null;
  try {
    name = await fetchEns(w);
  } catch {
    name = null;
  }

  try {
    await redis.set(ENS_KEY(w), name ?? MISS, {
      ex: name ? HIT_TTL_SEC : MISS_TTL_SEC,
    });
  } catch {
    // ignore cache write failures
  }

  return name;
}

/** Batch reverse-resolve. Keys are lowercased wallets. */
export async function lookupEnsMany(
  wallets: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(wallets.map((w) => w.toLowerCase()))];
  const out: Record<string, string> = {};
  const CONCURRENCY = 8;

  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const slice = unique.slice(i, i + CONCURRENCY);
    const got = await Promise.all(slice.map(lookupEns));
    slice.forEach((w, j) => {
      if (got[j]) out[w] = got[j]!;
    });
  }

  return out;
}

/** What to show instead of raw hex: ENS if present, else a short address. */
export function walletLabel(wallet: string, ens?: string | null): string {
  if (ens) return ens;
  const w = wallet || "";
  if (w.length < 12) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}
