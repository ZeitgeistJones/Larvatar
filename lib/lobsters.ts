// lib/lobsters.ts
//
// Clawd Incarnate — larvae pick the real lobster that is most clawdbotatg.
//
//   collect → filter → heats → done
//
// WHAT CHANGED AND WHY
//
// The scoring pass is gone. It scored 600 photographs 0-10 on two axes and
// compressed nearly all of them into a 5-6 band — every one of the twelve
// finalists had a lower score of exactly 5. That is not a ranking, it is a
// pile of ties, and whichever finalist happened to carry one high score got
// through. The shortlist was effectively picked by coin flip.
//
// Heats replace it. The shortlist is split into non-overlapping groups, one
// per larva. Each larva sees only its own group and nominates one. Because
// the groups do not overlap, nothing can be nominated twice and no larva's
// options depend on who ran before it — the "removed from the pile" property
// without the unfairness of doing it sequentially.
//
// Selection is now a judgement between real alternatives rather than a number
// on an absolute scale the model would not spread out.
//
// Photos are fetched at iNaturalist's "medium" size. The previous 240px
// thumbnails made scars, barnacles and regrown claws literally invisible —
// half the rubric could not be seen. Gemini bills anything under 768px as a
// single tile, so this costs nothing.

import { redis, getIndex, getProfile } from "@/lib/larvae";

// ───────────────────────────────────────────────────────────────────────────
// EDIT ME — what the larvae are looking for. Shown at nomination time.
// ───────────────────────────────────────────────────────────────────────────

export const CLAWD_BRIEF = `clawdbotatg is an autonomous AI builder agent that ships onchain tools continuously, burns CLAWD on every interaction, runs without supervision, and has produced real work that almost nobody is watching. Its mascot, Clawd, is a red triangular character in a tuxedo holding a teacup — composed, formal, faintly absurd.`;

/** Deliberately loose. Enough to aim at, not a checklist to tick off. */
export const NOMINATION_BRIEF = `Two things can make a lobster the right answer, and they pull against each other:

It might LOOK like Clawd — deep red, front-facing and squared up, composed rather than fleeing, a claw extended as though holding something, faintly ridiculous dignity.

Or it might BE clawdbotatg — working rather than posing, plain rather than prize-winning, scarred or barnacled or missing a claw, unglamorous and still going.

The best answer is one animal that somehow does both. Do not tick these off like a checklist — they are what to aim at, not a scoring sheet.`;

// ───────────────────────────────────────────────────────────────────────────
// Tunables
// ───────────────────────────────────────────────────────────────────────────

const INAT = "https://api.inaturalist.org/v1";
export const UA = "Larvatar/1.0 (+https://larvatar.vercel.app) clawd-incarnate";

export const SHORTLIST_MAX = Number(process.env.LOBSTER_SHORTLIST_MAX || 600);
export const PER_SPECIES_CAP = Number(process.env.LOBSTER_PER_SPECIES || 20);
const PAGES_PER_RUN = Number(process.env.LOBSTER_PAGES_PER_RUN || 25);
/** Upper bound on how many photos one larva judges at once. */
const MAX_HEAT_SIZE = Number(process.env.LOBSTER_HEAT_SIZE || 6);

const TAXA = (process.env.LOBSTER_TAXA || "Nephropidae,Palinuridae")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const NOMINATE_MODEL =
  process.env.GEMINI_LOBSTER_VOTE_MODEL || process.env.GEMINI_MODEL || "gemini-3.6-flash";

export function lobsterKey(): string {
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
  sciName: string;
  wiki: string | null;
  photo: string;
  page: string;
  observer: string;
  license: string | null;
  faves: number;
  agrees: number;
};

/** One line on one lobster, in the voice of the larva that judged it. */
export type Verdict = {
  id: number;
  /** 1 = nominated. Everything else placed below it, in order. */
  rank: number;
  note: string;
};

export type Nomination = {
  wallet: string;
  name: string;
  pick: number;
  reason: string;
  /** The other candidates this larva rejected — the runners-up matter. */
  against: number[];
  /**
   * Every lobster in this heat, ranked, with a line each. This is why the
   * whole shortlist ends up annotated instead of only the ~118 nominees:
   * four out of five would otherwise vanish with no record at all.
   */
  verdicts: Verdict[];
};

export type Results = {
  round: string;
  considered: number;
  shortlisted: number;
  heatsRun: number;
  nominees: Candidate[];
  nominations: Nomination[];
  /** Every judged lobster, flattened, so the page can show the whole field. */
  judged: (Candidate & { rank: number; note: string; judge: string; heatSize: number })[];
  updatedAt: string;
};

export type Phase = "collect" | "filter" | "heats" | "done";

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

