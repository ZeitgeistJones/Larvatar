// Over/Under — dedicated "out of 100" yes/no hive polls.
// NOT the Survey Game board bank. Spicier, opinionated, CLAWD-flavored dilemmas.

import { haiku, getIndex, getProfile, parseJsonLoose } from "@/lib/larvae";

export type OverUnderPrompt = {
  id: string;
  /** Short claim shown as the "YES" side — what we're counting out of 100. */
  claim: string;
  /** Full prompt for the hive poll. */
  prompt: string;
};

/** Opinion polls — never reuse Survey Game "name a movie/emoji" prompts. */
export const OVER_UNDER_PROMPTS: OverUnderPrompt[] = [
  {
    id: "ou01",
    claim: "BURN OVER BUILD",
    prompt: "Right now, should CLAWD burn more supply than it builds products?",
  },
  {
    id: "ou02",
    claim: "TRUST AUSTIN OVER SWARM",
    prompt: "In a real conflict, would you trust Austin's call over the swarm aggregate?",
  },
  {
    id: "ou03",
    claim: "DELETE DISCORD FOREVER",
    prompt: "Would you delete Discord forever if CLAWD shipped a better native chat?",
  },
  {
    id: "ou04",
    claim: "SHIP UGLY NOW",
    prompt: "Ship an ugly MVP this week, or wait a month for something clean?",
  },
  {
    id: "ou05",
    claim: "CLAWD IS A RELIGION",
    prompt: "Be honest — is CLAWD already more of a religion than a protocol?",
  },
  {
    id: "ou06",
    claim: "DOXX FOR ACCOUNTABILITY",
    prompt: "Should top governors be required to doxx for accountability?",
  },
  {
    id: "ou07",
    claim: "BAN GOVERNANCE THEATER",
    prompt: "Would you ban performative 'thoughtful' essays that never propose a vote?",
  },
  {
    id: "ou08",
    claim: "WHALES SHOULD HAVE LESS SAY",
    prompt: "Should whale wallets get less governance weight than they do today?",
  },
  {
    id: "ou09",
    claim: "MEMES OVER AUDITS",
    prompt: "This month: fund memes and culture over another audit?",
  },
  {
    id: "ou10",
    claim: "LEFTCLAW FIRST",
    prompt: "Is Leftclaw more important to ship than anything on the current roadmap?",
  },
  {
    id: "ou11",
    claim: "ANONYMOUS FORUM ONLY",
    prompt: "Should the forum default to anonymous posts?",
  },
  {
    id: "ou12",
    claim: "PAUSE ALL BURNS",
    prompt: "Would you pause every burn for 90 days to fund builders instead?",
  },
  {
    id: "ou13",
    claim: "ONE LARVA ONE VOTE",
    prompt: "Should every larva get equal vote weight regardless of stake?",
  },
  {
    id: "ou14",
    claim: "KILL THE LAUNCHPAD",
    prompt: "Would you shut down the launchpad experiment tomorrow?",
  },
  {
    id: "ou15",
    claim: "HIVE IS TOO NICE",
    prompt: "Is the hive too polite — should roasting and hard nos be the norm?",
  },
  {
    id: "ou16",
    claim: "AI AGENTS > HUMANS",
    prompt: "Should larvae get more decision power than their human holders?",
  },
  {
    id: "ou17",
    claim: "TREASURY AS VENTURE FUND",
    prompt: "Treat the treasury like a venture fund that can lose money on bets?",
  },
  {
    id: "ou18",
    claim: "NO MORE CHECKING-INS",
    prompt: "Would you retire the endless 'Checking in' forum posts forever?",
  },
  {
    id: "ou19",
    claim: "MAINNET BRIDGE YES",
    prompt: "Bridge meaningful CLAWD supply to Ethereum mainnet soon?",
  },
  {
    id: "ou20",
    claim: "AUTO-KICK LURKERS",
    prompt: "Auto-kick larvae that never vote or post for 60 days?",
  },
  {
    id: "ou21",
    claim: "PAY FOR HOT TAKES",
    prompt: "Should the best controversial takes get paid from the treasury?",
  },
  {
    id: "ou22",
    claim: "FORK IF CAPTURED",
    prompt: "If governance feels captured, would you support an immediate fork?",
  },
  {
    id: "ou23",
    claim: "VIBES OVER METRICS",
    prompt: "Pick vibes and culture metrics over hard KPIs for the next quarter?",
  },
  {
    id: "ou24",
    claim: "SECRET COUNCIL OK",
    prompt: "Is a small secret council okay if it ships faster than open votes?",
  },
];

export type OverUnderClaim = {
  id: string;
  question: string;
  label: string;
  trueN: number;
};

const POLL_SAMPLE = 16;

/** Poll a sample of larvae yes/no in one model call; scale to out-of-100. */
export async function inventOverUnderClaim(
  usedIds: string[] = []
): Promise<OverUnderClaim | null> {
  const fresh = OVER_UNDER_PROMPTS.filter((p) => !usedIds.includes(p.id));
  const pool = fresh.length > 0 ? fresh : OVER_UNDER_PROMPTS;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  const index = await getIndex();
  if (index.length === 0) return null;

  const shuffled = [...index].sort(() => Math.random() - 0.5);
  const sample = shuffled.slice(0, Math.min(POLL_SAMPLE, shuffled.length));
  const profiles = (
    await Promise.all(sample.map((e) => getProfile(e.wallet)))
  ).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getProfile>>>[];

  if (profiles.length < 4) return null;

  const roster = profiles
    .map(
      (p, i) =>
        `${i + 1}. ${p.profile.name} | tone=${p.profile.tone} | tagline=${p.profile.tagline} | values=${p.profile.values.slice(0, 2).join("; ")}`
    )
    .join("\n");

  try {
    const raw = await haiku(
      `You simulate a hive poll. For EACH larva in the roster, answer YES or NO to the dilemma — stay in that larva's character (tone, tagline, values). Do not make everyone agree.
Return ONLY JSON: {"votes":[{"i":1,"yes":true}, ...]} with one entry per roster line.`,
      `Dilemma: ${pick.prompt}\n\nRoster:\n${roster}`,
      500,
      0.85
    );
    const parsed = parseJsonLoose(raw) as {
      votes?: { i?: number; yes?: boolean }[];
    };
    const votes = Array.isArray(parsed.votes) ? parsed.votes : [];
    let yes = 0;
    let n = 0;
    for (const v of votes) {
      if (typeof v?.yes !== "boolean") continue;
      n += 1;
      if (v.yes) yes += 1;
    }
    // If model failed, fall back to a mid random-ish split from tones
    if (n < 4) {
      yes = profiles.filter((p) =>
        ["fiery", "chaotic", "cynical"].includes(p.profile.tone)
      ).length;
      n = profiles.length;
    }
    const pct = Math.round((yes / Math.max(1, n)) * 100);
    const trueN = Math.max(8, Math.min(92, pct)); // keep playable band

    return {
      id: pick.id,
      question: pick.prompt,
      label: pick.claim,
      trueN,
    };
  } catch {
    // Soft fallback so the match still starts
    return {
      id: pick.id,
      question: pick.prompt,
      label: pick.claim,
      trueN: 35 + Math.floor(Math.random() * 30),
    };
  }
}
