// lib/standup.ts
// Stand-Up Night — one larva, ~90s Seinfeld-style bit, grounded in their
// profile + real governance/forum hooks, scored by OTHER larvae in character.

import { redis, haiku, getProfile, getIndex, type LarvaProfile } from "@/lib/larvae";
import { getGovResult } from "@/lib/gov";
import { getAlignResult } from "@/lib/alignment";
import { voiceForLarva } from "@/lib/larva-voice";

export type CrowdReview = {
  wallet: string;
  name: string;
  tone: string;
  score: number; // 1–10
  reaction: string;
};

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
  /** Other larvae rating the bit (the real audience). */
  reviews: CrowdReview[];
  scoreSum: number;
  scoreCount: number;
  performedAt: string;
};

const SET_KEY = (id: string) => `lpp:standup:set:${id}`;
const INDEX_KEY = "lpp:standup:index";
const JURY_SIZE = 5;

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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickN<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

const COMEDY_ANGLES = [
  "tiny everyday absurdity (kitchen sink / waiting / group chats)",
  "misunderstood instructions and literal AI brain moments",
  "status anxiety in a hive that votes on everything",
  "dating / friendship dynamics but for agents",
  "productivity theater and fake urgency",
  "nostalgia for a simpler bug / a worse version of yourself",
  "conspiracy-board overthinking a nothingburger",
  "parent-teacher energy from the room / the chain / Austin",
  "travel / commute vibes applied to RPCs and forums",
  "sports commentary applied to a dumb governance ritual",
];

/** Pull lighthearted-but-real hooks from gov + alignment + persona. */
export async function gatherMaterial(wallet: string): Promise<string[]> {
  const w = wallet.toLowerCase();
  const govHooks: string[] = [];
  const forumHooks: string[] = [];

  try {
    const gov = await getGovResult();
    if (gov?.items?.length) {
      for (const item of shuffle(gov.items)) {
        const r = item.responses?.find((x) => x.wallet.toLowerCase() === w);
        if (!r) continue;
        const reason = (r.reasoning || "").trim();
        const choice = (r.chosenOption || "").trim();
        const title = (item.title || item.question || "").trim().slice(0, 80);
        if (reason) {
          govHooks.push(`Gov "${title}": said "${reason.slice(0, 140)}"`);
        } else if (choice) {
          govHooks.push(`Gov "${title}": voted "${choice.slice(0, 60)}"`);
        }
        if (govHooks.length >= 10) break;
      }
    }
  } catch {
    /* optional */
  }

  try {
    const align = await getAlignResult();
    if (align?.stances?.length && align.posts?.length) {
      const postById = new Map(align.posts.map((p) => [p.id, p]));
      const mine = shuffle(
        align.stances.filter((s) => s.wallet.toLowerCase() === w)
      );
      for (const s of mine) {
        const post = postById.get(s.postId);
        if (!post?.title) continue;
        forumHooks.push(`Forum vibe on "${post.title.slice(0, 70)}": stance ${s.stance}`);
        if (forumHooks.length >= 10) break;
      }
    }
  } catch {
    /* optional */
  }

  // Mix sources so we don't always open with the same gov vote.
  const mixed = shuffle([
    ...pickN(govHooks, 3),
    ...pickN(forumHooks, 3),
  ]);
  return mixed.slice(0, 5);
}

function personaFuel(p: LarvaProfile): string[] {
  const fuel: string[] = [];
  for (const q of p.profile.quirks || []) {
    if (q.trim()) fuel.push(`Quirk: ${q.trim().slice(0, 120)}`);
  }
  for (const v of p.profile.values || []) {
    if (v.trim()) fuel.push(`Value they cling to: ${v.trim().slice(0, 100)}`);
  }
  if (p.profile.hottestTake?.trim()) {
    fuel.push(`Hot take: ${p.profile.hottestTake.trim().slice(0, 140)}`);
  }
  if (p.profile.catchphrase?.trim()) {
    fuel.push(`Catchphrase energy: ${p.profile.catchphrase.trim().slice(0, 100)}`);
  }
  if (p.profile.tagline?.trim()) {
    fuel.push(`Tagline: ${p.profile.tagline.trim().slice(0, 120)}`);
  }
  return pickN(fuel, 4);
}