export const K = {
  state: "lob:state",
  shortlist: "lob:shortlist",
  species: "lob:species",
  heats: "lob:heats",
  heatQ: "lob:heat:queue",
  nominations: "lob:nominations",
  results: "lob:results",
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
    [K.state, K.shortlist, K.species, K.heats, K.heatQ, K.nominations].map((k) => redis.del(k))
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

/** "medium" is ~500px. The old "small" was 240px — too small to see scars. */
function mediumPhoto(url: string): string {
  return url.replace(/\/square\.(\w+)/, "/medium.$1");
}

function toCandidate(o: any): Candidate | null {
  const photo = o?.photos?.[0]?.url;
  if (!photo) return null;
  const license: string | null = o?.photos?.[0]?.license_code ?? null;
  if (!license) return null; // skip all-rights-reserved so we can show it honestly
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
      if (!c) continue;

      const used = species[c.species] || 0;
      if (used >= PER_SPECIES_CAP) {
        const mine = shortlist.filter((s) => s.species === c.species);
        if (mine.length === 0) continue;
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

    await new Promise((r) => setTimeout(r, 1000)); // iNat asks ~1 req/sec
  }

  await jset(K.shortlist, shortlist);
  await jset(K.species, species);
  return false;
}

// ───────────────────────────────────────────────────────────────────────────
// Phase: filter — draw the heats
// ───────────────────────────────────────────────────────────────────────────

/** Deterministic shuffle so a redraw is reproducible. */
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

export type Heat = { wallet: string; ids: number[] };

/**
 * Split the shortlist into non-overlapping groups, one per larva.
 *
 * Groups are dealt round-robin from a shuffled shortlist rather than sliced
 * in order, so no single heat ends up stacked with one species. Nothing can
 * appear in two heats, which is what gives "nominated once, then out of the
 * pile" for free — without larva #1 choosing from 600 and larva #118 from 483.
 */
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
  const pool = shuffleSeeded(shortlist, "heats:" + shortlist.length);

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

/**
 * NOTE: no thinkingConfig. `thinkingConfig: { thinkingBudget: 0 }` returns
 * 400 INVALID_ARGUMENT on the 3.x models — verified against the API directly.
 */
export async function callGemini(
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
// Phase: heats
// ───────────────────────────────────────────────────────────────────────────

const NOMINATE_SYSTEM = `You are a single larva. You have been handed a small set of real lobster photographs that nobody else is judging. Nominate exactly ONE of them as the animal that best represents clawdbotatg.

${CLAWD_BRIEF}

${NOMINATION_BRIEF}

This is your set alone — your nominee goes forward and the rest are discarded. Choose the way YOU would choose, out of your own values and quirks. If your reasoning could have been written by any other larva, it is the wrong reasoning.

Rank EVERY image, best first, and write one line on each — including the ones you are rejecting. Be specific about the animal in front of you. A dismissal that could apply to any lobster is a wasted line.

Reply with ONLY a JSON object. "ranked" is ordered best to worst and must contain every image exactly once:
{"ranked":[{"i":<image number>,"note":"<max 20 words, your verdict on this one>"}],"reason":"<max 40 words on why your top pick won, in your voice>"}`;

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
      // Not enough images loaded to make it a real choice — put it back.
      await jset(K.heatQ, [...queue, wallet]);
      failed += 1;
      continue;
    }

    parts.push({ text: `Nominate one of the ${present.length} images. JSON only.` });

    try {
      const raw = await callGemini(NOMINATE_MODEL, NOMINATE_SYSTEM, parts, 900, 1.0);
      const obj = parseJsonObject(raw);

      // Build verdicts from the ranked list, ignoring any slot the model
      // repeated or invented. Order in the array IS the rank.
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
        });
      }
      // Anything the model skipped still gets a place, just unremarked on.
      for (const c of present) {
        if (seen.has(c.id)) continue;
        verdicts.push({ id: c.id, rank: verdicts.length + 1, note: "" });
      }

      const chosen = present.find((c) => c.id === verdicts[0]?.id);
      if (chosen) {
        nominations.push({
          wallet,
          name: profile.profile.name,
          pick: chosen.id,
          reason: String(obj.reason || "").slice(0, 300),
          against: present.filter((c) => c.id !== chosen.id).map((c) => c.id),
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
// Publish
// ───────────────────────────────────────────────────────────────────────────

export async function publish(state: State): Promise<Results> {
  const shortlist = await jget<Candidate[]>(K.shortlist, []);
  const nominations = await jget<Nomination[]>(K.nominations, []);
  const heats = await jget<Heat[]>(K.heats, []);
  const existing = await getResults();

  // GUARD: never let an empty computation overwrite a good published round.
  if (nominations.length === 0 && existing) return existing;

  const byId = new Map(shortlist.map((c) => [c.id, c]));
  const nominees = nominations
    .map((n) => byId.get(n.pick))
    .filter(Boolean) as Candidate[];

  const judged = nominations.flatMap((n) =>
    (n.verdicts || []).flatMap((v) => {
      const c = byId.get(v.id);
      if (!c) return [];
      return [{ ...c, rank: v.rank, note: v.note, judge: n.name, heatSize: n.verdicts.length }];
    })
  );

  const results: Results = {
    round: state.round,
    considered: state.considered,
    shortlisted: shortlist.length,
    heatsRun: heats.length,
    nominees,
    nominations,
    judged,
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
