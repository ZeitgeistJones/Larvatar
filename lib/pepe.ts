// lib/pepe.ts
//
// Pepe Incarnate — larvae pick the real frog that *is* Pepe.
//
// Lean pipeline (deliberately smaller than Clawd Incarnate):
//
//   collect → filter → heats → rank → done → (optional) final
//
// Same bones as lobsters: iNaturalist research-grade photos, colour GATE,
// non-overlapping nomination heats, then one overlapping ranking pass.
// Ranking exposure is uneven — near-perfect frogs can tie without ever meeting.
// An optional FINAL round re-ranks only those strong frogs on identical slates
// so the champion is a true head-to-head, not an observation-id coin flip.
//
// Env (optional; defaults are fine to ship):
//   PEPE_TAXA            comma names, default Hylidae,Ranidae
//   PEPE_SHORTLIST_MAX   default 800
//   PEPE_PER_SPECIES     default 20
//   PEPE_COLLECT_MAX     hard stop on observations scanned, default 50000
//                        (frog taxa dwarf lobsters; without this, collect never ends)
//   PEPE_PAGES_PER_RUN   default 25
//   PEPE_HEAT_SIZE       default 8
//   PEPE_SLATE_SIZE      default 8
//   PEPE_RANK_MAX_SLATES cap ranking voters (default 96) — keeps vision cost lean
//   PEPE_RANK_BALLOT_TARGET soft mid-run cap (default 96); trims queue without wipe
//   PEPE_TOP_N           how many standings to keep on the page, default 12
//   PEPE_FINAL_MAX       max finalists in the equal-exposure final (default 8)
//   PEPE_FINAL_BALLOTS   how many larvae vote in the final (default 16)
//   GEMINI_PEPE_KEY      preferred; else GEMINI_LOBSTER_KEY (separate Google project);
//                        else GEMINI_API_KEY
//   GEMINI_MODEL         default gemini-3.6-flash

import { redis, getIndex, getProfile } from "@/lib/larvae";

// ───────────────────────────────────────────────────────────────────────────
// EDIT ME — what the larvae are looking for
// ───────────────────────────────────────────────────────────────────────────

export const PEPE_BRIEF = `Pepe the Frog is an internet meme frog — blank, expressive, a little sad, a little smug. Not a nature-magazine frog. The energy is "feels guy": frontal face, big eyes, that mouth, green, staring into the void of the timeline.`;

/**
 * Green is a GATE, not a preference. Pepe is green; a brown toad is simply
 * the wrong answer however good the photograph.
 */
export const NOMINATION_BRIEF = `FIRST, THE ONE HARD RULE. Pepe is green. A frog that is not green is not Pepe, no matter how funny or well-photographed it is.

A frog is ELIGIBLE only if the animal itself clearly reads green — the colour of the body and face, not of leaves, moss or lighting around it. Brown, grey, orange, yellow, blue, mottled mud and "sort of olive if you squint" are all INELIGIBLE. Judge the animal, not the scene. If you would not call it a green frog looking at it plainly, it is out.

Being cute, rare or award-winning does NOT make an ineligible animal eligible. If nothing in your set is green, nominate nothing. An honest empty heat is better than a brown compromise.

SECOND, AMONG THE GREEN ONES ONLY, two things can make one the right answer, and they pull against each other:

It might LOOK like Pepe — front-facing, big eyes toward the camera, that blank or faintly smug mouth, the classic meme silhouette rather than a side profile in a swamp.

Or it might FEEL like Pepe — blank internet energy, not glamorous, not "wildlife photographer of the year", a little sad or resigned, the frog equivalent of staring into the timeline.

The best answer is one green animal that somehow does both.`;

// ───────────────────────────────────────────────────────────────────────────
// Tunables
// ───────────────────────────────────────────────────────────────────────────

const INAT = "https://api.inaturalist.org/v1";
export const UA = "Larvatar/1.0 (+https://larvatar.vercel.app) pepe-incarnate";

export const SHORTLIST_MAX = Number(process.env.PEPE_SHORTLIST_MAX || 800);
export const PER_SPECIES_CAP = Number(process.env.PEPE_PER_SPECIES || 20);
/** Hard ceiling on iNat rows scanned — frog taxa never "run out" like lobsters. */
export const COLLECT_MAX = Number(process.env.PEPE_COLLECT_MAX || 50_000);
const PAGES_PER_RUN = Number(process.env.PEPE_PAGES_PER_RUN || 25);
const MAX_HEAT_SIZE = Number(process.env.PEPE_HEAT_SIZE || 8);
const SLATE_SIZE = Number(process.env.PEPE_SLATE_SIZE || 8);
/** Cap how many larvae get a ranking slate (new draws). Mid-run uses BALLOT_TARGET. */
const RANK_MAX_SLATES = Number(process.env.PEPE_RANK_MAX_SLATES || 96);
/** Soft ceiling on ranking ballots — trims remaining queue mid-run without a wipe. */
const RANK_BALLOT_TARGET = Number(process.env.PEPE_RANK_BALLOT_TARGET || 96);
export const TOP_N = Number(process.env.PEPE_TOP_N || 12);
/** Cap near-perfect frogs invited to the equal-exposure final. */
export const FINAL_MAX = Number(process.env.PEPE_FINAL_MAX || 8);
/** How many larvae vote in the final (each sees every finalist). */
export const FINAL_BALLOT_TARGET = Number(process.env.PEPE_FINAL_BALLOTS || 16);

