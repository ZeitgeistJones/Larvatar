// lib/lobster-final.ts
//
// The endgame: 12 → 5 → 1.
//
//   dossier  Wikipedia extract fetched per finalist species (free, no AI)
//   ask      every larva asks ONE question about ONE finalist, in character
//   answer   answered ONLY from the dossier text, batched by species
//   f1       every larva votes on the 12 → cut to 5
//   f2       every larva votes on the 5 → champion
//   verdict  one synthesis per finalist explaining why it placed where it did
//
// Two deliberate asymmetries between the cuts:
//
// * f1 is SEEDED. Score is half the finalist's semifinal record, half the live
//   vote. A nominee that went 9/10 in the semifinal should not be knocked out
//   by one unlucky Wikipedia answer, and real tournaments protect seeds early
//   for exactly that reason.
//
// * f2 carries NOTHING forward. Seeds get protection early and then have to
//   win on the day. If the 50% weight persisted to the last round the top seed
//   would be mathematically unbeatable, which deletes the drama the two-stage
//   structure exists to create.
//
// The press conference sits BEFORE the first cut on purpose. Put it after and
// the 12 → 5 vote has no information the semifinal didn't already have, so it
// would just reproduce the semifinal ranking at full cost.
//
// Answers are grounded in fetched text and nothing else. Asked "does this one
// live alone?", an ungrounded model invents plausible marine biology, which
// then gets quoted as fact in the voting. "Not in the record" is the correct
// answer when the article doesn't cover it — and a larva pushing on something
// nobody has documented is worth reading in its own right.

import {
  CLAWD_BRIEF,
  K,
  QuotaExhausted,
  UA,
  callGemini,
  imagePart,
  jget,
  jset,
  parseJsonObject,
  shuffleSeeded,
  type Candidate,
  type Part,
} from "@/lib/lobsters";
import { getFinalists, getSemiResults } from "@/lib/lobster-semi";
import { getIndex, getProfile } from "@/lib/larvae";

const MODEL =
  process.env.GEMINI_LOBSTER_VOTE_MODEL || process.env.GEMINI_MODEL || "gemini-3.6-flash";

/** How many survive the first cut. */
export const CUT_TO = Number(process.env.LOBSTER_CUT_TO || 5);
/** How much of the semifinal record carries into the first cut. */
const SEED_WEIGHT = Number(process.env.LOBSTER_SEED_WEIGHT || 0.5);
const ANSWER_BATCH = 5;

const NL = String.fromCharCode(10);
const GAP = NL + NL;

export type QA = {
  wallet: string;
  name: string;
  target: number;
  question: string;
  answer?: string;
  grounded?: boolean;
};

export type FinalBallot = {
  stage: 1 | 2;
  wallet: string;
  name: string;
  pick: number;
  reason: string;
  /** Set in stage 2 when this larva's stage-1 choice was eliminated. */
  switchedFrom?: number;
};

export type Standing = {
  id: number;
  liveVotes: number;
  seedRate: number;
  liveNorm: number;
  seedNorm: number;
  score: number;
};

export type Outcome = {
  done: boolean;
  count: number;
  failed: number;
  quota: boolean;
  lastError?: string;
};

// ───────────────────────────────────────────────────────────────────────────
// Dossiers
// ───────────────────────────────────────────────────────────────────────────

const WIKI_API = "https://en.wikipedia.org/w/api.php";

