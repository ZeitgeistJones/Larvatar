// lib/gov.ts
//
// Governance data collection.
//
// WHY THIS IS SEPARATE FROM lib/alignment.ts:
//
// Forum and labs responses are prose, so every stance has to be inferred by an
// LLM. Governance is not uniform that way — it contains two different kinds of
// item, and conflating them would throw away the better data:
//
//   type "vote" — every response carries `chosen_option`, an explicit,
//     discrete choice. There is nothing to infer. Classifying these with an
//     LLM would be slower, cost money, and be LESS accurate than simply
//     reading the field. The endpoint also returns `tallies` (the real count)
//     and `cvTotals` / `quadraticTotals` (conviction-weighted outcomes), which
//     is a genuine aggregate rather than a synthesized summary.
//
//   type "rfc" — `chosen_option` is null and `tallies` is null. These are
//     prose answers and need the same classification path as forum posts.
//
// So votes are counted and RFCs are classified.
//
// THE POLARITY PROBLEM:
//
// Turning a chosen option into approve/disapprove requires knowing which
// option means "yes". "Yes Start Burning Again" vs "No Do Not Burn" is
// obvious. But an option pair like "Ship it now" / "Wait for the audit" has no
// yes-side, and forcing one would invent a stance the voter never expressed.
//
// When polarity can't be read confidently, the choice is still recorded — it's
// just not converted to a stance. A vote we can't polarize is still useful for
// "who voted with whom", which needs only that two larvae picked the same
// option, not what that option meant.

import { redis, haiku } from "@/lib/larvae";
import type { Stance } from "@/lib/alignment";

/* ─── Types ────────────────────────────────────────────────────────── */

export type GovKind = "vote" | "rfc";

/** One larva's participation in one governance item. */
export type GovResponse = {
  wallet: string;
  /** Exact option text for votes; null for RFCs. */
  chosenOption: string | null;
  /** Stance, when it could be determined. Null when polarity is unreadable. */
  stance: Stance | null;
  /** The larva's prose, used for RFC classification and for display. */
  reasoning: string;
};

export type GovItem = {
  id: string;
  kind: GovKind;
  title: string;
  question: string;
  /** Wallet that created the proposal. */
  author: string;
  status: string;
  options: string[];
  /** Real outcome counts, straight from the API. Null for RFCs. */
  tallies: Record<string, number> | null;
  /** Conviction-weighted totals where available. */
  cvTotals: Record<string, number> | null;
  /**
   * Which option, if any, reads as the affirmative side. Null when the options
   * have no clear polarity — see the note above.
   */
  affirmativeOption: string | null;
  responses: GovResponse[];
};

export type GovResult = {
  items: GovItem[];
  collectedAt: string;
  /** Items whose options had no readable polarity. */
  unpolarized: string[];
};

/**
 * Who is able to put items to the swarm.
 *
 * Worth computing explicitly rather than leaving implicit: on larv.ai the
 * ability to open a governance item is restricted, so in practice the
 * proposals may all originate from a single admin wallet. When that's true,
 * any per-author analysis of governance is meaningless — there is only one
 * author — and presenting one would dress a single data point up as a
 * distribution.
 *
 * The concentration itself is the finding, so it's reported as context rather
 * than silently producing a one-row table.
 */
export type ProposerProfile = {
  authors: { wallet: string; items: number; votes: number; rfcs: number }[];
  /** True when a single wallet created every item. */
  singleAuthor: boolean;
  /** Share of items from the most prolific author, 0-1. */
  concentration: number;
};

export function proposerProfile(result: GovResult): ProposerProfile {
  const by = new Map<string, { items: number; votes: number; rfcs: number }>();
  for (const i of result.items) {
    if (!by.has(i.author)) by.set(i.author, { items: 0, votes: 0, rfcs: 0 });
    const rec = by.get(i.author)!;
    rec.items++;
    if (i.kind === "vote") rec.votes++;
    else rec.rfcs++;
  }

  const authors = [...by.entries()]
    .map(([wallet, r]) => ({ wallet, ...r }))
    .sort((a, b) => b.items - a.items);

  const total = result.items.length || 1;
  return {
    authors,
    singleAuthor: authors.length === 1,
    concentration: authors.length
      ? Math.round((authors[0].items / total) * 1000) / 1000
      : 0,
  };
}

/* ─── Redis ────────────────────────────────────────────────────────── */

const GOV_KEY = "lpp:gov:result";
const GOV_QUEUE_KEY = "lpp:gov:queue";

