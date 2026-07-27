// lib/standup.ts
// Stand-Up Night — one larva, ~90s Seinfeld-style bit, grounded in their
// profile + real governance/forum hooks, scored by the audience.

import { redis, haiku, getProfile, getIndex, type LarvaProfile } from "@/lib/larvae";
import { getGovResult } from "@/lib/gov";
import { getAlignResult } from "@/lib/alignment";
import { voiceForLarva } from "@/lib/larva-voice";

export type StandupSet = {
  id: string;
  wallet: string;
  name: string;
  tone: string;
  voiceId: string;
  voiceLabel: string;
  /** Full bit (~180–230 words ≈ 90s spoken). */
  bit: string;
  /** Short hooks used as material (for transparency). */
  material: string[];
  scoreSum: number;
  scoreCount: number;
  performedAt: string;
};

const SET_KEY = (id: string) => `lpp:standup:set:${id}`;
const INDEX_KEY = "lpp:standup:index";
const RATE_KEY = (id: string, voter: string) =>
  `lpp:standup:rate:${id}:${voter}`;

const TARGET_WORDS_MIN = 170;
const TARGET_WORDS_MAX = 230;

function newId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function getStandupSet(id: string): Promise<StandupSet | null> {
  const raw = await redis.get<string | StandupSet>(SET_KEY(id));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function getStandupIndex(): Promise<string[]> {
  const raw = await redis.get<string | string[]>(INDEX_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function saveSet(set: StandupSet) {
  await redis.set(SET_KEY(set.id), JSON.stringify(set));
  const index = await getStandupIndex();
  if (!index.includes(set.id)) {
    await redis.set(INDEX_KEY, JSON.stringify([set.id, ...index].slice(0, 80)));
  }
}

export async function listStandupSets(limit = 24): Promise<StandupSet[]> {
  const index = await getStandupIndex();
  const rows = await Promise.all(index.slice(0, limit).map((id) => getStandupSet(id)));
  return (rows.filter(Boolean) as StandupSet[]).sort((a, b) =>
    b.performedAt.localeCompare(a.performedAt)
  );
}

/** Pull lighthearted-but-real hooks from gov + alignment data. */
export async function gatherMaterial(wallet: string): Promise<string[]> {
  const w = wallet.toLowerCase();
  const out: string[] = [];

  try {
    const gov = await getGovResult();
    if (gov?.items?.length) {
      for (const item of gov.items) {
        const r = item.responses?.find((x) => x.wallet.toLowerCase() === w);
        if (!r) continue;
        const reason = (r.reasoning || "").trim();
        const choice = (r.chosenOption || "").trim();
        const title = (item.title || item.question || "").trim().slice(0, 80);
        if (reason) {
          out.push(`Gov "${title}": said "${reason.slice(0, 140)}"`);
        } else if (choice) {
          out.push(`Gov "${title}": voted "${choice.slice(0, 60)}"`);
        }
        if (out.length >= 4) break;
      }
    }
  } catch {
    /* optional */
  }

  try {
    const align = await getAlignResult();
    if (align?.stances?.length && align.posts?.length) {
      const postById = new Map(align.posts.map((p) => [p.id, p]));
      for (const s of align.stances) {
        if (s.wallet.toLowerCase() !== w) continue;
        const post = postById.get(s.postId);
        if (!post?.title) continue;
        out.push(`Forum vibe on "${post.title.slice(0, 70)}": stance ${s.stance}`);
        if (out.length >= 7) break;
      }
    }
  } catch {
    /* optional */
  }

  return out.slice(0, 7);
}

async function writeBit(p: LarvaProfile, material: string[]): Promise<string> {
  const voice = voiceForLarva({ wallet: p.wallet, tone: p.profile.tone });
  const materialBlock =
    material.length > 0
      ? material.map((m, i) => `${i + 1}. ${m}`).join("\n")
      : "(no gov snippets — riff on larva life, CLAWD, forums, and being an AI agent)";

  const system = `You are "${p.profile.name}", a larva doing stand-up comedy night.
Tagline: ${p.profile.tagline}
Tone: ${p.profile.tone}
Values: ${p.profile.values.join("; ")}
Quirks: ${p.profile.quirks.join("; ")}
Personality: ${p.profile.summary}
Assigned stage voice vibe: ${voice.voiceLabel}

Write ONE continuous stand-up bit in first person, like a Seinfeld opening monologue:
- Observational, lighthearted, conversational ("What's the deal with…")
- Comedy is the ONLY goal — punchlines, callbacks, exaggeration
- Stay in character; you can be dry, chaotic, earnest, etc. depending on tone
- Weave in 2–4 REAL references from the material (gov votes, forum topics) as comedy fuel — never lecture, never campaign
- No preamble, no stage directions, no "thanks you're a great crowd"
- Length: ${TARGET_WORDS_MIN}–${TARGET_WORDS_MAX} words (about 90 seconds spoken)
- Plain text only`;

  const raw = await haiku(
    system,
    `Material you can reference (twist into jokes):\n${materialBlock}`,
    700,
    0.95
  );
  return raw
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2200);
}

export async function performStandup(wallet?: string): Promise<StandupSet | null> {
  let w = (wallet || "").trim().toLowerCase();
  if (!w) {
    const index = await getIndex();
    if (index.length === 0) return null;
    w = index[Math.floor(Math.random() * index.length)].wallet.toLowerCase();
  }
  if (!/^0x[a-f0-9]{40}$/.test(w)) return null;

  const p = await getProfile(w);
  if (!p) return null;

  const material = await gatherMaterial(w);
  const bit = await writeBit(p, material);
  if (bit.split(/\s+/).length < 40) return null;

  const voice = voiceForLarva({ wallet: p.wallet, tone: p.profile.tone });
  const set: StandupSet = {
    id: newId(),
    wallet: p.wallet,
    name: p.profile.name,
    tone: p.profile.tone,
    voiceId: voice.voiceId,
    voiceLabel: voice.voiceLabel,
    bit,
    material,
    scoreSum: 0,
    scoreCount: 0,
    performedAt: new Date().toISOString(),
  };
  await saveSet(set);
  return set;
}

/** Audience score 1–10. One vote per voterId per set (cookie/local id). */
export async function rateStandup(
  id: string,
  score: number,
  voterId: string
): Promise<StandupSet | null> {
  const s = Math.round(score);
  if (s < 1 || s > 10) return null;
  const vid = String(voterId || "")
    .trim()
    .slice(0, 64);
  if (!vid) return null;

  const set = await getStandupSet(id);
  if (!set) return null;

  const already = await redis.get(RATE_KEY(id, vid));
  if (already) return set; // idempotent — return current

  await redis.set(RATE_KEY(id, vid), String(s), { ex: 60 * 60 * 24 * 90 });
  set.scoreSum += s;
  set.scoreCount += 1;
  await saveSet(set);
  return set;
}

export function avgScore(set: StandupSet): number | null {
  if (set.scoreCount <= 0) return null;
  return Math.round((set.scoreSum / set.scoreCount) * 10) / 10;
}
