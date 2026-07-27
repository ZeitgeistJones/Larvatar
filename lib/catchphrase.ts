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
    const toneTips: Record<string, string> = {
      fiery: "hotheaded one-liners, spicy threats, comic rage",
      chill: "deadpan cool, lazy genius, shrug-as-punchline",
      analytical: "dry nerd jokes, spreadsheet roast, clinical absurdity",
      chaotic: "non sequiturs, cursed energy, gleeful nonsense with a point",
      earnest: "sincere but accidentally funny, golden-retriever intensity",
      cynical: "side-eye sarcasm, world-weary burns, dry doom",
    };
    const humorLane = toneTips[p.profile.tone] || "sharp character comedy";

    const raw = await haiku(
      `You write ONE spoken catchphrase for a larva — a funny character slogan they'd drop into a mic.
Goal: make someone SMIRK. Stay 100% in character. Not a manifesto.

Tone: ${p.profile.tone} → lean into ${humorLane}.

Rules:
- Max 14 words. Sound spoken aloud (ElevenLabs).
- Wit > slogans. Prefer metaphor, misdirect, callback, or roast.
- Ground it in THIS larva's quirks/obsessions — specific, weird, memorable.
- FORBIDDEN: corporate slogans, TED-talk lines, "ship or die", "governance theater" clichés, rewriting the tagline/take/values.
- No wrapping quotes. Plain text only.`,
      `Name: ${p.profile.name}
Tagline (do NOT reuse): ${p.profile.tagline}
Hottest take (do NOT reuse): ${p.profile.hottestTake || "(none)"}
Values (avoid echoing): ${p.profile.values.join("; ")}
Quirks (mine these for comedy): ${p.profile.quirks.join("; ") || "(none)"}
Summary: ${p.profile.summary}

Write the funny catchphrase now.`,
      70,
      1.15
    );
    let line = raw
      .replace(/^["']|["']$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 110);
    if (line.length < 8) return null;
    if (banned.some((b) => tooSimilar(line, b))) {
      const raw2 = await haiku(
        `Funniest DIFFERENT catchphrase for tone ${p.profile.tone}. Previous was too close to card text or too dull.
Max 14 words. Specific quirk comedy. No governance-theater clichés. Plain text only.`,
        `Name: ${p.profile.name}
Quirks: ${p.profile.quirks.join("; ")}
Rejected: ${line}
Avoid: ${banned.slice(0, 4).join(" | ")}`,
        60,
        1.2
      );
      line = raw2
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 110);
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