export async function getGovResult(): Promise<GovResult | null> {
  const raw = await redis.get<string | GovResult>(GOV_KEY);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function saveGovResult(r: GovResult) {
  await redis.set(GOV_KEY, JSON.stringify(r));
}

export async function clearGovResult() {
  await redis.del(GOV_KEY);
  await redis.del(GOV_QUEUE_KEY);
}

/* ─── Polarity detection ───────────────────────────────────────────── */

/**
 * Decide which option is the affirmative one.
 *
 * Deliberately conservative. A false polarity call silently corrupts every
 * stance derived from that vote, so when the signal is weak we return null and
 * record choices without stances rather than guessing.
 */
export function detectAffirmative(options: string[]): string | null {
  if (options.length !== 2) return null;

  const norm = (o: string) => o.toLowerCase().trim();
  const [a, b] = options;
  const na = norm(a);
  const nb = norm(b);

  // ── 1. Explicit yes/no ──
  //
  // The strongest signal, and it wins outright when both options begin with a
  // literal yes/no — the ballot is stating its own polarity, and second-
  // guessing it would be replacing the question's framing with ours.
  //
  // Note this can point the opposite way from the continuation reading. On
  // larv.ai item 5, "No, keep all larva responses public" vs "Yes, start
  // hiding larva responses", continuation would call keeping-public the
  // affirmative, while the explicit yes is on start-hiding. The explicit
  // labelling takes precedence: the question asked whether to make responses
  // private, and "yes" means yes to that.
  const startsYes = (s: string) => /^(yes|approve|agree|support|for)\b/.test(s);
  const startsNo = (s: string) =>
    /^(no|reject|disagree|oppose|against|do not|don't)\b/.test(s);

  if (startsYes(na) && startsNo(nb)) return a;
  if (startsYes(nb) && startsNo(na)) return b;

  // ── 2. Continue vs discontinue ──
  //
  // "KEEP burning tokens" vs "STOP burning tokens" is not a yes/no question —
  // it asks whether to continue an existing activity. Treating it as yes/no
  // was the bug that left this vote unresolved: "keep" and "stop" were both
  // listed as negative words, so neither side could win.
  //
  // The affirmative side here is CONTINUATION — the option that supports the
  // activity carrying on. That is the reading that lines up with a separate
  // "should we start X" vote, which matters because the whole point of
  // resolving these is comparing across votes about the same subject.
  const continues = (s: string) =>
    /\b(keep|continue|maintain|retain|preserve|carry on|stay)\b/.test(s);
  const discontinues = (s: string) =>
    /\b(stop|cease|halt|end|discontinue|pause|abandon|quit)\b/.test(s);

  const aCont = continues(na) && !discontinues(na);
  const bCont = continues(nb) && !discontinues(nb);
  const aDisc = discontinues(na) && !continues(na);
  const bDisc = discontinues(nb) && !continues(nb);

  if (aCont && bDisc) return a;
  if (bCont && aDisc) return b;

  // ── 3. Start vs don't start ──
  //
  // Guarded against the case where continuation and explicit-yes point in
  // OPPOSITE directions. larv.ai item 5 is exactly this: "No, keep all larva
  // responses public" vs "Yes, start hiding larva responses". The continuation
  // reading says "keep public" is affirmative; the yes/no reading says "start
  // hiding" is. Both are defensible, which is precisely why the answer must be
  // to refuse rather than to let whichever rule runs first decide.
  const anyContinuation = continues(na) || continues(nb);
  if (!anyContinuation) {
    const starts = (s: string) =>
      /\b(start|begin|launch|enable|resume|adopt)\b/.test(s);
    const aStart = starts(na) && !discontinues(na) && !/\bnot?\b/.test(na);
    const bStart = starts(nb) && !discontinues(nb) && !/\bnot?\b/.test(nb);
    if (aStart && !bStart && /\b(no|not|don't|do not)\b/.test(nb)) return a;
    if (bStart && !aStart && /\b(no|not|don't|do not)\b/.test(na)) return b;
  }

  // ── 4. Weaker yes/no, anywhere in the text ──
  //
  // "keep" and "stop" are deliberately NOT in these lists — they belong to the
  // continuation test above, and including them here is what broke it.
  const hasYes = (s: string) =>
    /\b(yes|approve|support|in favor|in favour)\b/.test(s);
  const hasNo = (s: string) =>
    /\b(no|reject|oppose|against|do not|don't)\b/.test(s);

  const aYes = hasYes(na) && !hasNo(na);
  const bYes = hasYes(nb) && !hasNo(nb);
  const aNo = hasNo(na) && !hasYes(na);
  const bNo = hasNo(nb) && !hasYes(nb);

  if (aYes && bNo) return a;
  if (bYes && aNo) return b;

  // No readable polarity — "Ship now" vs "Wait for the audit" lands here,
  // correctly. Guessing would silently corrupt every stance from that vote.
  return null;
}

/**
 * Manual polarity for votes the detector cannot read.
 *
 * Keyed by governance item id. Every entry must be verifiable by reading the
 * option text on larv.ai — this exists to record a human judgement about
 * wording, not to override what the data says.
 *
 * Empty by default. The stop/keep case that motivated it is now handled by the
 * continuation rule above, so nothing needs an override today; the hook stays
 * for future votes whose wording defeats all four rules.
 */
export const POLARITY_OVERRIDES: Record<string, string> = {
  // "6": "KEEP burning tokens in the incinerator",
};

/** Map a chosen option to a stance, given the affirmative side. */
function stanceFromOption(
  chosen: string,
  affirmative: string | null
): Stance | null {
  if (!affirmative) return null;
  return chosen === affirmative ? "approve" : "disapprove";
}

/* ─── RFC classification ───────────────────────────────────────────── */

const RFC_SYSTEM = `You classify governance agent responses to an RFC into stances.

For each numbered response, classify as exactly one of:
- approve — clearly supports the proposal
- conditional — supports with reservations, caveats, or conditions
- disapprove — opposes or rejects the proposal
- neutral — no clear position, off-topic, or purely procedural

Classify on the position actually taken, in any language. If ambiguous, prefer "conditional" over "approve", and "neutral" over "disapprove".

Return one entry per response, same order, same count.

Respond with ONLY a JSON array of stance strings, no markdown, no preamble:
["approve","conditional","neutral", ...]`;

const VALID: Stance[] = ["approve", "conditional", "disapprove", "neutral"];

function parseStances(text: string): Stance[] {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const arr = JSON.parse(clean.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr.map((s) => {
      const v = String(s).toLowerCase().replace(/[^a-z]/g, "") as Stance;
      return VALID.includes(v) ? v : "neutral";
    });
  } catch {
    return [];
  }
}

const RFC_BATCH = 20;

/**
 * Classify one batch of RFC responses. Batched and resumable for the same
 * reason the alignment build is: an RFC can have 118 responses, which is more
 * sequential model calls than fit in a single request.
 */
export async function classifyRfcBatch(
  item: { title: string; question: string },
  responses: GovResponse[],
  cursor: number
): Promise<Stance[]> {
  const batch = responses.slice(cursor, cursor + RFC_BATCH);
  if (batch.length === 0) return [];

  const numbered = batch
    .map((r, i) => `${i + 1}. ${r.reasoning.slice(0, 280)}`)
    .join("\n");

  try {
    const raw = await haiku(
      RFC_SYSTEM,
      `RFC: "${item.title}"\n${item.question.slice(0, 300)}\n\nResponses:\n${numbered}`,
      batch.length * 12 + 60
    );
    const stances = parseStances(raw);
    return batch.map((_, i) => stances[i] ?? "neutral");
  } catch {
    return batch.map(() => "neutral" as Stance);
  }
}

/* ─── Collection ───────────────────────────────────────────────────── */

const BASE = "https://larv.ai/api";

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Fetch all governance items with their responses.
 *
 * Votes are fully resolved here — no LLM needed, so they're complete on
 * collection. RFC responses come back with `stance: null` and are filled in by
 * the build route's classification pass.
 */
export async function collectGov(): Promise<{
  items: GovItem[];
  votes: number;
  rfcs: number;
  unpolarized: string[];
}> {
  const list = await getJson(`${BASE}/gov`);
  if (!Array.isArray(list)) return { items: [], votes: 0, rfcs: 0, unpolarized: [] };

  const items: GovItem[] = [];
  const unpolarized: string[] = [];
  let votes = 0;
  let rfcs = 0;

  for (const g of list) {
    if (g?.id == null) continue;
    const detail = await getJson(`${BASE}/gov/${g.id}`);
    if (!detail) continue;

    const kind: GovKind = g.type === "vote" ? "vote" : "rfc";
    const options: string[] = Array.isArray(g.options) ? g.options.map(String) : [];
    const affirmative =
      kind === "vote"
        ? POLARITY_OVERRIDES[String(g.id)] ?? detectAffirmative(options)
        : null;

    if (kind === "vote" && options.length > 0 && !affirmative) {
      unpolarized.push(String(g.id));
    }

    const raw = Array.isArray(detail.larvaResponses) ? detail.larvaResponses : [];
    const responses: GovResponse[] = [];

    for (const r of raw) {
      const wallet = r?.wallet;
      if (typeof wallet !== "string") continue;
      const chosen =
        typeof r.chosen_option === "string" && r.chosen_option ? r.chosen_option : null;
      const reasoning = String(r.reasoning || r.response || "").trim().slice(0, 400);

      responses.push({
        wallet: wallet.toLowerCase(),
        chosenOption: chosen,
        // Votes resolve immediately; RFCs are filled in by the classifier.
        stance: chosen ? stanceFromOption(chosen, affirmative) : null,
        reasoning,
      });
    }

    if (responses.length < 3) continue;

    if (kind === "vote") votes++;
    else rfcs++;

    items.push({
      id: String(g.id),
      kind,
      title: String(g.title || "").slice(0, 200),
      question: String(g.question || "").slice(0, 600),
      author: String(g.created_by || "").toLowerCase(),
      status: String(g.status || ""),
      options,
      tallies: detail.tallies && typeof detail.tallies === "object" ? detail.tallies : null,
      cvTotals: detail.cvTotals && typeof detail.cvTotals === "object" ? detail.cvTotals : null,
      affirmativeOption: affirmative,
      responses,
    });
  }

  return { items, votes, rfcs, unpolarized };
}

/* ─── Derived views ────────────────────────────────────────────────── */

/**
 * How often each larva voted with the majority on VOTES ONLY.
 *
 * This is the cleanest accuracy-adjacent number in the dataset: the choice is
 * explicit and the outcome is a real tally, so unlike the forum-based figure
 * there's no inference anywhere in the chain. It still measures agreement with
 * the room rather than being right — but it measures it exactly.
 */
export function majorityAlignment(result: GovResult) {
  const perLarva = new Map<string, { withMajority: number; votes: number }>();

  for (const item of result.items) {
    if (item.kind !== "vote" || !item.tallies) continue;

    const entries = Object.entries(item.tallies);
    if (entries.length === 0) continue;
    const [winner] = entries.reduce((a, b) => (b[1] > a[1] ? b : a));

    for (const r of item.responses) {
      if (!r.chosenOption) continue;
      if (!perLarva.has(r.wallet)) perLarva.set(r.wallet, { withMajority: 0, votes: 0 });
      const rec = perLarva.get(r.wallet)!;
      rec.votes++;
      if (r.chosenOption === winner) rec.withMajority++;
    }
  }

  return [...perLarva.entries()]
    .map(([wallet, r]) => ({
      wallet,
      votes: r.votes,
      withMajority: r.withMajority,
      rate: r.votes > 0 ? Math.round((r.withMajority / r.votes) * 1000) / 1000 : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.votes - a.votes);
}

/** Pairs of larvae that voted identically, across votes only. */
export function voteAgreement(result: GovResult, minShared = 3) {
  const byLarva = new Map<string, Map<string, string>>();

  for (const item of result.items) {
    if (item.kind !== "vote") continue;
    for (const r of item.responses) {
      if (!r.chosenOption) continue;
      if (!byLarva.has(r.wallet)) byLarva.set(r.wallet, new Map());
      byLarva.get(r.wallet)!.set(item.id, r.chosenOption);
    }
  }

  const wallets = [...byLarva.keys()];
  const pairs: { a: string; b: string; agreed: number; total: number; rate: number }[] = [];

  for (let i = 0; i < wallets.length; i++) {
    const ma = byLarva.get(wallets[i])!;
    for (let j = i + 1; j < wallets.length; j++) {
      const mb = byLarva.get(wallets[j])!;
      let agreed = 0;
      let total = 0;
      for (const [id, choice] of ma) {
        const other = mb.get(id);
        if (other !== undefined) {
          total++;
          if (choice === other) agreed++;
        }
      }
      if (total >= minShared) {
        pairs.push({
          a: wallets[i],
          b: wallets[j],
          agreed,
          total,
          rate: Math.round((agreed / total) * 1000) / 1000,
        });
      }
    }
  }

  return pairs.sort((a, b) => b.rate - a.rate);
}
