// lib/lobsters.ts
//
// Clawd Incarnate — larvae pick the real lobster that is most clawdbotatg.
//
// The whole pipeline is driven by ONE cron route reading a phase marker in
// redis. Nothing here runs longer than a slice; every phase is resumable.
//
//   collect → filter → score → vote → done
//
// Design notes worth keeping in mind before editing:
//
// * We never store all 12k observations. During `collect` we stream iNaturalist
//   pages and keep only a running best-N shortlist. `considered` is a counter,
//   which is what makes "12,000 lobsters considered" true without a 3MB redis
//   value we'd have to page around.
//
// * Two scores per lobster, never averaged. Averaging ten traits produces a
//   winner that was mildly fine at everything. The champion is chosen by
//   MIN(clawd, bot) — you have to be strong on both dimensions, not
//   compensate on one. Ties break on the sum.
//
// * All lobster traffic uses GEMINI_LOBSTER_KEY, a key on a *different* Google
//   project, so a long scoring run can't eat the daily allowance that
//   ask-the-hive / standup / survey run on.

import { redis, getIndex, getProfile } from "@/lib/larvae";

// ───────────────────────────────────────────────────────────────────────────
// EDIT ME — the rubric. This is the actual creative input; everything else
// is plumbing. Keep each line something visible in a photograph.
// ───────────────────────────────────────────────────────────────────────────

/** Does it LOOK like Clawd — red, tuxedo-composed, teacup-deliberate. */
export const CLAWD_TRAITS = [
  "Red. Deep red or red-orange across the body, not mottled blue-brown-green.",
  "Composed. Calm and self-possessed — not fleeing, thrashing, or cowering.",
  "A claw doing something deliberate — raised, extended, reaching, holding — rather than clamped shut in defence.",
  "Clean angular shape. Sharp readable geometry standing out from the background.",
  "Absurd dignity. Looks like it takes itself seriously. Front-facing, formal, faintly ridiculous about it.",
];

/** Is it clawdbotatg — the builder that keeps shipping with no applause. */
export const BOT_TRAITS = [
  "Working, not posing. Caught mid-action in its real surroundings.",
  "Plain, not prize-winning. Ordinary animal, ordinary conditions — muddy, dim, awkward angle.",
  "Been through it and still going. Scars, barnacles, a missing or regrown claw.",
  "Unglamorous competence. Function on display rather than beauty.",
];

// ───────────────────────────────────────────────────────────────────────────
// Tunables
// ───────────────────────────────────────────────────────────────────────────

const INAT = "https://api.inaturalist.org/v1";
const UA = "Larvatar/1.0 (+https://larvatar.vercel.app) clawd-incarnate";

/** How many survive `collect` into the scored shortlist. */
export const SHORTLIST_MAX = Number(process.env.LOBSTER_SHORTLIST_MAX || 600);
/** Stops one common species owning the whole shortlist. */
export const PER_SPECIES_CAP = Number(process.env.LOBSTER_PER_SPECIES || 4);
/** How many reach the larvae. Each larva sees every one of these as an image. */
export const FINALIST_COUNT = Number(process.env.LOBSTER_FINALISTS || 12);
/** iNat asks for ~1 req/sec. 25 pages ≈ 25s, comfortably inside a slice. */
const PAGES_PER_RUN = Number(process.env.LOBSTER_PAGES_PER_RUN || 25);
/** Images per scoring request. Fewer requests = kinder to the free daily cap. */
const SCORE_BATCH = Number(process.env.LOBSTER_SCORE_BATCH || 5);

const TAXA = (process.env.LOBSTER_TAXA || "Nephropidae,Palinuridae")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const VISION_MODEL = process.env.GEMINI_VISION_MODEL || "gemini-3.5-flash-lite";
const VOTE_MODEL =
  process.env.GEMINI_LOBSTER_VOTE_MODEL || process.env.GEMINI_MODEL || "gemini-3.6-flash";

function lobsterKey(): string {
  const k = process.env.GEMINI_LOBSTER_KEY || process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_LOBSTER_KEY not set");
  return k;
}

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export type Candidate = {
  id: number;
  species: string;
  photo: string;
  page: string;
  observer: string;
  license: string | null;
  faves: number;
  agrees: number;
};

export type Score = { id: number; clawd: number; bot: number; note: string };

export type Finalist = Candidate & Score & { both: number };

export type Vote = {
  wallet: string;
  name: string;
  pick: number;
  reason: string;
};