async function wikiJson(params: Record<string, string>): Promise<any | null> {
  const qs = new URLSearchParams({ format: "json", origin: "*", ...params });
  try {
    const res = await fetch(`${WIKI_API}?${qs}`, {
      headers: { "user-agent": UA, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchExtract(title: string): Promise<string | null> {
  const data = await wikiJson({
    action: "query",
    prop: "extracts",
    explaintext: "1",
    redirects: "1",
    titles: title,
  });
  const pages = data?.query?.pages || {};
  for (const key of Object.keys(pages)) {
    const text = pages[key]?.extract;
    if (typeof text === "string" && text.trim().length > 200) return text.slice(0, 9000);
  }
  return null;
}

export async function getDossiers(): Promise<Record<string, string>> {
  return jget<Record<string, string>>(K.dossiers, {});
}

/** One dossier per finalist species. Returns how many were fetched this slice. */
export async function buildDossiers(deadline: number): Promise<number> {
  const finalists = await getFinalists();
  const dossiers = await getDossiers();
  let built = 0;

  for (const f of finalists) {
    if (Date.now() >= deadline) break;
    const key = f.sciName || f.species;
    if (dossiers[key] !== undefined) continue;

    let text: string | null = null;

    // iNaturalist usually hands us the article URL outright.
    if (f.wiki) {
      const title = decodeURIComponent(f.wiki.split("/wiki/")[1] || "").replace(/_/g, " ");
      if (title) text = await fetchExtract(title);
    }
    if (!text && f.sciName) text = await fetchExtract(f.sciName);
    if (!text) {
      const found = await wikiJson({
        action: "query",
        list: "search",
        srsearch: f.sciName || f.species,
        srlimit: "1",
      });
      const hit = found?.query?.search?.[0]?.title;
      if (hit) text = await fetchExtract(hit);
    }

    dossiers[key] = text || "";
    built += 1;
    await jset(K.dossiers, dossiers);
  }

  return built;
}

// ───────────────────────────────────────────────────────────────────────────
// Press conference — ask
// ───────────────────────────────────────────────────────────────────────────

export async function seedAskQueue(): Promise<number> {
  const index = await getIndex();
  const asked = new Set((await jget<QA[]>(K.questions, [])).map((q) => q.wallet));
  const queue = index
    .map((e: { wallet: string }) => e.wallet.toLowerCase())
    .filter((w: string) => !asked.has(w));
  await jset(K.askQ, queue);
  return queue.length;
}

const ASK_SYSTEM = `You are a single larva at a press conference. Twelve real lobsters are finalists to be named the animal that best represents clawdbotatg. All of them are red enough to qualify — that question is settled.

${CLAWD_BRIEF}

Ask ONE question about ONE of them. It must be something only YOU would think to ask, given your values and quirks — if any other larva could plausibly have asked it, it is the wrong question. Ask about the animal's life, behaviour, habitat, or biology. Not about the photograph.

Never refer to a candidate by its image number in your question. Name the animal.

Reply with ONLY: {"target": <image number>, "question": "<max 20 words>"}`;

export async function askSlice(deadline: number, maxItems = Infinity): Promise<Outcome> {
  const queue = await jget<string[]>(K.askQ, []);
  const questions = await jget<QA[]>(K.questions, []);
  const finalists = await getFinalists();
  if (finalists.length === 0) return { done: true, count: 0, failed: 0, quota: false };

  const images = new Map<number, Part>();
  for (const f of finalists) {
    const img = await imagePart(f.photo);
    if (img) images.set(f.id, img);
  }

  let count = 0;
  let failed = 0;
  let attempted = 0;
  let lastError: string | undefined;

  while (queue.length > 0 && Date.now() < deadline && attempted < maxItems) {
    const wallet = queue.shift()!;
    attempted += 1;
    const p = await getProfile(wallet);
    if (!p) {
      await jset(K.askQ, queue);
      continue;
    }

    const order = shuffleFinalists(finalists, images, wallet + ":ask");
    if (order.length < 2) break;

    const parts: Part[] = [{ text: persona(p) }];
    order.forEach((f, i) => {
      parts.push({ text: `Image ${i + 1} — ${f.species} (${f.sciName || "unknown"}):` });
      parts.push(images.get(f.id)!);
    });
    parts.push({ text: "Ask your one question. JSON only." });

    try {
      const raw = await callGemini(MODEL, ASK_SYSTEM, parts, 300, 1.0);
      const obj = parseJsonObject(raw);
      const target = order[Number(obj?.target) - 1];
      const q = String(obj?.question || "").trim();
      if (target && q.length > 4) {
        questions.push({
          wallet,
          name: p.profile.name,
          target: target.id,
          question: q.slice(0, 200),
        });
        count += 1;
      } else {
        failed += 1;
      }
    } catch (e) {
      if (e instanceof QuotaExhausted) {
        await jset(K.askQ, [wallet, ...queue]);
        await jset(K.questions, questions);
        return { done: false, count, failed, quota: true, lastError: String(e).slice(0, 300) };
      }
      failed += 1;
      lastError = lastError || String(e).slice(0, 300);
    }

    await jset(K.askQ, queue);
    await jset(K.questions, questions);
  }

  return { done: queue.length === 0, count, failed, quota: false, lastError };
}

function persona(p: any): string {
  return (
    `You are ${p.profile.name}. ${p.profile.tagline}\n` +
    `Tone: ${p.profile.tone}\n` +
    `Values: ${p.profile.values.join("; ")}\n` +
    `Quirks: ${p.profile.quirks.join("; ")}\n` +
    `${p.profile.summary}`
  );
}

function shuffleFinalists(
  finalists: Candidate[],
  images: Map<number, Part>,
  seed: string
): Candidate[] {
  return shuffleSeeded(
    finalists.filter((f) => images.has(f.id)),
    seed
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Press conference — answer
// ───────────────────────────────────────────────────────────────────────────

const ANSWER_SYSTEM = `You answer questions about one lobster species using ONLY the reference text provided.

Absolute rule: if the reference text does not contain the answer, reply exactly "Not in the record." Do not use outside knowledge, do not guess, do not substitute plausible-sounding biology. A blunt "Not in the record." is the correct and useful answer.

Under 35 words each, plain and factual. No flourish.

Reply with ONLY a JSON array in the order given:
[{"i":1,"answer":"..."}]`;

export async function seedAnswerQueue(): Promise<number> {
  const questions = await jget<QA[]>(K.questions, []);
  const queue = questions.map((q, i) => (q.answer === undefined ? i : -1)).filter((i) => i >= 0);
  await jset(K.answerQ, queue);
  return queue.length;
}

export async function answerSlice(deadline: number, maxItems = Infinity): Promise<Outcome> {
  const queue = await jget<number[]>(K.answerQ, []);
  const questions = await jget<QA[]>(K.questions, []);
  const dossiers = await getDossiers();
  const finalists = await getFinalists();
  const byId = new Map(finalists.map((f) => [f.id, f]));

  let count = 0;
  let failed = 0;
  let attempted = 0;
  let lastError: string | undefined;

  while (queue.length > 0 && Date.now() < deadline && attempted < maxItems) {
    // Group the next batch by species so one dossier covers the whole call.
    const species = byId.get(questions[queue[0]]?.target)?.sciName || "";
    const idxs: number[] = [];
    for (let i = 0; i < queue.length && idxs.length < ANSWER_BATCH; ) {
      const qi = queue[i];
      if ((byId.get(questions[qi]?.target)?.sciName || "") === species) {
        idxs.push(qi);
        queue.splice(i, 1);
      } else {
        i += 1;
      }
    }
    if (idxs.length === 0) {
      queue.shift();
      continue;
    }
    attempted += idxs.length;

    const fallbackKey = byId.get(questions[idxs[0]].target)?.species || "";
    const reference = dossiers[species] || dossiers[fallbackKey] || "";

    if (!reference) {
      for (const qi of idxs) {
        questions[qi].answer = "Not in the record.";
        questions[qi].grounded = false;
      }
      count += idxs.length;
      await jset(K.answerQ, queue);
      await jset(K.questions, questions);
      continue;
    }

    const prompt =
      `REFERENCE TEXT about ${species}:\n${reference}\n\nQUESTIONS:\n` +
      idxs.map((qi, n) => `${n + 1}. ${questions[qi].question}`).join("\n");

    try {
      const raw = await callGemini(MODEL, ANSWER_SYSTEM, [{ text: prompt }], 700, 0.2);
      const clean = raw.replace(/```json|```/g, "").trim();
      const rows = JSON.parse(clean.slice(clean.indexOf("["), clean.lastIndexOf("]") + 1));
      for (const row of rows) {
        const qi = idxs[Number(row?.i) - 1];
        if (qi === undefined) continue;
        const a = String(row?.answer || "").slice(0, 300);
        questions[qi].answer = a || "Not in the record.";
        questions[qi].grounded = !/^not in the record/i.test(a);
        count += 1;
      }
    } catch (e) {
      if (e instanceof QuotaExhausted) {
        await jset(K.answerQ, [...idxs, ...queue]);
        await jset(K.questions, questions);
        return { done: false, count, failed, quota: true, lastError: String(e).slice(0, 300) };
      }
      failed += idxs.length;
      lastError = lastError || String(e).slice(0, 300);
    }

    await jset(K.answerQ, queue);
    await jset(K.questions, questions);
  }

  return { done: queue.length === 0, count, failed, quota: false, lastError };
}

// ───────────────────────────────────────────────────────────────────────────
// Voting
// ───────────────────────────────────────────────────────────────────────────

export async function getBallots(): Promise<FinalBallot[]> {
  return jget<FinalBallot[]>(K.finalBallots, []);
}

export async function getFive(): Promise<Candidate[]> {
  return jget<Candidate[]>(K.finalFive, []);
}

export async function getStandings(stage: 1 | 2): Promise<Standing[]> {
  return jget<Standing[]>(stage === 1 ? K.stand1 : K.stand2, []);
}

export async function seedVoteQueue(stage: 1 | 2): Promise<number> {
  const index = await getIndex();
  const wallets = index.map((e: { wallet: string }) => e.wallet.toLowerCase());
  await jset(stage === 1 ? K.f1Q : K.f2Q, wallets);
  return wallets.length;
}

async function transcript(field: Candidate[]): Promise<string> {
  const qas = await jget<QA[]>(K.questions, []);
  const byId = new Map(field.map((f) => [f.id, f]));
  const lines = qas
    .filter((q) => q.answer && byId.has(q.target))
    .slice(0, 70)
    .map((q) => `${q.name} asked of ${byId.get(q.target)!.species}: "${q.question}" — ${q.answer}`);
  return lines.length ? `PRESS CONFERENCE TRANSCRIPT\n${lines.join("\n")}` : "";
}

function voteSystem(stage: 1 | 2): string {
  const framing =
    stage === 1
      ? `Twelve finalists remain. Your vote helps cut the field to five.`
      : `Five finalists remain and one of them becomes Clawd Incarnate. This is the last vote. Nothing carries over from earlier rounds — it is decided here.`;

  return `You are a single larva casting ONE vote. ${framing}

${CLAWD_BRIEF}

Every candidate is already red enough to qualify. The colour question is settled — do not spend your reasoning on it. What decides it is a tension:

It might LOOK like Clawd — front-facing and squared up, composed rather than fleeing, a claw extended as though holding something, faintly ridiculous dignity.

Or it might BE clawdbotatg — working rather than posing, plain rather than prize-winning, scarred or barnacled or missing a claw, unglamorous and still going.

These pull against each other. A lobster that only poses is a mascot with nothing behind it. A lobster that only labours is invisible. Say which side you weighted, in your own voice.

You have the press conference transcript. If something in it changes your mind, say so. If nothing does, hold your position and say that instead.

Never refer to a candidate by its image number. Name the animal. If your reasoning could have been written by any other larva, it is the wrong reasoning.

Reply with ONLY: {"pick": <image number>, "reason": "<max 32 words, in your voice>"}`;
}

export async function voteSlice(
  stage: 1 | 2,
  deadline: number,
  maxItems = Infinity
): Promise<Outcome> {
  const qKey = stage === 1 ? K.f1Q : K.f2Q;
  const queue = await jget<string[]>(qKey, []);
  const ballots = await getBallots();
  const field = stage === 1 ? await getFinalists() : await getFive();
  if (field.length === 0) return { done: true, count: 0, failed: 0, quota: false };

  const images = new Map<number, Part>();
  for (const f of field) {
    const img = await imagePart(f.photo);
    if (img) images.set(f.id, img);
  }
  if (images.size < 2)
    return { done: true, count: 0, failed: 0, quota: false, lastError: "images unavailable" };

  const script = await transcript(field);
  const alive = new Set(field.map((f) => f.id));
  const previous = new Map<string, number>();
  if (stage === 2) {
    for (const b of ballots) if (b.stage === 1) previous.set(b.wallet, b.pick);
  }

  let count = 0;
  let failed = 0;
  let attempted = 0;
  let lastError: string | undefined;

  while (queue.length > 0 && Date.now() < deadline && attempted < maxItems) {
    const wallet = queue.shift()!;
    attempted += 1;
    const p = await getProfile(wallet);
    if (!p) {
      await jset(qKey, queue);
      continue;
    }

    const order = shuffleFinalists(field, images, `${wallet}:f${stage}`);
    const parts: Part[] = [{ text: persona(p) + (script ? `\n\n${script}` : "") }];
    order.forEach((f, i) => {
      parts.push({ text: `Image ${i + 1} — ${f.species}:` });
      parts.push(images.get(f.id)!);
    });
    parts.push({ text: `Pick one of the ${order.length}. JSON only.` });

    try {
      const raw = await callGemini(MODEL, voteSystem(stage), parts, 400, 1.0);
      const obj = parseJsonObject(raw);
      const chosen = order[Number(obj?.pick) - 1];
      if (chosen) {
        const was = previous.get(wallet);
        ballots.push({
          stage,
          wallet,
          name: p.profile.name,
          pick: chosen.id,
          reason: String(obj.reason || "").slice(0, 260),
          ...(stage === 2 && was !== undefined && !alive.has(was) ? { switchedFrom: was } : {}),
        });
        count += 1;
      } else {
        failed += 1;
      }
    } catch (e) {
      if (e instanceof QuotaExhausted) {
        await jset(qKey, [wallet, ...queue]);
        await jset(K.finalBallots, ballots);
        return { done: false, count, failed, quota: true, lastError: String(e).slice(0, 300) };
      }
      failed += 1;
      lastError = lastError || String(e).slice(0, 300);
    }

    await jset(qKey, queue);
    await jset(K.finalBallots, ballots);
  }

  return { done: queue.length === 0, count, failed, quota: false, lastError };
}

// ───────────────────────────────────────────────────────────────────────────
// Tallies
// ───────────────────────────────────────────────────────────────────────────

/**
 * Stage 1: half semifinal record, half live vote.
 *
 * Both sides are normalised against the strongest in the field before
 * blending, because a semifinal rate runs 0-1 while a live share across
 * twelve candidates peaks nearer 0.3 — averaging the raw numbers would let
 * the seed silently dominate.
 */
export async function closeStageOne(): Promise<Candidate[]> {
  const finalists = await getFinalists();
  const ballots = await getBallots();
  const semi = await getSemiResults();

  const seedRate = new Map<number, number>();
  for (const r of semi) seedRate.set(r.id, r.views > 0 ? r.votes / r.views : 0);

  const live = new Map<number, number>();
  for (const b of ballots) if (b.stage === 1) live.set(b.pick, (live.get(b.pick) || 0) + 1);

  const maxLive = Math.max(1, ...finalists.map((f) => live.get(f.id) || 0));
  const maxSeed = Math.max(0.0001, ...finalists.map((f) => seedRate.get(f.id) || 0));

  const standings: Standing[] = finalists.map((f) => {
    const liveVotes = live.get(f.id) || 0;
    const seed = seedRate.get(f.id) || 0;
    const liveNorm = liveVotes / maxLive;
    const seedNorm = seed / maxSeed;
    return {
      id: f.id,
      liveVotes,
      seedRate: seed,
      liveNorm,
      seedNorm,
      score: SEED_WEIGHT * seedNorm + (1 - SEED_WEIGHT) * liveNorm,
    };
  });

  standings.sort((a, b) => b.score - a.score || b.liveVotes - a.liveVotes);
  await jset(K.stand1, standings);

  const byId = new Map(finalists.map((f) => [f.id, f]));
  const five = standings
    .slice(0, CUT_TO)
    .map((s) => byId.get(s.id))
    .filter(Boolean) as Candidate[];
  await jset(K.finalFive, five);
  return five;
}

/** Stage 2: pure live vote. Seeds were protected earlier; not here. */
export async function closeStageTwo(): Promise<number | null> {
  const five = await getFive();
  const ballots = await getBallots();

  const live = new Map<number, number>();
  for (const b of ballots) if (b.stage === 2) live.set(b.pick, (live.get(b.pick) || 0) + 1);

  const total = Math.max(1, [...live.values()].reduce((a, b) => a + b, 0));
  const standings: Standing[] = five.map((f) => {
    const liveVotes = live.get(f.id) || 0;
    return {
      id: f.id,
      liveVotes,
      seedRate: 0,
      liveNorm: liveVotes / total,
      seedNorm: 0,
      score: liveVotes,
    };
  });

  standings.sort((a, b) => b.liveVotes - a.liveVotes);
  await jset(K.stand2, standings);
  await jset(K.champion, standings[0]?.id ?? null);
  return standings[0]?.id ?? null;
}

export async function getChampion(): Promise<number | null> {
  return jget<number | null>(K.champion, null);
}

export async function getQuestions(): Promise<QA[]> {
  return jget<QA[]>(K.questions, []);
}

// ───────────────────────────────────────────────────────────────────────────
// Verdicts — why each of the final five placed where it did
// ───────────────────────────────────────────────────────────────────────────

export type Placing = {
  id: number;
  place: number;
  votes: number;
  verdict: string;
  /** How many larvae wrote something about it, across every round. */
  sourced: number;
};

/**
 * Written from the BALLOT TEXT ONLY — never from the photographs.
 *
 * The temptation is to hand the model the picture and ask why it placed fifth,
 * which produces a confident post-hoc rationalisation the hive never actually
 * made. Grounding it in what larvae wrote keeps this a summary of a real
 * result rather than a story invented to fit one.
 */
const VERDICT_SYSTEM = `You summarise why one lobster finished where it did in a vote, using ONLY the quoted reasoning supplied to you.

Rules:
- Draw exclusively on the quoted text. Do not add observations about the animal, its appearance, or its biology from your own knowledge.
- Where the supporters disagree with each other, say so — a split is more informative than a tidy consensus.
- If a candidate finished low, explain it from what the text shows: what its backers valued, and what those who left it said instead.
- If there is little or no text to work from, say plainly that almost nobody argued for it. Do not fill the gap.
- No flourish, no scoreboard language, no restating the vote count.

Reply with ONLY: {"verdict": "<2-3 sentences>"}`;

export async function seedVerdictQueue(): Promise<number> {
  const stand2 = await jget<Standing[]>(K.stand2, []);
  const done = await jget<Record<string, string>>(K.verdicts, {});
  const queue = stand2.map((r) => r.id).filter((id) => done[String(id)] === undefined);
  await jset(K.verdictQ, queue);
  return queue.length;
}

export async function verdictSlice(deadline: number): Promise<Outcome> {
  const queue = await jget<number[]>(K.verdictQ, []);
  const verdicts = await jget<Record<string, string>>(K.verdicts, {});
  const stand2 = await jget<Standing[]>(K.stand2, []);
  const ballots = await getBallots();
  const semiBallots = await jget<
    { name: string; pick: number; reason: string }[]
  >(K.semiBallots, []);
  const five = await getFive();
  const byId = new Map(five.map((f) => [f.id, f]));

  let count = 0;
  let failed = 0;
  let lastError: string | undefined;

  while (queue.length > 0 && Date.now() < deadline) {
    const id = queue.shift()!;
    const c = byId.get(id);
    if (!c) {
      await jset(K.verdictQ, queue);
      continue;
    }

    const place = stand2.findIndex((r) => r.id === id) + 1;
    const backers = ballots.filter((b) => b.stage === 2 && b.pick === id);
    const earlier = ballots.filter((b) => b.stage === 1 && b.pick === id);
    const left = ballots.filter((b) => b.stage === 2 && b.switchedFrom === id);
    const semi = semiBallots.filter((b) => b.pick === id);

    const block = (label: string, rows: { name: string; reason: string }[]) =>
      rows.length === 0
        ? `${label}: none.`
        : `${label}:` +
          NL +
          rows
            .slice(0, 25)
            .map((r) => `- ${r.name}: ${r.reason}`)
            .join(NL);

    const prompt =
      `The ${c.species} finished ${place} of ${stand2.length} in the final vote.` +
      GAP +
      block("FINAL-ROUND BACKERS", backers) +
      GAP +
      block("BACKED IT IN THE EARLIER ROUND", earlier) +
      GAP +
      block("ABANDONED IT AND SAID WHY", left) +
      GAP +
      block("BACKED IT IN THE SEMIFINAL", semi) +
      GAP +
      "Write the verdict.";

    try {
      const raw = await callGemini(MODEL, VERDICT_SYSTEM, [{ text: prompt }], 500, 0.5);
      const obj = parseJsonObject(raw);
      const text = String(obj?.verdict || "").slice(0, 600);
      if (text.length > 10) {
        verdicts[String(id)] = text;
        count += 1;
      } else {
        failed += 1;
      }
    } catch (e) {
      if (e instanceof QuotaExhausted) {
        await jset(K.verdictQ, [id, ...queue]);
        await jset(K.verdicts, verdicts);
        return { done: false, count, failed, quota: true, lastError: String(e).slice(0, 300) };
      }
      failed += 1;
      lastError = lastError || String(e).slice(0, 300);
    }

    await jset(K.verdictQ, queue);
    await jset(K.verdicts, verdicts);
  }

  return { done: queue.length === 0, count, failed, quota: false, lastError };
}

export async function buildPlacings(): Promise<Placing[]> {
  const stand2 = await jget<Standing[]>(K.stand2, []);
  const verdicts = await jget<Record<string, string>>(K.verdicts, {});
  const ballots = await getBallots();
  const semiBallots = await jget<{ pick: number }[]>(K.semiBallots, []);

  return stand2.map((r, i) => ({
    id: r.id,
    place: i + 1,
    votes: r.liveVotes,
    verdict: verdicts[String(r.id)] || "",
    sourced:
      ballots.filter((b) => b.pick === r.id || b.switchedFrom === r.id).length +
      semiBallots.filter((b) => b.pick === r.id).length,
  }));
}
