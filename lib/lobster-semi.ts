// lib/lobster-semi.ts
//
// The semifinal: ~101 nominees → 12 finalists.
//
// Why this is shaped differently from the heats.
//
// In the heats, groups did NOT overlap — that was the whole point, so nothing
// could be nominated twice and no larva's options depended on who ran first.
// That works when there are more candidates than larvae.
//
// Here there are fewer candidates (101) than larvae (~124), so non-overlapping
// is impossible and also wrong: a nominee seen by exactly one larva would
// advance or die on a single opinion. Instead every nominee is dealt to about
// ten different larvae, so its result is an aggregate rather than a coin flip.
//
// Each larva ranks its whole slate and its top choice counts as a vote.
// Advancement is by first-place votes, tie-broken by mean rank — a nominee
// with no first-place votes across ten viewers genuinely lost, and mean rank
// separates the near-misses from the also-rans underneath them.

import {
  CLAWD_BRIEF,
  K,
  QuotaExhausted,
  callGemini,
  imagePart,
  jget,
  jset,
  parseJsonObject,
  shuffleSeeded,
  type Candidate,
  type Part,
} from "@/lib/lobsters";
import { getIndex, getProfile } from "@/lib/larvae";

/** How many nominees each larva judges in the semifinal. */
const SLATE_SIZE = Number(process.env.LOBSTER_SLATE_SIZE || 8);
/** How many survive to the final. */
export const FINALIST_COUNT = Number(process.env.LOBSTER_FINALISTS || 12);

export const NOMINATE_MODEL =
  process.env.GEMINI_LOBSTER_VOTE_MODEL || process.env.GEMINI_MODEL || "gemini-3.6-flash";

export type Slate = { wallet: string; ids: number[] };

export type SemiBallot = {
  wallet: string;
  name: string;
  pick: number;
  reason: string;
  /** Full ordering of this larva's slate, best first. */
  order: number[];
};

export type SemiResult = {
  id: number;
  votes: number;
  views: number;
  meanRank: number;
};

// ───────────────────────────────────────────────────────────────────────────
// Drawing the slates
// ───────────────────────────────────────────────────────────────────────────

/**
 * Deal every nominee to roughly the same number of larvae.
 *
 * Built by laying the nominee list end to end enough times to fill all the
 * slates, shuffling each pass separately, then dealing sequentially. That
 * keeps coverage even — no nominee gets seen twice as often as another — and
 * avoids the same pair of nominees always appearing together.
 */