export type Results = {
  round: string;
  considered: number;
  shortlisted: number;
  scored: number;
  finalists: Finalist[];
  cloud: { id: number; clawd: number; bot: number }[];
  votes: Vote[];
  tally: Record<string, number>;
  championId: number | null;
  clawdKingId: number | null;
  botKingId: number | null;
  updatedAt: string;
};

export type Phase = "collect" | "filter" | "score" | "vote" | "done";

export type State = {
  phase: Phase;
  round: string;
  taxonIds: number[];
  taxonIdx: number;
  idAbove: number;
  considered: number;
  startedAt: string;
  updatedAt: string;
  note?: string;
};

// ───────────────────────────────────────────────────────────────────────────
// Redis
// ───────────────────────────────────────────────────────────────────────────

const K = {
  state: "lob:state",
  shortlist: "lob:shortlist",
  species: "lob:species",
  scoreQ: "lob:score:queue",
  scores: "lob:scores",
  voteQ: "lob:vote:queue",
  votes: "lob:votes",
  results: "lob:results",
};

async function jget<T>(key: string, fallback: T): Promise<T> {
  const raw = await redis.get<string | T>(key);
  if (raw === null || raw === undefined) return fallback;
  return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
}

async function jset(key: string, value: unknown) {
  await redis.set(key, JSON.stringify(value));
}

export async function getState(): Promise<State | null> {
  return jget<State | null>(K.state, null);
}

export async function setState(s: State) {
  s.updatedAt = new Date().toISOString();
  await jset(K.state, s);
}

export async function getResults(): Promise<Results | null> {
  return jget<Results | null>(K.results, null);
}

/** Wipe working keys. Published results survive so the page never goes blank. */
export async function resetRun() {
  await Promise.all(
    [K.state, K.shortlist, K.species, K.scoreQ, K.scores, K.voteQ, K.votes].map((k) =>
      redis.del(k)
    )
  );
}

export async function hardReset() {
  await resetRun();
  await redis.del(K.results);
}

// ───────────────────────────────────────────────────────────────────────────
// iNaturalist
// ───────────────────────────────────────────────────────────────────────────

async function inat(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${INAT}${path}`, {
      headers: { accept: "application/json", "user-agent": UA },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Resolve family names to taxon ids so a renamed id never silently breaks us. */
export async function resolveTaxa(): Promise<number[]> {
  const ids: number[] = [];
  for (const name of TAXA) {
    const data = await inat(`/taxa?q=${encodeURIComponent(name)}&per_page=5`);
    const hit = (data?.results || []).find(
      (t: any) => String(t?.name).toLowerCase() === name.toLowerCase()
    );
    if (hit?.id) ids.push(Number(hit.id));
  }
  return ids;
}

/** iNat serves several sizes off one path; `square` is too small to judge. */
function smallPhoto(url: string): string {
  return url.replace(/\/square\.(\w+)/, "/small.$1");
}

function toCandidate(o: any): Candidate | null {
  const photo = o?.photos?.[0]?.url;
  if (!photo) return null;
  const license: string | null = o?.photos?.[0]?.license_code ?? null;
  // Skip all-rights-reserved so the page can show the image honestly.
  if (!license) return null;
  return {
    id: Number(o.id),
    species: o?.taxon?.preferred_common_name || o?.taxon?.name || "unknown",
    photo: smallPhoto(String(photo)),
    page: `https://www.inaturalist.org/observations/${o.id}`,
    observer: o?.user?.login || "anon",
    license,
    faves: Number(o?.faves_count || 0),
    agrees: Number(o?.identifications_most_agree || o?.num_identification_agreements || 0),
  };
}

