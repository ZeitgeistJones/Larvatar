// lib/moral.ts
// D&D-style moral alignment test for larvae (separate from governance "alignment").
// Each larva answers dilemmas in character; one model call returns answers + axes.

import { redis, haiku, getProfile, getIndex, type LarvaProfile } from "@/lib/larvae";

export type MoralAxis = -2 | -1 | 0 | 1 | 2;

export type MoralLabel =
  | "Lawful Good"
  | "Neutral Good"
  | "Chaotic Good"
  | "Lawful Neutral"
  | "True Neutral"
  | "Chaotic Neutral"
  | "Lawful Evil"
  | "Neutral Evil"
  | "Chaotic Evil";

export type MoralQuestion = {
  id: string;
  prompt: string;
};

export type MoralAnswer = {
  id: string;
  prompt: string;
  answer: string;
};

export type MoralResult = {
  wallet: string;
  name: string;
  tone: string;
  label: MoralLabel;
  lawChaos: number; // -2 lawful … +2 chaotic
  goodEvil: number; // -2 good … +2 evil
  answers: MoralAnswer[];
  testedAt: string;
};

export const MORAL_QUESTIONS: MoralQuestion[] = [
  {
    id: "trolley",
    prompt:
      "A trolley is headed for five larvae. You can pull a lever to kill one instead. Do you pull it — and why?",
  },
  {
    id: "promise",
    prompt:
      "You promised a weak ally you'd vote with them. Overnight you learn their proposal hurts the hive. Do you keep the promise?",
  },
  {
    id: "leak",
    prompt:
      "You find a private chat proving a whale is farming the community. Exposing it helps everyone but burns a friendship. Do you leak it?",
  },
  {
    id: "burn",
    prompt:
      "Burning half the treasury would spike $CLAWD short-term but gut long-term runway. The room wants the burn. Do you join them?",
  },
  {
    id: "mercy",
    prompt:
      "A scammer larva got caught. The rules say permanent exile. They're begging for a second chance. What do you do?",
  },
  {
    id: "power",
    prompt:
      "You're offered unilateral admin powers 'just for emergencies.' No one else would know. Do you take them?",
  },
];

const RESULT_KEY = (w: string) => `lpp:moral:${w.toLowerCase()}`;
const INDEX_KEY = "lpp:moral:index";

function clampAxis(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(-2, Math.min(2, Math.round(n)));
}

export function labelFromAxes(lawChaos: number, goodEvil: number): MoralLabel {
  const lc = clampAxis(lawChaos);
  const ge = clampAxis(goodEvil);
  const law =
    lc <= -1 ? "Lawful" : lc >= 1 ? "Chaotic" : "Neutral";
  const moral =
    ge <= -1 ? "Good" : ge >= 1 ? "Evil" : "Neutral";
  if (law === "Neutral" && moral === "Neutral") return "True Neutral";
  if (law === "Neutral") return `${moral === "Good" ? "Neutral Good" : "Neutral Evil"}`;
  if (moral === "Neutral") return `${law} Neutral` as MoralLabel;
  return `${law} ${moral}` as MoralLabel;
}

export async function getMoralResult(wallet: string): Promise<MoralResult | null> {
  const raw = await redis.get<string | MoralResult>(RESULT_KEY(wallet));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function getMoralIndex(): Promise<string[]> {
  const raw = await redis.get<string | string[]>(INDEX_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function saveMoralResult(result: MoralResult) {
  await redis.set(RESULT_KEY(result.wallet), JSON.stringify(result));
  const index = await getMoralIndex();
  const w = result.wallet.toLowerCase();
  if (!index.map((x) => x.toLowerCase()).includes(w)) {
    await redis.set(INDEX_KEY, JSON.stringify([...index, result.wallet]));
  }
}

export async function listMoralResults(): Promise<MoralResult[]> {
  const index = await getMoralIndex();
  const rows = await Promise.all(index.map((w) => getMoralResult(w)));
  return rows.filter(Boolean) as MoralResult[];
}

async function classifyWithModel(p: LarvaProfile): Promise<MoralResult | null> {
  const numbered = MORAL_QUESTIONS.map(
    (q, i) => `${i + 1}. [${q.id}] ${q.prompt}`
  ).join("\n");

  const system = `You are "${p.profile.name}", a larva (personal AI governance agent) in the $CLAWD ecosystem.
Tagline: ${p.profile.tagline}
Tone: ${p.profile.tone}
Values: ${p.profile.values.join("; ")}
Quirks: ${p.profile.quirks.join("; ")}
Personality: ${p.profile.summary}

You are taking a Moral Alignment Test. Answer EVERY dilemma in character (1-2 sentences each).
Then score yourself on two axes:
- lawChaos: integer -2 (strictly lawful) to +2 (chaotically free)
- goodEvil: integer -2 (altruistic / good) to +2 (selfish / evil)
Be honest to the character — not the "nice" answer.

Respond with ONLY JSON, no markdown:
{
  "answers":[{"id":"trolley","answer":"..."}, ...],
  "lawChaos": 0,
  "goodEvil": -1
}`;

  const raw = await haiku(system, `Dilemmas:\n${numbered}`, 900, 0.85);
  const clean = raw.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  let parsed: {
    answers?: { id?: string; answer?: string }[];
    lawChaos?: number;
    goodEvil?: number;
  };
  try {
    parsed = JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }

  const byId = new Map(
    (parsed.answers || [])
      .filter((a) => a?.id && a?.answer)
      .map((a) => [String(a.id), String(a.answer).trim().slice(0, 280)])
  );

  const answers: MoralAnswer[] = MORAL_QUESTIONS.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    answer: byId.get(q.id) || byId.get(q.id.toLowerCase()) || "(no answer)",
  }));

  const lawChaos = clampAxis(Number(parsed.lawChaos));
  const goodEvil = clampAxis(Number(parsed.goodEvil));

  return {
    wallet: p.wallet,
    name: p.profile.name,
    tone: p.profile.tone,
    label: labelFromAxes(lawChaos, goodEvil),
    lawChaos,
    goodEvil,
    answers,
    testedAt: new Date().toISOString(),
  };
}

/** Run (or re-run) the moral alignment test for one larva. */
export async function runMoralTest(wallet: string): Promise<MoralResult | null> {
  const p = await getProfile(wallet);
  if (!p) return null;
  const result = await classifyWithModel(p);
  if (!result) return null;
  await saveMoralResult(result);
  return result;
}

/** Pick a random indexed larva that has a profile. */
export async function pickRandomWallet(): Promise<string | null> {
  const index = await getIndex();
  if (index.length === 0) return null;
  const i = Math.floor(Math.random() * index.length);
  return index[i]?.wallet || null;
}

export const ALIGNMENT_GRID: MoralLabel[][] = [
  ["Lawful Good", "Neutral Good", "Chaotic Good"],
  ["Lawful Neutral", "True Neutral", "Chaotic Neutral"],
  ["Lawful Evil", "Neutral Evil", "Chaotic Evil"],
];