const TAXA = (process.env.PEPE_TAXA || "Hylidae,Ranidae")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const NOMINATE_MODEL =
  process.env.GEMINI_PEPE_VOTE_MODEL || process.env.GEMINI_MODEL || "gemini-3.6-flash";

export function pepeKey(): string {
  // Prefer a dedicated pepe key; otherwise borrow the lobster project's key
  // (separate Google Cloud quota from GEMINI_API_KEY) before the shared API key.
  const k =
    process.env.GEMINI_PEPE_KEY ||
    process.env.GEMINI_LOBSTER_KEY ||
    process.env.GEMINI_API_KEY;
  if (!k) {
    throw new Error(
      "GEMINI_PEPE_KEY, GEMINI_LOBSTER_KEY, or GEMINI_API_KEY must be set"
    );
  }
  return k;
}

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export type Candidate = {
  id: number;
  species: string;
  sciName: string;
  wiki: string | null;
  photo: string;
  page: string;
  observer: string;
  license: string | null;
  faves: number;
  agrees: number;
};

export type Verdict = {
  id: number;
  rank: number;
  note: string;
  /** Did the larva judge this animal green enough to be eligible? */
  green: boolean;
};

export type Nomination = {
  wallet: string;
  name: string;
  pick: number | null;
  reason: string;
  against: number[];
  verdicts: Verdict[];
};

export type RankBallot = {
  wallet: string;
  name: string;
  pick: number;
  reason: string;
  order: number[];
};

export type Standing = {
  id: number;
  votes: number;
  views: number;
  meanRank: number;
};

export type FinalRound = {
  /** Near-perfect frogs selected from ranking standings. */
  finalistIds: number[];
  candidates: Candidate[];
  ballots: RankBallot[];
  standings: Standing[];
  championId: number | null;
  /** Champion from the uneven ranking pass, before the final. */
  preliminaryChampionId: number | null;
  ballotTarget: number;
  status: "seeded" | "running" | "done";
  updatedAt: string;
};

export type Results = {
  round: string;
  considered: number;
  shortlisted: number;
  heatsRun: number;
  nominees: Candidate[];
  nominations: Nomination[];
  abstentions: number;
  greenCount: number;
  /** Ranking pass ballots. */
  rankBallots: RankBallot[];
  /** Full standings after the ranking pass. */
  standings: Standing[];
  /** Top slice for the page. */
  top: Candidate[];
  championId: number | null;
  judged: (Candidate & {
    rank: number;
    note: string;
    green: boolean;
    judge: string;
    heatSize: number;
  })[];
  /** Equal-exposure final among near-perfect frogs (optional). */
  final?: FinalRound | null;
  updatedAt: string;
};

export type Phase = "collect" | "filter" | "heats" | "draw" | "rank" | "done";

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

export type Heat = { wallet: string; ids: number[] };
export type Slate = { wallet: string; ids: number[] };

// ───────────────────────────────────────────────────────────────────────────
// Redis — pepe: namespace so lobsters keys stay untouched
// ───────────────────────────────────────────────────────────────────────────

export const K = {
  state: "pepe:state",
  shortlist: "pepe:shortlist",
  species: "pepe:species",
  heats: "pepe:heats",
  heatQ: "pepe:heat:queue",
  nominations: "pepe:nominations",
  rankSlates: "pepe:rank:slates",
  rankQ: "pepe:rank:queue",
  rankBallots: "pepe:rank:ballots",
  standings: "pepe:standings",
  top: "pepe:top",
  champion: "pepe:champion",
  results: "pepe:results",
  /** Equal-exposure final among near-perfect ranking frogs. */
  finalIds: "pepe:final:ids",
  finalSlates: "pepe:final:slates",
  finalQ: "pepe:final:queue",
  finalBallots: "pepe:final:ballots",
  finalStandings: "pepe:final:standings",
  finalChampion: "pepe:final:champion",
  finalMeta: "pepe:final:meta",
};

export async function jget<T>(key: string, fallback: T): Promise<T> {
  const raw = await redis.get<string | T>(key);
  if (raw === null || raw === undefined) return fallback;
  return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
}