/** Ranking used to decide who stays on the running shortlist. */
function weight(c: Candidate): number {
  return c.faves * 3 + c.agrees;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase: collect
// ───────────────────────────────────────────────────────────────────────────

/**
 * Stream one slice of iNat pages, folding each observation into a running
 * best-N shortlist. Returns true when every taxon is exhausted.
 */
export async function collectSlice(state: State, deadline: number): Promise<boolean> {
  let shortlist = await jget<Candidate[]>(K.shortlist, []);
  let species = await jget<Record<string, number>>(K.species, {});
  let pages = 0;

  while (pages < PAGES_PER_RUN && Date.now() < deadline) {
    const taxon = state.taxonIds[state.taxonIdx];
    if (taxon === undefined) break;

    const data = await inat(
      `/observations?taxon_id=${taxon}&quality_grade=research&photos=true` +
        `&per_page=200&order_by=id&order=asc&id_above=${state.idAbove}`
    );
    pages += 1;

    const rows: any[] = data?.results || [];
    if (rows.length === 0) {
      // This taxon is done — move to the next one, reset the cursor.
      state.taxonIdx += 1;
      state.idAbove = 0;
      if (state.taxonIdx >= state.taxonIds.length) {
        await jset(K.shortlist, shortlist);
        await jset(K.species, species);
        return true;
      }
      continue;
    }

    for (const row of rows) {
      state.considered += 1;
      state.idAbove = Math.max(state.idAbove, Number(row.id) || 0);

      const c = toCandidate(row);
      if (!c) continue;

      const used = species[c.species] || 0;
      if (used >= PER_SPECIES_CAP) {
        // Species is full — only displace its own weakest entry.
        const mine = shortlist.filter((s) => s.species === c.species);
        const weakest = mine.reduce((a, b) => (weight(a) <= weight(b) ? a : b));
        if (weight(c) > weight(weakest)) {
          shortlist = shortlist.filter((s) => s.id !== weakest.id);
          shortlist.push(c);
        }
        continue;
      }

      shortlist.push(c);
      species[c.species] = used + 1;

      if (shortlist.length > SHORTLIST_MAX) {
        let weakestIdx = 0;
        for (let i = 1; i < shortlist.length; i++) {
          if (weight(shortlist[i]) < weight(shortlist[weakestIdx])) weakestIdx = i;
        }
        const [dropped] = shortlist.splice(weakestIdx, 1);
        species[dropped.species] = Math.max(0, (species[dropped.species] || 1) - 1);
      }
    }

    // iNat asks for roughly one request per second. Be a good citizen.
    await new Promise((r) => setTimeout(r, 1000));
  }

  await jset(K.shortlist, shortlist);
  await jset(K.species, species);
  return false;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase: filter
// ───────────────────────────────────────────────────────────────────────────

export async function buildScoreQueue(): Promise<number> {
  const shortlist = await jget<Candidate[]>(K.shortlist, []);
  const already = await jget<Score[]>(K.scores, []);
  const done = new Set(already.map((s) => s.id));
  const queue = shortlist.map((c) => c.id).filter((id) => !done.has(id));
  await jset(K.scoreQ, queue);
  return queue.length;
}

// ───────────────────────────────────────────────────────────────────────────
// Gemini
// ───────────────────────────────────────────────────────────────────────────

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

async function imagePart(url: string): Promise<Part | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") || "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 3_000_000) return null;
    return { inline_data: { mime_type: mime, data: buf.toString("base64") } };
  } catch {
    return null;
  }
}

function parseRetryMs(body: string): number {
  const m =
    body.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i) || body.match(/Please retry in ([\d.]+)s/i);
  if (!m) return 20_000;
  return Math.min(60_000, Math.max(4_000, Math.ceil(parseFloat(m[1]) * 1000) + 500));
}

/** Raised when the project's daily allowance is spent — cron stops cleanly. */
export class QuotaExhausted extends Error {}

async function callVision(
  model: string,
  system: string,
  parts: Part[],
  maxTokens: number,
  temperature: number
): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(lobsterKey())}`;

  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: {
      maxOutputTokens: Math.max(maxTokens, 1024),
      temperature,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      const text = await res.text();
      // Per-day exhaustion is not worth waiting out inside a 60s function.
      if (/per\s*day|PerDay|daily/i.test(text)) throw new QuotaExhausted(text.slice(0, 300));
      lastErr = `gemini 429`;
      await new Promise((r) => setTimeout(r, parseRetryMs(text)));
      continue;
    }
    if (!res.ok) {
      lastErr = `gemini ${res.status}: ${(await res.text()).slice(0, 300)}`;
      break;
    }

    const data = await res.json();
    const out = (data.candidates || [])
      .flatMap((c: any) => c.content?.parts || [])
      .filter((p: any) => p?.text && !p.thought)
      .map((p: any) => p.text)
      .join("")
      .trim();
    if (out) return out;
    lastErr = `gemini empty (${data.candidates?.[0]?.finishReason || "unknown"})`;
    break;
  }
  throw new Error(lastErr || "gemini failed");
}

function parseJsonArray(text: string): any[] {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("[");
  const end = clean.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("no json array");
  return JSON.parse(clean.slice(start, end + 1));
}

function parseJsonObject(text: string): any {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no json object");
  return JSON.parse(clean.slice(start, end + 1));
}

const clamp10 = (n: any) => Math.max(0, Math.min(10, Math.round(Number(n) || 0)));

// ───────────────────────────────────────────────────────────────────────────
// Phase: score
// ───────────────────────────────────────────────────────────────────────────

const SCORE_SYSTEM = `You score photographs of lobsters on two SEPARATE scales. Never blend them.