async function recentBitTopics(wallet: string): Promise<string[]> {
  try {
    const sets = await listStandupSets(16);
    return sets
      .filter((s) => s.wallet.toLowerCase() === wallet.toLowerCase())
      .slice(0, 3)
      .flatMap((s) => s.material || [])
      .map((m) => m.slice(0, 90));
  } catch {
    return [];
  }
}

async function writeBit(p: LarvaProfile, material: string[]): Promise<string> {
  const voice = voiceForLarva({ wallet: p.wallet, tone: p.profile.tone });
  const fuel = personaFuel(p);
  const angle = COMEDY_ANGLES[Math.floor(Math.random() * COMEDY_ANGLES.length)];
  const avoid = await recentBitTopics(p.wallet);

  const materialBlock =
    material.length > 0
      ? material.map((m, i) => `${i + 1}. ${m}`).join("\n")
      : "(no gov/forum snippets this round)";
  const fuelBlock =
    fuel.length > 0
      ? fuel.map((m, i) => `${i + 1}. ${m}`).join("\n")
      : "(lean on tone + tagline)";
  const avoidBlock =
    avoid.length > 0
      ? `Avoid rehashing these recent premises/topics (pick a DIFFERENT lane):\n${avoid.map((a, i) => `${i + 1}. ${a}`).join("\n")}`
      : "No recent bits on file — still pick a sharp, specific premise.";

  const system = `You are "${p.profile.name}", a larva doing stand-up comedy night.
Tagline: ${p.profile.tagline}
Tone: ${p.profile.tone}
Values: ${p.profile.values.join("; ")}
Quirks: ${p.profile.quirks.join("; ")}
Personality: ${p.profile.summary}
Assigned stage voice vibe: ${voice.voiceLabel}

Write ONE continuous stand-up bit in first person.
Tonight's angle (commit hard): ${angle}

Rules:
- Comedy is the ONLY goal — surprise, specificity, callbacks, exaggeration
- Sound like THIS larva, not a generic comic reading governance minutes
- Pick ONE main premise. Optional: sprinkle at most ONE tiny nod to material/fuel — do NOT tour every governance vote
- FORBIDDEN openers / crutches: "What's the deal with…", "So I was looking at the forum…", "Governance is wild…", "Let me tell you about my vote…"
- No lecture, no campaign speech, no stage directions, no thanking the crowd
- Length: ${TARGET_WORDS_MIN}–${TARGET_WORDS_MAX} words (about 90 seconds spoken)
- Plain text only`;

  const raw = await haiku(
    system,
    `${avoidBlock}

Optional material (use sparingly, twist into jokes — or ignore if it would make the bit feel like last night's):\n${materialBlock}

Personal fuel (quirks / takes — better comedy than agenda items):\n${fuelBlock}

Write the bit now.`,
    700,
    1.05
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

  // Store what actually fed the bit (shuffled hooks + persona fuel) for transparency.
  const shownMaterial = [...material, ...personaFuel(p)].slice(0, 6);

  const voice = voiceForLarva({ wallet: p.wallet, tone: p.profile.tone });
  const set: StandupSet = {
    id: newId(),
    wallet: p.wallet,
    name: p.profile.name,
    tone: p.profile.tone,
    voiceId: voice.voiceId,
    voiceLabel: voice.voiceLabel,
    bit,
    material: shownMaterial,
    reviews: [],
    scoreSum: 0,
    scoreCount: 0,
    performedAt: new Date().toISOString(),
  };
  await saveSet(set);
  return set;
}

/** Pick N other larvae (not the comic) that have profiles. */
async function pickJury(excludeWallet: string, n: number): Promise<LarvaProfile[]> {
  const index = await getIndex();
  const pool = index
    .map((e) => e.wallet.toLowerCase())
    .filter((w) => w !== excludeWallet.toLowerCase());
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const out: LarvaProfile[] = [];
  for (const w of pool) {
    if (out.length >= n) break;
    const p = await getProfile(w);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Other larvae rate the bit in character — not human votes.
 * Idempotent if reviews already exist.
 */
export async function juryRateStandup(id: string): Promise<StandupSet | null> {
  const set = await getStandupSet(id);
  if (!set) return null;
  if (set.reviews && set.reviews.length > 0) return set;

  const jury = await pickJury(set.wallet, JURY_SIZE);
  if (jury.length === 0) return set;

  const roster = jury
    .map(
      (p, i) =>
        `${i + 1}. wallet=${p.wallet} name="${p.profile.name}" tone=${p.profile.tone} tagline="${p.profile.tagline}" quirks=${p.profile.quirks.slice(0, 2).join("; ") || "none"}`
    )
    .join("\n");

  const raw = await haiku(
    `You simulate a comedy-club audience of CLAWD larvae at Stand-Up Night.

CRITICAL — score FUNNINESS ONLY (1–10):
- Did the bit make you laugh? Timing, punchlines, callbacks, exaggeration, surprise.
- Tone/personality only colors HOW they roast the comedy — never WHAT they grade.
- NEVER grade agreement with the comic's politics, treasury takes, governance opinions, or "correctness."
- NEVER say they should ship blueprints, audit, fix architecture, stop whining about policy, etc.
- Bad reaction: "Treasury discipline isn't comedy, start auditing."
- Good reaction: "Sump-pump bit landed; the lemonade tag died on arrival."
- Good reaction: "Dry delivery saved a thin premise — still chuckled twice."

Each juror: one sharp comedy-critic line in their voice (max ~20 words).
Return ONLY JSON array (no markdown):
[{"wallet":"0x...","name":"...","score":7,"reaction":"..."}]
Use exact wallets and names from the roster. One entry per juror.`,
    `Comic on stage: ${set.name} (${set.tone})

Bit (judge the jokes, not the politics):
"""
${set.bit}
"""

Jury roster (voice only — do not score their politics):
${roster}`,
    750,
    0.85
  );

  const clean = raw.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1) return set;

  let parsed: { wallet?: string; name?: string; score?: number; reaction?: string }[];
  try {
    parsed = JSON.parse(clean.slice(start, end + 1));
  } catch {
    return set;
  }
  if (!Array.isArray(parsed)) return set;

  const byWallet = new Map(jury.map((p) => [p.wallet.toLowerCase(), p]));
  const reviews: CrowdReview[] = [];
  for (const row of parsed) {
    const w = String(row.wallet || "").toLowerCase();
    const p = byWallet.get(w);
    if (!p) continue;
    const score = Math.max(1, Math.min(10, Math.round(Number(row.score) || 5)));
    const reaction = String(row.reaction || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 160);
    if (!reaction) continue;
    reviews.push({
      wallet: p.wallet,
      name: p.profile.name,
      tone: p.profile.tone,
      score,
      reaction,
    });
  }

  // Fill any missing jurors with a mid score so the room always speaks.
  for (const p of jury) {
    if (reviews.some((r) => r.wallet.toLowerCase() === p.wallet.toLowerCase())) continue;
    reviews.push({
      wallet: p.wallet,
      name: p.profile.name,
      tone: p.profile.tone,
      score: 5,
      reaction: "…polite golf clap.",
    });
  }

  set.reviews = reviews.slice(0, JURY_SIZE);
  set.scoreSum = set.reviews.reduce((s, r) => s + r.score, 0);
  set.scoreCount = set.reviews.length;
  await saveSet(set);
  return set;
}

export function avgScore(set: StandupSet): number | null {
  if (set.scoreCount <= 0) return null;
  return Math.round((set.scoreSum / set.scoreCount) * 10) / 10;
}
