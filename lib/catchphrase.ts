// Punchy in-character catchphrases for specimen cards (ElevenLabs one-liner).
// Must NOT repeat tagline, hottest take, values, or quirks.

import { redis, haiku, getIndex, getProfile, saveProfile } from "@/lib/larvae";

const QUEUE_KEY = "lpp:catchphrase:queue";

export async function clearCatchphraseQueue() {
  await redis.del(QUEUE_KEY);
}

export async function getCatchphraseQueue(): Promise<string[]> {
  const raw = await redis.get<string | string[]>(QUEUE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function setCatchphraseQueue(wallets: string[]) {
  await redis.set(QUEUE_KEY, JSON.stringify(wallets));
}

function tooSimilar(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const nb = b.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(" ").filter((w) => w.length > 3));
  const wb = nb.split(" ").filter((w) => w.length > 3);
  if (wa.size === 0 || wb.length === 0) return false;
  const overlap = wb.filter((w) => wa.has(w)).length;
  return overlap / Math.max(wb.length, 1) >= 0.6;
}

export async function generateCatchphrase(wallet: string): Promise<string | null> {
  const p = await getProfile(wallet);
  if (!p) return null;

  const banned = [
    p.profile.tagline,
    p.profile.hottestTake || "",
    p.profile.summary,
    ...p.profile.values,
    ...p.profile.quirks,
  ].filter(Boolean);

  try {
    const raw = await haiku(
      `Invent ONE punchy catchphrase for a larva specimen card — like a character slogan they'd bark in a trailer.
Rules:
- Max 12 words. First person or imperative OK.
- In character for tone "${p.profile.tone}".
- Must feel NEW — not a rewrite of the tagline, summary, values, quirks, or hottest take.
- No quotes wrapping the whole line. Plain text only.
- Specific > generic ("ship" / "governance" alone is weak).`,
      `Name: ${p.profile.name}
Tagline (do NOT reuse): ${p.profile.tagline}
Hottest take (do NOT reuse): ${p.profile.hottestTake || "(none)"}
Values (do NOT reuse): ${p.profile.values.join("; ")}
Quirks: ${p.profile.quirks.join("; ")}
Summary: ${p.profile.summary}

Write the catchphrase now.`,
      60,
      1.0
    );
    let line = raw
      .replace(/^["']|["']$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);
    if (line.length < 8) return null;
    if (banned.some((b) => tooSimilar(line, b))) {
      // One retry with harder ban
      const raw2 = await haiku(
        `Same rules. Previous attempt was too close to existing card text. Invent a DIFFERENT catchphrase. Max 12 words. Plain text only.`,
        `Name: ${p.profile.name}\nTone: ${p.profile.tone}\nRejected: ${line}\nAvoid: ${banned.slice(0, 4).join(" | ")}`,
        50,
        1.05
      );
      line = raw2
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 100);
      if (line.length < 8 || banned.some((b) => tooSimilar(line, b))) return null;
    }

    p.profile.catchphrase = line;
    p.updatedAt = new Date().toISOString();
    await saveProfile(p);
    return line;
  } catch {
    return null;
  }
}

export async function seedCatchphraseQueue(force: boolean): Promise<number> {
  const index = await getIndex();
  const wallets: string[] = [];
  for (const e of index) {
    const w = e.wallet.toLowerCase();
    if (!force) {
      const p = await getProfile(w);
      if (p?.profile.catchphrase) continue;
    }
    wallets.push(w);
  }
  await setCatchphraseQueue(wallets);
  return wallets.length;
}