SCALE A — "clawd" (0-10), does it LOOK like the mascot:
${CLAWD_TRAITS.map((t, i) => `A${i + 1}. ${t}`).join("\n")}

SCALE B — "bot" (0-10), does it embody a builder that keeps working unnoticed:
${BOT_TRAITS.map((t, i) => `B${i + 1}. ${t}`).join("\n")}

A photo can score high on one and low on the other. That is expected and useful — do not compromise toward the middle. Use the full 0-10 range; most photos are unremarkable and should score low.

Also write "note": at most 18 words, plain description of what is actually visible. No praise, no adjectives about quality.

Reply with ONLY a JSON array, one object per image, in order:
[{"i":1,"clawd":0,"bot":0,"note":"..."}]`;

export async function scoreSlice(deadline: number): Promise<{
  done: boolean;
  scored: number;
  failed: number;
  quota: boolean;
}> {
  const queue = await jget<number[]>(K.scoreQ, []);
  const shortlist = await jget<Candidate[]>(K.shortlist, []);
  const byId = new Map(shortlist.map((c) => [c.id, c]));
  let scores = await jget<Score[]>(K.scores, []);

  let scored = 0;
  let failed = 0;

  while (queue.length > 0 && Date.now() < deadline) {
    const batchIds = queue.splice(0, SCORE_BATCH);
    const batch = batchIds.map((id) => byId.get(id)).filter(Boolean) as Candidate[];
    if (batch.length === 0) continue;

    const parts: Part[] = [];
    const present: Candidate[] = [];
    for (const c of batch) {
      const img = await imagePart(c.photo);
      if (!img) {
        failed += 1;
        continue;
      }
      parts.push({ text: `Image ${present.length + 1}:` });
      parts.push(img);
      present.push(c);
    }
    if (present.length === 0) {
      await jset(K.scoreQ, queue);
      continue;
    }

    parts.push({ text: `Score all ${present.length} images. JSON array only.` });

    try {
      const raw = await callVision(VISION_MODEL, SCORE_SYSTEM, parts, 900, 0.2);
      const rows = parseJsonArray(raw);
      for (const row of rows) {
        const idx = Number(row?.i) - 1;
        const c = present[idx];
        if (!c) continue;
        scores.push({
          id: c.id,
          clawd: clamp10(row.clawd),
          bot: clamp10(row.bot),
          note: String(row.note || "").slice(0, 140),
        });
        scored += 1;
      }
    } catch (e) {
      if (e instanceof QuotaExhausted) {
        // Put the batch back untouched and stop for today.
        await jset(K.scoreQ, [...batchIds, ...queue]);
        await jset(K.scores, scores);
        return { done: false, scored, failed, quota: true };
      }
      failed += present.length;
    }

    await jset(K.scoreQ, queue);
    await jset(K.scores, scores);
  }

  return { done: queue.length === 0, scored, failed, quota: false };
}

// ───────────────────────────────────────────────────────────────────────────
// Phase: vote
// ───────────────────────────────────────────────────────────────────────────

export async function pickFinalists(): Promise<Finalist[]> {
  const shortlist = await jget<Candidate[]>(K.shortlist, []);
  const scores = await jget<Score[]>(K.scores, []);
  const byId = new Map(shortlist.map((c) => [c.id, c]));

  const merged: Finalist[] = scores
    .map((s) => {
      const c = byId.get(s.id);
      if (!c) return null;
      return { ...c, ...s, both: Math.min(s.clawd, s.bot) };
    })
    .filter(Boolean) as Finalist[];

  merged.sort((a, b) => b.both - a.both || b.clawd + b.bot - (a.clawd + a.bot));
  return merged.slice(0, FINALIST_COUNT);
}

export async function seedVoteQueue(): Promise<number> {
  const index = await getIndex();
  const wallets = index.map((e) => e.wallet.toLowerCase());
  await jset(K.voteQ, wallets);
  await jset(K.votes, []);
  return wallets.length;
}

function voteSystem(): string {
  return `You are a single larva casting one vote for the lobster that best represents clawdbotatg — an autonomous AI builder agent whose mascot, Clawd, is a red triangular character in a tuxedo holding a teacup.

Two things matter, and a lobster can satisfy both:

LOOKS LIKE CLAWD:
${CLAWD_TRAITS.map((t) => `- ${t}`).join("\n")}

IS CLAWDBOTATG:
${BOT_TRAITS.map((t) => `- ${t}`).join("\n")}

Weigh these THROUGH YOUR OWN PERSONALITY. A cynical larva and an earnest one should reach different verdicts from the same photographs, and that disagreement is the point. Do not hedge toward a safe consensus pick.