export async function jset(key: string, value: unknown) {
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

export async function resetRun() {
  await Promise.all(
    [
      K.state,
      K.shortlist,
      K.species,
      K.heats,
      K.heatQ,
      K.nominations,
      K.rankSlates,
      K.rankQ,
      K.rankBallots,
      K.standings,
      K.top,
      K.champion,
      K.finalIds,
      K.finalSlates,
      K.finalQ,
      K.finalBallots,
      K.finalStandings,
      K.finalChampion,
      K.finalMeta,
    ].map((k) => redis.del(k))
  );
}

/** Clear only the final round — leaves heats/ranking/results intact. */
export async function resetFinal() {
  await Promise.all(
    [
      K.finalIds,
      K.finalSlates,
      K.finalQ,
      K.finalBallots,
      K.finalStandings,
      K.finalChampion,
      K.finalMeta,
    ].map((k) => redis.del(k))
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
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

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

function mediumPhoto(url: string): string {
  return url.replace(/\/square\.(\w+)/, "/medium.$1");
}

function toCandidate(o: any): Candidate | null {
  const photo = o?.photos?.[0]?.url;
  if (!photo) return null;
  const license: string | null = o?.photos?.[0]?.license_code ?? null;
  if (!license) return null;
  return {
    id: Number(o.id),
    species: o?.taxon?.preferred_common_name || o?.taxon?.name || "unknown",
    sciName: o?.taxon?.name || "",
    wiki: o?.taxon?.wikipedia_url || null,
    photo: mediumPhoto(String(photo)),
    page: `https://www.inaturalist.org/observations/${o.id}`,
    observer: o?.user?.login || "anon",
    license,
    faves: Number(o?.faves_count || 0),
    agrees: Number(o?.identifications_count ?? o?.num_identification_agreements ?? 0),
  };
}

function weight(c: Candidate): number {
  return c.faves * 3 + c.agrees;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase: collect
// ───────────────────────────────────────────────────────────────────────────

export async function collectSlice(state: State, deadline: number): Promise<boolean> {
  let shortlist = await jget<Candidate[]>(K.shortlist, []);
  const species = await jget<Record<string, number>>(K.species, {});

  // Already over the scan ceiling (e.g. live run that started before COLLECT_MAX).
  if (state.considered >= COLLECT_MAX) {
    return true;
  }

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
      if (c) {
        const used = species[c.species] || 0;
        if (used >= PER_SPECIES_CAP) {
          const mine = shortlist.filter((s) => s.species === c.species);
          if (mine.length > 0) {
            const weakest = mine.reduce((a, b) => (weight(a) <= weight(b) ? a : b));
            if (weight(c) > weight(weakest)) {
              shortlist = shortlist.filter((s) => s.id !== weakest.id);
              shortlist.push(c);
            }
          }
        } else {
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
      }

      if (state.considered >= COLLECT_MAX) {
        await jset(K.shortlist, shortlist);
        await jset(K.species, species);
        return true;
      }
    }

    await new Promise((r) => setTimeout(r, 1000));
  }

  await jset(K.shortlist, shortlist);
  await jset(K.species, species);
  return state.considered >= COLLECT_MAX;
}

// ───────────────────────────────────────────────────────────────────────────
// Shuffle + heats
// ───────────────────────────────────────────────────────────────────────────

export function shuffleSeeded<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function drawHeats(): Promise<{ heats: number; perHeat: number; unused: number }> {
  const shortlist = await jget<Candidate[]>(K.shortlist, []);
  const index = await getIndex();
  const wallets = index.map((e) => e.wallet.toLowerCase());

  if (wallets.length === 0 || shortlist.length === 0) {
    await jset(K.heats, []);
    await jset(K.heatQ, []);
    return { heats: 0, perHeat: 0, unused: shortlist.length };
  }

  const perHeat = Math.min(MAX_HEAT_SIZE, Math.max(2, Math.floor(shortlist.length / wallets.length)));
  const pool = shuffleSeeded(shortlist, "pepe-heats:" + shortlist.length);

  const heats: Heat[] = wallets.map((w) => ({ wallet: w, ids: [] }));
  let cursor = 0;
  for (let slot = 0; slot < perHeat; slot++) {
    for (const heat of heats) {
      if (cursor >= pool.length) break;
      heat.ids.push(pool[cursor].id);
      cursor += 1;
    }
  }

  const live = heats.filter((h) => h.ids.length >= 2);
  await jset(K.heats, live);
  await jset(K.heatQ, live.map((h) => h.wallet));
  await jset(K.nominations, []);

  return { heats: live.length, perHeat, unused: pool.length - cursor };
}

// ───────────────────────────────────────────────────────────────────────────
// Gemini
// ───────────────────────────────────────────────────────────────────────────

export type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

export async function imagePart(url: string): Promise<Part | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") || "image/jpeg";
    if (!mime.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > 4_000_000) return null;
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

export class QuotaExhausted extends Error {}

export async function callGemini(
  model: string,
  system: string,
  parts: Part[],
  maxTokens: number,
  temperature: number
): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent` +
    `?key=${encodeURIComponent(pepeKey())}`;

  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts }],
    generationConfig: { maxOutputTokens: Math.max(maxTokens, 2048), temperature },
  };

  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    if (res.status === 429) {
      const text = await res.text();
      if (/per\s*day|PerDay|daily/i.test(text)) throw new QuotaExhausted(text.slice(0, 300));
      lastErr = "gemini 429";
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

export function parseJsonObject(text: string): any {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no json object");
  return JSON.parse(clean.slice(start, end + 1));
}

// ───────────────────────────────────────────────────────────────────────────
// Phase: heats (green gate + nominate one)
// ───────────────────────────────────────────────────────────────────────────

const NOMINATE_SYSTEM = `You are a single larva. You have been handed a small set of real frog photographs that nobody else is judging. Nominate exactly ONE of them as the animal that best represents Pepe the Frog.

${PEPE_BRIEF}

${NOMINATION_BRIEF}

This is your set alone — your nominee goes forward and the rest are discarded. Choose the way YOU would choose, out of your own values and quirks. If your reasoning could have been written by any other larva, it is the wrong reasoning.

Rank EVERY image, best first, and write one line on each — including the ones you are rejecting. Be specific about the animal in front of you. A dismissal that could apply to any frog is a wasted line.

Set "green": true only for animals that pass the colour gate, false for the rest. Put every green one above every non-green one in the ranking. If none are green, rank them anyway with all "green": false — that is an abstention and it is a valid answer.

Never refer to a candidate by its image number in "note" or "reason". Talk about the animal. The number belongs only in the "i" field.

Reply with ONLY a JSON object. "ranked" is ordered best to worst and must contain every image exactly once:
{"ranked":[{"i":<image number>,"green":true,"note":"<max 20 words, your verdict on this one>"}],"reason":"<max 40 words on why your top pick won, or why nothing qualified, in your voice>"}`;

export async function heatSlice(
  deadline: number,
  maxItems = Infinity
): Promise<{ done: boolean; count: number; failed: number; quota: boolean; lastError?: string }> {
  const queue = await jget<string[]>(K.heatQ, []);
  const heats = await jget<Heat[]>(K.heats, []);
  const shortlist = await jget<Candidate[]>(K.shortlist, []);
  const nominations = await jget<Nomination[]>(K.nominations, []);

  const byWallet = new Map(heats.map((h) => [h.wallet, h]));
  const byId = new Map(shortlist.map((c) => [c.id, c]));

  let count = 0;
  let failed = 0;
  let attempted = 0;
  let lastError: string | undefined;

  while (queue.length > 0 && Date.now() < deadline && attempted < maxItems) {
    const wallet = queue.shift()!;
    attempted += 1;

    const heat = byWallet.get(wallet);
    const profile = await getProfile(wallet);
    if (!heat || !profile) {
      await jset(K.heatQ, queue);
      continue;
    }

    const group = heat.ids.map((id) => byId.get(id)).filter(Boolean) as Candidate[];
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
    for (const c of group) {
      if (Date.now() >= deadline) break;
      const img = await imagePart(c.photo);
      if (!img) continue;
      parts.push({ text: `Image ${present.length + 1} — ${c.species}:` });
      parts.push(img);
      present.push(c);
    }

    if (present.length < 2) {
      await jset(K.heatQ, [...queue, wallet]);
      failed += 1;
      continue;
    }

    parts.push({ text: `Nominate one of the ${present.length} images. JSON only.` });

    try {
      const raw = await callGemini(NOMINATE_MODEL, NOMINATE_SYSTEM, parts, 900, 1.0);
      const obj = parseJsonObject(raw);

      const seen = new Set<number>();
      const verdicts: Verdict[] = [];
      for (const row of Array.isArray(obj?.ranked) ? obj.ranked : []) {
        const c = present[Number(row?.i) - 1];
        if (!c || seen.has(c.id)) continue;
        seen.add(c.id);
        verdicts.push({
          id: c.id,
          rank: verdicts.length + 1,
          note: String(row?.note || "").slice(0, 200),
          green: row?.green === true,
        });
      }
      for (const c of present) {
        if (seen.has(c.id)) continue;
        verdicts.push({ id: c.id, rank: verdicts.length + 1, note: "", green: false });
      }

      const eligible = verdicts.find((v) => v.green);
      const chosen = eligible ? present.find((c) => c.id === eligible.id) : undefined;

      if (verdicts.length > 0) {
        nominations.push({
          wallet,
          name: profile.profile.name,
          pick: chosen ? chosen.id : null,
          reason: String(obj.reason || "").slice(0, 300),
          against: chosen ? present.filter((c) => c.id !== chosen.id).map((c) => c.id) : [],
          verdicts,
        });
        count += 1;
      } else {
        failed += 1;
      }
    } catch (e) {
      if (e instanceof QuotaExhausted) {
        await jset(K.heatQ, [wallet, ...queue]);
        await jset(K.nominations, nominations);
        return { done: false, count, failed, quota: true, lastError: String(e).slice(0, 300) };
      }
      failed += 1;
      lastError = lastError || String(e).slice(0, 300);
    }

    await jset(K.heatQ, queue);
    await jset(K.nominations, nominations);
  }

  return { done: queue.length === 0, count, failed, quota: false, lastError };
}

// ───────────────────────────────────────────────────────────────────────────
// Phase: rank — overlapping slates of nominees → champion
// ───────────────────────────────────────────────────────────────────────────

export async function drawRankSlates(): Promise<{
  slates: number;
  slateSize: number;
  viewsEach: number;
}> {
  const results = await getResults();
  const nominees = results?.nominees || [];
  const index = await getIndex();
  let wallets = index.map((e: { wallet: string }) => e.wallet.toLowerCase());

  if (nominees.length === 0 || wallets.length === 0) {
    await jset(K.rankSlates, []);
    await jset(K.rankQ, []);
    return { slates: 0, slateSize: 0, viewsEach: 0 };
  }

  // Lean draw: subsample voters when the hive is huge. Deterministic shuffle
  // so a re-draw with the same field is stable.
  if (wallets.length > RANK_MAX_SLATES) {
    wallets = shuffleSeeded(
      wallets,
      `pepe-rank-wallets:${nominees.length}:${wallets.length}`
    ).slice(0, RANK_MAX_SLATES);
  }

  const slateSize = Math.min(SLATE_SIZE, nominees.length);
  const needed = wallets.length * slateSize;
  const passes = Math.ceil(needed / nominees.length);

  const pool: number[] = [];
  for (let p = 0; p < passes; p++) {
    for (const c of shuffleSeeded(nominees, `pepe-rank:${p}:${nominees.length}`)) {
      pool.push(c.id);
    }
  }

  const slates: Slate[] = [];
  let cursor = 0;
  for (const wallet of wallets) {
    const ids: number[] = [];
    while (ids.length < slateSize && cursor < pool.length) {
      const id = pool[cursor++];
      if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length >= 2) slates.push({ wallet, ids });
  }

  await jset(K.rankSlates, slates);
  await jset(K.rankQ, slates.map((s) => s.wallet));
  await jset(K.rankBallots, []);

  return {
    slates: slates.length,
    slateSize,
    viewsEach: Math.round((slates.length * slateSize) / nominees.length),
  };
}

const RANK_SYSTEM = `You are a single larva in the ranking pass. Every frog in front of you has already been nominated by another larva and every one of them is green enough to qualify. The colour question is settled — do not spend your reasoning on it.

${PEPE_BRIEF}

What decides it now is a tension:

It might LOOK like Pepe — front-facing, big eyes, that blank or faintly smug mouth, meme silhouette.

Or it might FEEL like Pepe — blank internet energy, not glamorous wildlife photography, a little sad or resigned.

These pull against each other. A frog that only poses is a sticker. A frog that only mopes is invisible. Say which side you weighted and why, in your own voice — if your reasoning could have been written by any other larva, it is the wrong reasoning.

Rank EVERY image, best first, and never refer to a candidate by its image number in your prose. Talk about the animal.

Reply with ONLY: {"ranked":[<image numbers, best first, each exactly once>],"reason":"<max 40 words on why your top choice won, in your voice>"}`;

/** First-place tallies from current ballots — used for mid-run early stop. */
function firstPlaceLead(ballots: RankBallot[]): { top: number; second: number; lead: number } {
  const votes = new Map<number, number>();
  for (const b of ballots) {
    votes.set(b.pick, (votes.get(b.pick) || 0) + 1);
  }
  const ranked = [...votes.values()].sort((a, b) => b - a);
  const top = ranked[0] || 0;
  const second = ranked[1] || 0;
  return { top, second, lead: top - second };
}

/**
 * Mid-run: trim remaining queue toward PEPE_RANK_BALLOT_TARGET, and stop early
 * when first place cannot be caught (lead > remaining ballots).
 * Returns true when ranking should freeze now.
 */
async function maybeFinishRankEarly(
  ballots: RankBallot[],
  queue: string[]
): Promise<{ queue: string[]; finish: boolean; reason?: string }> {
  if (ballots.length === 0) return { queue, finish: false };

  // Soft cap — keep work lean even if the original draw was large.
  if (RANK_BALLOT_TARGET > 0 && ballots.length >= RANK_BALLOT_TARGET) {
    await jset(K.rankQ, []);
    return {
      queue: [],
      finish: true,
      reason: `ballot target ${RANK_BALLOT_TARGET} reached`,
    };
  }

  if (RANK_BALLOT_TARGET > 0 && ballots.length + queue.length > RANK_BALLOT_TARGET) {
    const keep = Math.max(0, RANK_BALLOT_TARGET - ballots.length);
    queue = queue.slice(0, keep);
    await jset(K.rankQ, queue);
  }

  const { lead } = firstPlaceLead(ballots);
  // Plurality lock: no remaining ballot can overturn first place.
  if (ballots.length >= 24 && lead > queue.length) {
    await jset(K.rankQ, []);
    return {
      queue: [],
      finish: true,
      reason: `lead ${lead} > remaining ${queue.length}`,
    };
  }

  return { queue, finish: false };
}

export async function rankSlice(
  deadline: number,
  maxItems = Infinity
): Promise<{ done: boolean; count: number; failed: number; quota: boolean; lastError?: string }> {
  let queue = await jget<string[]>(K.rankQ, []);
  const slates = await jget<Slate[]>(K.rankSlates, []);
  const ballots = await jget<RankBallot[]>(K.rankBallots, []);
  const results = await getResults();

  const early = await maybeFinishRankEarly(ballots, queue);
  queue = early.queue;
  if (early.finish) {
    return { done: true, count: 0, failed: 0, quota: false, lastError: early.reason };
  }

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
      await jset(K.rankQ, queue);
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
      await jset(K.rankQ, [...queue, wallet]);
      failed += 1;
      continue;
    }

    parts.push({ text: `Rank the ${present.length} images. JSON only.` });

    try {
      const raw = await callGemini(NOMINATE_MODEL, RANK_SYSTEM, parts, 600, 1.0);
      const obj = parseJsonObject(raw);

      const seen = new Set<number>();
      const order: number[] = [];
      for (const n of Array.isArray(obj?.ranked) ? obj.ranked : []) {
        const c = present[Number(n) - 1];
        if (!c || seen.has(c.id)) continue;
        seen.add(c.id);
        order.push(c.id);
      }
      for (const c of present) {
        if (!seen.has(c.id)) order.push(c.id);
      }

      if (order.length === 0) {
        failed += 1;
      } else {
        ballots.push({
          wallet,
          name: profile.profile.name,
          pick: order[0],
          reason: String(obj.reason || "").slice(0, 300),
          order,
        });
        count += 1;
      }
    } catch (e) {
      if (e instanceof QuotaExhausted) {
        await jset(K.rankQ, [wallet, ...queue]);
        await jset(K.rankBallots, ballots);
        return { done: false, count, failed, quota: true, lastError: String(e).slice(0, 300) };
      }
      failed += 1;
      lastError = lastError || String(e).slice(0, 300);
    }

    await jset(K.rankQ, queue);
    await jset(K.rankBallots, ballots);

    const again = await maybeFinishRankEarly(ballots, queue);
    queue = again.queue;
    if (again.finish) {
      return { done: true, count, failed, quota: false, lastError: again.reason };
    }
  }

  return { done: queue.length === 0, count, failed, quota: false, lastError };
}

/** Tally first-place votes, tie-break on mean rank. Freeze top + champion. */
export async function freezeChampion(): Promise<{ championId: number | null; top: Candidate[] }> {
  const results = await getResults();
  const nominees = results?.nominees || [];
  const ballots = await jget<RankBallot[]>(K.rankBallots, []);
  const byId = new Map(nominees.map((c) => [c.id, c]));

  const stats = new Map<number, { votes: number; ranks: number[]; views: number }>();
  for (const c of nominees) {
    stats.set(c.id, { votes: 0, ranks: [], views: 0 });
  }

  for (const b of ballots) {
    const pick = stats.get(b.pick);
    if (pick) pick.votes += 1;
    b.order.forEach((id, i) => {
      const s = stats.get(id);
      if (!s) return;
      s.views += 1;
      s.ranks.push(i + 1);
    });
  }

  const standings: Standing[] = [...stats.entries()]
    .map(([id, s]) => ({
      id,
      votes: s.votes,
      views: s.views,
      meanRank: s.ranks.length ? s.ranks.reduce((a, b) => a + b, 0) / s.ranks.length : 99,
    }))
    .sort((a, b) => b.votes - a.votes || a.meanRank - b.meanRank || a.id - b.id);

  const topIds = standings.slice(0, TOP_N).map((s) => s.id);
  const top = topIds.map((id) => byId.get(id)).filter(Boolean) as Candidate[];
  const championId = standings[0]?.votes > 0 ? standings[0].id : null;

  await jset(K.standings, standings);
  await jset(K.top, top);
  await jset(K.champion, championId);

  return { championId, top };
}

// ───────────────────────────────────────────────────────────────────────────
// Final — equal-exposure vote among near-perfect ranking frogs
// ───────────────────────────────────────────────────────────────────────────

export type FinalMeta = {
  status: "seeded" | "running" | "done";
  ballotTarget: number;
  preliminaryChampionId: number | null;
  seededAt: string;
  updatedAt: string;
  note?: string;
};

/**
 * Near-perfect on firsts under uneven exposure:
 *   - ≥5 firsts and firsts/views ≥ 0.8  (covers 5/5, 5/6, 6/6, 6/7, 7/7…)
 *   - or ≥6 absolute firsts regardless of ratio
 */
export function isStrongStanding(s: Standing): boolean {
  if (s.views <= 0 || s.votes <= 0) return false;
  const ratio = s.votes / s.views;
  return (s.votes >= 5 && ratio >= 0.8) || s.votes >= 6;
}

export function selectFinalistIds(
  standings: Standing[],
  max = FINAL_MAX
): number[] {
  return [...standings]
    .filter(isStrongStanding)
    .sort(
      (a, b) =>
        b.votes - a.votes ||
        b.votes / b.views - a.votes / a.views ||
        a.meanRank - b.meanRank ||
        a.id - b.id
    )
    .slice(0, Math.max(2, max))
    .map((s) => s.id);
}

const FINAL_SYSTEM = `You are a single larva in the FINAL vote for Pepe Incarnate. Every frog in front of you already went near-perfect in the ranking heats — they all look green enough and they all won their overlapping slates. Colour is settled. Heat luck is settled.

${PEPE_BRIEF}

What decides it now is a tension:

It might LOOK like Pepe — front-facing, big eyes, that blank or faintly smug mouth, meme silhouette.

Or it might FEEL like Pepe — blank internet energy, not glamorous wildlife photography, a little sad or resigned.

These pull against each other. A frog that only poses is a sticker. A frog that only mopes is invisible. Say which side you weighted and why, in your own voice — if your reasoning could have been written by any other larva, it is the wrong reasoning.

You see EVERY finalist. Rank EVERY image, best first. Never refer to a candidate by its image number in your prose. Talk about the animal.

Reply with ONLY: {"ranked":[<image numbers, best first, each exactly once>],"reason":"<max 40 words on why your top choice won, in your voice>"}`;

/** Seed equal-exposure final slates from ranking standings. Does not wipe heats/rank. */
export async function seedFinal(): Promise<{
  finalists: number;
  ballots: number;
  ids: number[];
  species: string[];
}> {
  const results = await getResults();
  if (!results || (results.standings || []).length === 0) {
    throw new Error("no ranking standings — finish the ranking pass first");
  }

  const ids = selectFinalistIds(results.standings, FINAL_MAX);
  if (ids.length < 2) {
    throw new Error("fewer than 2 strong finalists — nothing to decide");
  }

  const byId = new Map(
    [...(results.nominees || []), ...(results.top || [])].map((c) => [c.id, c])
  );
  const candidates = ids.map((id) => byId.get(id)).filter(Boolean) as Candidate[];
  if (candidates.length < 2) {
    throw new Error("finalist candidates missing from nominees/top");
  }

  const index = await getIndex();
  let wallets = index.map((e: { wallet: string }) => e.wallet.toLowerCase());
  wallets = shuffleSeeded(wallets, `pepe-final:${ids.join(",")}`).slice(
    0,
    FINAL_BALLOT_TARGET
  );

  // Every larva sees EVERY finalist — only presentation order is shuffled.
  const slates: Slate[] = wallets.map((wallet) => ({
    wallet,
    ids: shuffleSeeded(ids, `pepe-final-order:${wallet}`),
  }));

  const preliminaryChampionId =
    results.championId ?? (await jget<number | null>(K.champion, null));

  const now = new Date().toISOString();
  const meta: FinalMeta = {
    status: "seeded",
    ballotTarget: FINAL_BALLOT_TARGET,
    preliminaryChampionId,
    seededAt: now,
    updatedAt: now,
    note: `${candidates.length} finalists · ${slates.length} equal-exposure ballots`,
  };

  await jset(K.finalIds, ids);
  await jset(K.finalSlates, slates);
  await jset(K.finalQ, slates.map((s) => s.wallet));
  await jset(K.finalBallots, []);
  await jset(K.finalStandings, []);
  await jset(K.finalChampion, null);
  await jset(K.finalMeta, meta);

  return {
    finalists: candidates.length,
    ballots: slates.length,
    ids,
    species: candidates.map((c) => c.species),
  };
}

export async function finalSlice(
  deadline: number,
  maxItems = Infinity
): Promise<{ done: boolean; count: number; failed: number; quota: boolean; lastError?: string }> {
  let queue = await jget<string[]>(K.finalQ, []);
  const slates = await jget<Slate[]>(K.finalSlates, []);
  const ballots = await jget<RankBallot[]>(K.finalBallots, []);
  const ids = await jget<number[]>(K.finalIds, []);
  const meta = await jget<FinalMeta | null>(K.finalMeta, null);
  const results = await getResults();

  if (ids.length < 2 || slates.length === 0) {
    return { done: true, count: 0, failed: 0, quota: false, lastError: "final not seeded" };
  }

  if (queue.length === 0) {
    return { done: true, count: 0, failed: 0, quota: false };
  }

  if (meta) {
    meta.status = "running";
    meta.updatedAt = new Date().toISOString();
    await jset(K.finalMeta, meta);
  }

  const byWallet = new Map(slates.map((s) => [s.wallet, s]));
  const byId = new Map(
    [...(results?.nominees || []), ...(results?.top || [])].map((c) => [c.id, c])
  );

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
      await jset(K.finalQ, queue);
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
      await jset(K.finalQ, [...queue, wallet]);
      failed += 1;
      continue;
    }

    parts.push({
      text: `This is the FINAL. Rank all ${present.length} frogs. JSON only.`,
    });

    try {
      const raw = await callGemini(NOMINATE_MODEL, FINAL_SYSTEM, parts, 600, 1.0);
      const obj = parseJsonObject(raw);

      const seen = new Set<number>();
      const order: number[] = [];
      for (const n of Array.isArray(obj?.ranked) ? obj.ranked : []) {
        const c = present[Number(n) - 1];
        if (!c || seen.has(c.id)) continue;
        seen.add(c.id);
        order.push(c.id);
      }
      for (const c of present) {
        if (!seen.has(c.id)) order.push(c.id);
      }

      if (order.length === 0) {
        failed += 1;
      } else {
        ballots.push({
          wallet,
          name: profile.profile.name,
          pick: order[0],
          reason: String(obj.reason || "").slice(0, 300),
          order,
        });
        count += 1;
      }
    } catch (e) {
      if (e instanceof QuotaExhausted) {
        await jset(K.finalQ, [wallet, ...queue]);
        await jset(K.finalBallots, ballots);
        return { done: false, count, failed, quota: true, lastError: String(e).slice(0, 300) };
      }
      failed += 1;
      lastError = lastError || String(e).slice(0, 300);
    }

    await jset(K.finalQ, queue);
    await jset(K.finalBallots, ballots);
  }

  return { done: queue.length === 0, count, failed, quota: false, lastError };
}

/** Tally final ballots (equal views). Promote winner to pepe:champion. */
export async function freezeFinalChampion(): Promise<{
  championId: number | null;
  standings: Standing[];
  changed: boolean;
  preliminaryChampionId: number | null;
}> {
  const ids = await jget<number[]>(K.finalIds, []);
  const ballots = await jget<RankBallot[]>(K.finalBallots, []);
  const meta = await jget<FinalMeta | null>(K.finalMeta, null);
  const results = await getResults();
  const byId = new Map(
    [...(results?.nominees || []), ...(results?.top || [])].map((c) => [c.id, c])
  );

  const stats = new Map<number, { votes: number; ranks: number[]; views: number }>();
  for (const id of ids) {
    stats.set(id, { votes: 0, ranks: [], views: 0 });
  }

  for (const b of ballots) {
    const pick = stats.get(b.pick);
    if (pick) pick.votes += 1;
    b.order.forEach((id, i) => {
      const s = stats.get(id);
      if (!s) return;
      s.views += 1;
      s.ranks.push(i + 1);
    });
  }

  const standings: Standing[] = [...stats.entries()]
    .map(([id, s]) => ({
      id,
      votes: s.votes,
      views: s.views,
      meanRank: s.ranks.length ? s.ranks.reduce((a, b) => a + b, 0) / s.ranks.length : 99,
    }))
    .sort((a, b) => b.votes - a.votes || a.meanRank - b.meanRank || a.id - b.id);

  const championId = standings[0]?.votes > 0 ? standings[0].id : null;
  const preliminaryChampionId =
    meta?.preliminaryChampionId ?? results?.championId ?? null;
  const changed = championId !== null && championId !== preliminaryChampionId;

  const now = new Date().toISOString();
  await jset(K.finalStandings, standings);
  await jset(K.finalChampion, championId);
  if (championId !== null) {
    await jset(K.champion, championId);
    // Keep ranking top-12 as the field; only the declared champ moves.
    const champ = byId.get(championId);
    if (champ && results) {
      const top = [champ, ...(results.top || []).filter((c) => c.id !== championId)].slice(
        0,
        TOP_N
      );
      await jset(K.top, top);
    }
  }

  if (meta) {
    meta.status = "done";
    meta.updatedAt = now;
    meta.note = changed
      ? `final overturned ranking champ ${preliminaryChampionId} → ${championId}`
      : `final confirmed ranking champ ${championId}`;
    await jset(K.finalMeta, meta);
  }

  const state = await getState();
  if (state) await publish(state);

  return { championId, standings, changed, preliminaryChampionId };
}

export async function getFinalRound(): Promise<FinalRound | null> {
  const meta = await jget<FinalMeta | null>(K.finalMeta, null);
  if (!meta) return null;
  const ids = await jget<number[]>(K.finalIds, []);
  const ballots = await jget<RankBallot[]>(K.finalBallots, []);
  const standings = await jget<Standing[]>(K.finalStandings, []);
  const championId = await jget<number | null>(K.finalChampion, null);
  const results = await getResults();
  const byId = new Map(
    [...(results?.nominees || []), ...(results?.top || [])].map((c) => [c.id, c])
  );
  const candidates = ids.map((id) => byId.get(id)).filter(Boolean) as Candidate[];

  return {
    finalistIds: ids,
    candidates,
    ballots,
    standings,
    championId,
    preliminaryChampionId: meta.preliminaryChampionId,
    ballotTarget: meta.ballotTarget,
    status: meta.status,
    updatedAt: meta.updatedAt,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Publish
// ───────────────────────────────────────────────────────────────────────────

export async function publish(state: State): Promise<Results> {
  const shortlist = await jget<Candidate[]>(K.shortlist, []);
  const nominations = await jget<Nomination[]>(K.nominations, []);
  const heats = await jget<Heat[]>(K.heats, []);
  const existing = await getResults();

  if (nominations.length === 0 && existing) {
    // Still refresh final payload onto existing results when heats are frozen.
    const final = await getFinalRound();
    if (final) {
      const champ =
        final.status === "done" && final.championId !== null
          ? final.championId
          : existing.championId;
      const merged: Results = {
        ...existing,
        championId: champ,
        final,
        updatedAt: new Date().toISOString(),
      };
      await jset(K.results, merged);
      return merged;
    }
    return existing;
  }

  const byId = new Map(shortlist.map((c) => [c.id, c]));
  const nominees = nominations
    .map((n) => (n.pick === null ? undefined : byId.get(n.pick)))
    .filter(Boolean) as Candidate[];
  const abstentions = nominations.filter((n) => n.pick === null).length;

  const judged = nominations.flatMap((n) =>
    (n.verdicts || []).flatMap((v) => {
      const c = byId.get(v.id);
      if (!c) return [];
      return [
        {
          ...c,
          rank: v.rank,
          note: v.note,
          green: v.green,
          judge: n.name,
          heatSize: n.verdicts.length,
        },
      ];
    })
  );

  const rankBallots = await jget<RankBallot[]>(K.rankBallots, []);
  const standings = await jget<Standing[]>(K.standings, []);
  const top = await jget<Candidate[]>(K.top, []);
  const championId = await jget<number | null>(K.champion, null);
  const final = await getFinalRound();

  const results: Results = {
    round: state.round,
    considered: state.considered,
    shortlisted: shortlist.length,
    heatsRun: heats.length,
    nominees,
    nominations,
    abstentions,
    greenCount: judged.filter((j) => j.green).length,
    rankBallots,
    standings,
    top,
    championId,
    judged,
    final,
    updatedAt: new Date().toISOString(),
  };

  await jset(K.results, results);
  return results;
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