export async function drawSlates(): Promise<{
  slates: number;
  slateSize: number;
  viewsEach: number;
}> {
  const results = await jget<{ nominees?: Candidate[] } | null>(K.results, null);
  const nominees = results?.nominees || [];
  const index = await getIndex();
  const wallets = index.map((e: { wallet: string }) => e.wallet.toLowerCase());

  if (nominees.length === 0 || wallets.length === 0) {
    await jset(K.semiSlates, []);
    await jset(K.semiQ, []);
    return { slates: 0, slateSize: 0, viewsEach: 0 };
  }

  const slateSize = Math.min(SLATE_SIZE, nominees.length);
  const needed = wallets.length * slateSize;
  const passes = Math.ceil(needed / nominees.length);

  const pool: number[] = [];
  for (let p = 0; p < passes; p++) {
    for (const c of shuffleSeeded(nominees, `semi:${p}:${nominees.length}`)) {
      pool.push(c.id);
    }
  }

  const slates: Slate[] = [];
  let cursor = 0;
  for (const wallet of wallets) {
    const ids: number[] = [];
    // Skip duplicates within one slate — judging the same photo twice is noise.
    while (ids.length < slateSize && cursor < pool.length) {
      const id = pool[cursor++];
      if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length >= 2) slates.push({ wallet, ids });
  }

  await jset(K.semiSlates, slates);
  await jset(K.semiQ, slates.map((s) => s.wallet));
  await jset(K.semiBallots, []);

  return {
    slates: slates.length,
    slateSize,
    viewsEach: Math.round((slates.length * slateSize) / nominees.length),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Voting
// ───────────────────────────────────────────────────────────────────────────

const SEMI_SYSTEM = `You are a single larva in the semifinal. Every lobster in front of you has already been nominated by another larva and every one of them is red enough to qualify. The colour question is settled — do not spend your reasoning on it.

${CLAWD_BRIEF}

What decides it now is a tension, and the best answer resolves both sides:

It might LOOK like Clawd — front-facing and squared up, composed rather than fleeing, a claw extended as though holding something, faintly ridiculous dignity.

Or it might BE clawdbotatg — working rather than posing, plain rather than prize-winning, scarred or barnacled or missing a claw, unglamorous and still going.

These pull against each other. A lobster that only poses is a mascot with no work behind it. A lobster that only labours is invisible. Say which side you weighted and why, in your own voice — if your reasoning could have been written by any other larva, it is the wrong reasoning.

Rank EVERY image, best first, and never refer to a candidate by its image number in your prose. Talk about the animal.

Reply with ONLY: {"ranked":[<image numbers, best first, each exactly once>],"reason":"<max 40 words on why your top choice won, in your voice>"}`;

export async function semiSlice(
  deadline: number,
  maxItems = Infinity
): Promise<{ done: boolean; count: number; failed: number; quota: boolean; lastError?: string }> {
  const queue = await jget<string[]>(K.semiQ, []);
  const slates = await jget<Slate[]>(K.semiSlates, []);
  const ballots = await jget<SemiBallot[]>(K.semiBallots, []);
  const results = await jget<{ nominees?: Candidate[] } | null>(K.results, null);

  const byWallet = new Map(slates.map((s) => [s.wallet, s]));
  const byId = new Map((results?.nominees || []).map((c) => [c.id, c]));

  let count = 0;
  let failed = 0;
  let attempted = 0;
  let lastError: string | undefined;

  while (queue.length > 0 && Date.now() < deadline && attempted < maxItems) {
    const wallet = queue.shift()!;
    attempted += 1;

    const slate = byWallet.get(wallet);
    const profile = await getProfile(wallet);
    if (!slate || !profile) {
      await jset(K.semiQ, queue);
      continue;
    }

    const parts: Part[] = [
      {
        text:
          `You are ${profile.profile.name}. ${profile.profile.tagline}\n` +
          `Tone: ${profile.profile.tone}\n` +
          `Values: ${profile.profile.values.join("; ")}\n` +
          `Quirks: ${profile.profile.quirks.join("; ")}\n` +
          `${profile.profile.summary}`,
      },
    ];

    const present: Candidate[] = [];
    for (const id of slate.ids) {
      if (Date.now() >= deadline) break;
      const c = byId.get(id);
      if (!c) continue;
      const img = await imagePart(c.photo);
      if (!img) continue;
      parts.push({ text: `Image ${present.length + 1} — ${c.species}:` });
      parts.push(img);
      present.push(c);
    }

    if (present.length < 2) {
      await jset(K.semiQ, [...queue, wallet]);
      failed += 1;
      continue;
    }

    parts.push({ text: `Rank all ${present.length}. JSON only.` });

    try {
      const raw = await callGemini(NOMINATE_MODEL, SEMI_SYSTEM, parts, 700, 1.0);
      const obj = parseJsonObject(raw);

      const seen = new Set<number>();
      const order: number[] = [];
      for (const n of Array.isArray(obj?.ranked) ? obj.ranked : []) {
        const c = present[Number(n) - 1];
        if (!c || seen.has(c.id)) continue;
        seen.add(c.id);
        order.push(c.id);
      }
      // Anything the model dropped is placed at the bottom, not discarded —
      // otherwise a skipped candidate silently loses its view count.
      for (const c of present) if (!seen.has(c.id)) order.push(c.id);

      if (order.length >= 2) {
        ballots.push({
          wallet,
          name: profile.profile.name,
          pick: order[0],
          reason: String(obj.reason || "").slice(0, 300),
          order,
        });
        count += 1;
      } else {
        failed += 1;
      }
    } catch (e) {
      if (e instanceof QuotaExhausted) {
        await jset(K.semiQ, [wallet, ...queue]);
        await jset(K.semiBallots, ballots);
        return { done: false, count, failed, quota: true, lastError: String(e).slice(0, 300) };
      }
      failed += 1;
      lastError = lastError || String(e).slice(0, 300);
    }

    await jset(K.semiQ, queue);
    await jset(K.semiBallots, ballots);
  }

  return { done: queue.length === 0, count, failed, quota: false, lastError };
}

// ───────────────────────────────────────────────────────────────────────────
// Tally
// ───────────────────────────────────────────────────────────────────────────

export async function tallySemi(): Promise<SemiResult[]> {
  const ballots = await jget<SemiBallot[]>(K.semiBallots, []);
  const acc = new Map<number, { votes: number; views: number; rankSum: number }>();

  for (const b of ballots) {
    b.order.forEach((id, i) => {
      const row = acc.get(id) || { votes: 0, views: 0, rankSum: 0 };
      row.views += 1;
      // Normalised so a slate of 8 and a short slate of 5 are comparable.
      row.rankSum += (i + 1) / b.order.length;
      if (i === 0) row.votes += 1;
      acc.set(id, row);
    });
  }

  const rows: SemiResult[] = [...acc.entries()].map(([id, r]) => ({
    id,
    votes: r.votes,
    views: r.views,
    meanRank: r.views > 0 ? r.rankSum / r.views : 1,
  }));

  rows.sort((a, b) => b.votes - a.votes || a.meanRank - b.meanRank);
  await jset(K.semiResults, rows);
  return rows;
}

export async function getSemiResults(): Promise<SemiResult[]> {
  return jget<SemiResult[]>(K.semiResults, []);
}

export async function getSemiBallots(): Promise<SemiBallot[]> {
  return jget<SemiBallot[]>(K.semiBallots, []);
}

/** Freeze the top N so the final can't shift underneath itself. */
export async function freezeFinalists(): Promise<Candidate[]> {
  const rows = await tallySemi();
  const results = await jget<{ nominees?: Candidate[] } | null>(K.results, null);
  const byId = new Map((results?.nominees || []).map((c) => [c.id, c]));

  const finalists = rows
    .slice(0, FINALIST_COUNT)
    .map((r) => byId.get(r.id))
    .filter(Boolean) as Candidate[];

  await jset(K.finalists, finalists);
  return finalists;
}

export async function getFinalists(): Promise<Candidate[]> {
  return jget<Candidate[]>(K.finalists, []);
}