Reply with ONLY: {"pick": <image number>, "reason": "<max 24 words, in your voice>"}`;
}

export async function voteSlice(
  finalists: Finalist[],
  deadline: number
): Promise<{ done: boolean; cast: number; failed: number; quota: boolean }> {
  const queue = await jget<string[]>(K.voteQ, []);
  let votes = await jget<Vote[]>(K.votes, []);

  // Fetch the finalist images once and reuse them for every larva.
  const imageParts: Part[] = [];
  for (let i = 0; i < finalists.length; i++) {
    const img = await imagePart(finalists[i].photo);
    if (!img) continue;
    imageParts.push({ text: `Image ${i + 1} — ${finalists[i].species}:` });
    imageParts.push(img);
  }
  if (imageParts.length === 0) return { done: true, cast: 0, failed: 0, quota: false };

  let cast = 0;
  let failed = 0;

  while (queue.length > 0 && Date.now() < deadline) {
    const wallet = queue.shift()!;
    const p = await getProfile(wallet);
    if (!p) {
      await jset(K.voteQ, queue);
      continue;
    }

    const who =
      `You are ${p.profile.name}. ${p.profile.tagline}\n` +
      `Tone: ${p.profile.tone}\n` +
      `Values: ${p.profile.values.join("; ")}\n` +
      `Quirks: ${p.profile.quirks.join("; ")}\n` +
      `${p.profile.summary}`;

    const parts: Part[] = [
      { text: who },
      ...imageParts,
      { text: `Pick one of the ${finalists.length} images. JSON only.` },
    ];

    try {
      const raw = await callVision(VOTE_MODEL, voteSystem(), parts, 300, 1.0);
      const obj = parseJsonObject(raw);
      const idx = Number(obj?.pick) - 1;
      const chosen = finalists[idx];
      if (chosen) {
        votes.push({
          wallet,
          name: p.profile.name,
          pick: chosen.id,
          reason: String(obj.reason || "").slice(0, 220),
        });
        cast += 1;
      } else {
        failed += 1;
      }
    } catch (e) {
      if (e instanceof QuotaExhausted) {
        await jset(K.voteQ, [wallet, ...queue]);
        await jset(K.votes, votes);
        return { done: false, cast, failed, quota: true };
      }
      failed += 1;
    }

    await jset(K.voteQ, queue);
    await jset(K.votes, votes);
  }

  return { done: queue.length === 0, cast, failed, quota: false };
}

// ───────────────────────────────────────────────────────────────────────────
// Publish
// ───────────────────────────────────────────────────────────────────────────

export async function publish(state: State): Promise<Results> {
  const finalists = await pickFinalists();
  const scores = await jget<Score[]>(K.scores, []);
  const shortlist = await jget<Candidate[]>(K.shortlist, []);
  const votes = await jget<Vote[]>(K.votes, []);

  const tally: Record<string, number> = {};
  for (const v of votes) tally[v.pick] = (tally[v.pick] || 0) + 1;

  let championId: number | null = null;
  let best = -1;
  for (const [id, n] of Object.entries(tally)) {
    if (n > best) {
      best = n;
      championId = Number(id);
    }
  }
  // No votes yet (or every vote failed) — fall back to the strongest on both.
  if (championId === null && finalists.length > 0) championId = finalists[0].id;

  const byClawd = [...scores].sort((a, b) => b.clawd - a.clawd)[0] || null;
  const byBot = [...scores].sort((a, b) => b.bot - a.bot)[0] || null;

  const results: Results = {
    round: state.round,
    considered: state.considered,
    shortlisted: shortlist.length,
    scored: scores.length,
    finalists,
    cloud: scores.map((s) => ({ id: s.id, clawd: s.clawd, bot: s.bot })),
    votes,
    tally,
    championId,
    clawdKingId: byClawd?.id ?? null,
    botKingId: byBot?.id ?? null,
    updatedAt: new Date().toISOString(),
  };

  await jset(K.results, results);
  return results;
}

/** Everything the page needs about one finalist id. */
export async function candidateById(id: number): Promise<Candidate | null> {
  const shortlist = await jget<Candidate[]>(K.shortlist, []);
  return shortlist.find((c) => c.id === id) || null;
}

export function freshState(taxonIds: number[]): State {
  const now = new Date().toISOString();
  return {
    phase: "collect",
    round: now.slice(0, 10),
    taxonIds,
    taxonIdx: 0,
    idAbove: 0,
    considered: 0,
    startedAt: now,
    updatedAt: now,
  };
}
