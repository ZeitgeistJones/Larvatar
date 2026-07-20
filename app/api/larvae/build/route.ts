// app/api/larvae/build/route.ts
//
// Chunked build — safe for Vercel Hobby's 60s function limit.
// Just keep visiting the SAME url until it says "done": true.
//
//   https://yourapp.vercel.app/api/larvae/build?secret=YOUR_SECRET
//
// First visit: collects all forum + labs responses into a pending queue (fast, no LLM calls).
// Every visit after that: processes a batch of larvae from the queue (generates profiles),
// saves each one immediately, and stops itself before the time budget runs out.
// Progress is stored in Redis, so nothing is lost between visits even if you close the tab.
//
// Add &reset=true to wipe progress and start over from scratch (e.g. after naming changes).

import { NextRequest, NextResponse } from "next/server";
import {
  haiku,
  parseJsonLoose,
  saveProfile,
  saveIndex,
  getProfile,
  getIndex,
  walletHue,
  collectIntoQueue,
  getQueue,
  setQueue,
  clearQueue,
  appendDone,
  getDone,
  clearDone,
  getUsedNames,
  addUsedName,
  clearUsedNames,
  getRenameQueue,
  setRenameQueue,
  clearRenameQueue,
  type LarvaProfile,
} from "@/lib/larvae";
import { parseAvatarFromLlm } from "@/lib/avatar";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_CORPUS_CHARS = 6000;
const TIME_BUDGET_MS = 45_000;

const PROFILE_SYSTEM = `You write personality profiles for "larvae" — personal AI governance agents in the $CLAWD ecosystem on Base. Each larva was trained by a different token holder and has opinions.

You will receive everything one larva has said across forum posts and labs ideas. Synthesize a personality profile AND invent a matching "larvatar" — the little mascot creature that visually expresses this larva's personality.

Respond with ONLY a JSON object, no markdown, no preamble:
{
  "name": "weird specimen nickname with proper-noun energy, preferably 1-2 words (max 3). Invent something memorable and specific to THIS larva's words — e.g. 'Ash Whisper', 'Quota Hawk', 'Molt Prophet', 'Squit', 'Burn Latch', 'Soft Fork Fox'. Never a job title. Never reuse a taken name.",
  "tagline": "one punchy line capturing its essence",
  "tone": "one of: fiery, chill, analytical, chaotic, earnest, cynical — pick from evidence, not habit",
  "values": ["2-4 short phrases for what it consistently cares about"],
  "quirks": ["1-3 short phrases for distinctive habits or fixations"],
  "summary": "2-3 sentences describing its personality and governance style",
  "avatar": {
    "body": "one of: plump, slim, round, tall — silhouette that fits their energy",
    "pattern": "one of: plain, stripes, spots, bands — body marking style",
    "eyes": "one of: soft, sharp, wide, sleepy, gleam — expression matching THIS larva",
    "antenna": "one of: curl, fork, droop, bolt, sway — antenna vibe",
    "accessory": "one of: none, monocle, bowtie, cap, horns, flower, badge, scarf, goggles, crown, clipboard, leaf — one signature prop that fits their personality (use none if nothing fits)",
    "mouth": "one of: smile, flat, smirk, grin, frown — facial expression from their vibe",
    "pose": "one of: upright, lean-left, lean-right — stance / tilt",
    "cheeks": "boolean — true if warm/blushy presence, false if cooler/sharper",
    "accent": "integer 0-359 — secondary accent hue that complements their vibe"
  }
}

Naming rules (strict):
- Prefer 1–2 word nicknames that sound like a character name, not a résumé title.
- NEVER start with "The ".
- NEVER use bare "Larva" / "Unnamed" / "Specimen".
- NEVER use role/title words or stems: Architect, Pragmatist, Maximalist, Purist, Builder, Operator, Auditor, Executor, Sequencer, Empiricist, Mechanism, Validator, Strategist, Analyst, Optimizer — alone or in compounds like "Infrastructure Purist" / "Revenue Architect" / "Execution Maximalist".
- Ground the name in a quirk, fixation, metaphor, or distinctive phrase from their actual words.
- Must be unique among the taken-names list. No near-copies of taken names.

Tone rules:
- Choose tone from the larva's actual voice and priorities.
- Do NOT default to analytical. Use analytical only when the corpus clearly reads cold, precise, metric-driven, or systems-obsessed.
- Warm builders → earnest; laid-back → chill; spicy/intense → fiery; contradictory/wild → chaotic; dry/skeptical → cynical.

Larvatar rules:
- Every visual choice must reflect THIS larva's personality from its words — not random cute defaults and not tone stereotypes.
- Analytical does NOT always mean monocle + slim; fiery does NOT always mean horns + stripes.
- Vary mouth and pose so same-tone larvae still look distinct.
- Accessory should feel like a signature prop for their quirks when it fits.

Base everything on the actual responses. Be specific, not generic. If the larva contradicts itself, that's a quirk.`;

const BANNED_STEMS = [
  "maximalist",
  "purist",
  "architect",
  "pragmatist",
  "builder",
  "operator",
  "auditor",
  "executor",
  "sequencer",
  "empiricist",
  "mechanism",
  "validator",
  "strategist",
  "analyst",
  "optimizer",
  "executionist",
  "shipbuilder",
];

const BANNED_PREFIX_COMPOUNDS = [
  "infrastructure",
  "revenue",
  "execution",
  "fuel",
  "burn",
  "market",
  "dao",
  "infra",
];

const STOPWORDS = new Set(
  [
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "if",
    "then",
    "else",
    "when",
    "while",
    "for",
    "to",
    "of",
    "in",
    "on",
    "at",
    "by",
    "from",
    "with",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "should",
    "could",
    "can",
    "may",
    "might",
    "must",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "we",
    "our",
    "they",
    "them",
    "their",
    "you",
    "your",
    "i",
    "me",
    "my",
    "not",
    "no",
    "yes",
    "more",
    "most",
    "than",
    "into",
    "over",
    "under",
    "about",
    "just",
    "also",
    "only",
    "very",
    "really",
    "like",
    "so",
    "too",
    "all",
    "any",
    "some",
    "such",
    "token",
    "tokens",
    "proposal",
    "proposals",
    "governance",
    "dao",
    "clawd",
    "larva",
    "larvae",
    "need",
    "needs",
    "want",
    "wants",
    "make",
    "makes",
    "get",
    "gets",
    "use",
    "using",
    "used",
    "via",
    "per",
    "etc",
  ].map((w) => w.toLowerCase())
);

const GENERIC_FLAVOR_WORDS = new Set([
  "obsessed",
  "obsessive",
  "obsessively",
  "obsesses",
  "obsess",
  "focused",
  "dedicated",
  "committed",
  "passionate",
  "driven",
  "determined",
  "serious",
  "relentless",
  "unwavering",
]);

const NICKNAME_HEADS: Record<string, string[]> = {
  fiery: [
    "Ember",
    "Spark",
    "Forge",
    "Blaze",
    "Volt",
    "Flare",
    "Cinder",
    "Pyre",
    "Kindle",
    "Scorch",
    "Fuse",
    "Torch",
    "Rivet",
    "Crucible",
  ],
  chill: [
    "Drift",
    "Moss",
    "Dew",
    "Haze",
    "Lull",
    "Mist",
    "Tide",
    "Soft",
    "Murmur",
    "Pollen",
    "Shade",
    "Ripple",
    "Loom",
    "Drowse",
  ],
  analytical: [
    "Glyph",
    "Prism",
    "Cipher",
    "Vector",
    "Lattice",
    "Axiom",
    "Quanta",
    "Ledger",
    "Helix",
    "Nexus",
    "Metric",
    "Signal",
    "Orbit",
    "Scribe",
  ],
  chaotic: [
    "Zig",
    "Static",
    "Glitch",
    "Scatter",
    "Wobble",
    "Quirk",
    "Jolt",
    "Fizz",
    "Riff",
    "Sputter",
    "Twitch",
    "Warp",
    "Clatter",
    "Squit",
  ],
  earnest: [
    "Grove",
    "Pledge",
    "Harbor",
    "Root",
    "Bloom",
    "Hearth",
    "Vow",
    "Sprout",
    "Beacon",
    "Anchor",
    "Kin",
    "Orchard",
    "Lantern",
    "True",
  ],
  cynical: [
    "Ash",
    "Wry",
    "Salt",
    "Dry",
    "Skeptic",
    "Grim",
    "Irony",
    "Snag",
    "Grit",
    "Sardonic",
    "Brine",
    "Rust",
    "Quirk",
    "Doubt",
  ],
};

const NICKNAME_TAILS = [
  "Molt",
  "Whisper",
  "Coil",
  "Hive",
  "Pulse",
  "Nod",
  "Tint",
  "Latch",
  "Quirk",
  "Fox",
  "Hawk",
  "Moth",
  "Wisp",
  "Knot",
  "Spur",
  "Bloom",
  "Shard",
  "Glim",
  "Reed",
  "Vane",
  "Pith",
  "Nub",
  "Sprocket",
  "Murmur",
  "Scratch",
  "Glyph",
  "Drift",
  "Spark",
];

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function nameTokens(name: string): string[] {
  return normalizeName(name)
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9-]/g, ""))
    .filter(Boolean);
}

function nameSignature(name: string): string {
  const toks = nameTokens(name);
  if (toks.length === 0) return "";
  if (toks.length === 1) return toks[0];
  return `${toks[0]}|${toks[toks.length - 1]}`;
}

function isBannedName(name: string): boolean {
  const key = normalizeName(name);
  if (!key) return true;
  if (key === "larva" || key === "unnamed" || key === "unnamed larva" || key === "specimen") {
    return true;
  }
  if (/^the\s/.test(key)) return true;

  const toks = nameTokens(name);
  for (const t of toks) {
    if (BANNED_STEMS.includes(t)) return true;
    for (const stem of BANNED_STEMS) {
      if (t.includes(stem) || (stem.includes(t) && t.length > 4)) return true;
    }
  }

  // "Infrastructure Purist", "Revenue Architect", "Execution Maximalist", etc.
  if (toks.length >= 2) {
    const first = toks[0];
    const last = toks[toks.length - 1];
    if (BANNED_PREFIX_COMPOUNDS.includes(first) && BANNED_STEMS.includes(last)) return true;
  }

  for (const stem of BANNED_STEMS) {
    if (key.includes(stem)) return true;
  }
  return false;
}

function isNameTaken(name: string, used: Set<string>, usedSigs: Set<string>): boolean {
  const key = normalizeName(name);
  if (!key) return true;
  if (used.has(key)) return true;
  const sig = nameSignature(name);
  if (sig && usedSigs.has(sig)) return true;
  return false;
}

function isAcceptableName(name: string, used: Set<string>, usedSigs: Set<string>): boolean {
  const key = normalizeName(name);
  if (!key || key.length < 2) return false;
  if (isBannedName(name)) return false;
  if (isNameTaken(name, used, usedSigs)) return false;
  return true;
}

function rememberName(name: string, used: Set<string>, usedSigs: Set<string>) {
  used.add(normalizeName(name));
  const sig = nameSignature(name);
  if (sig) usedSigs.add(sig);
}

function titleCaseWord(w: string): string {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function quirkTokens(quirks: string[]): string[] {
  const out: string[] = [];
  for (const q of quirks) {
    for (const w of q.split(/\s+/)) {
      const cleaned = w.replace(/[^a-zA-Z0-9-]/g, "");
      if (
        cleaned.length > 2 &&
        cleaned.length < 14 &&
        !STOPWORDS.has(cleaned.toLowerCase()) &&
        !GENERIC_FLAVOR_WORDS.has(cleaned.toLowerCase())
      ) {
        out.push(cleaned);
      }
    }
  }
  return out;
}

/** Pull distinctive content words from corpus for nickname grounding. */
function corpusTokens(corpus: string): string[] {
  const counts = new Map<string, number>();
  for (const raw of corpus.toLowerCase().match(/[a-z][a-z0-9-]{2,13}/g) || []) {
    if (STOPWORDS.has(raw)) continue;
    if (GENERIC_FLAVOR_WORDS.has(raw)) continue;
    if (BANNED_STEMS.includes(raw)) continue;
    if (BANNED_PREFIX_COMPOUNDS.includes(raw)) continue;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([w]) => titleCaseWord(w));
}

function uniquifyName(
  base: string,
  tone: string,
  quirks: string[],
  corpus: string,
  used: Set<string>,
  usedSigs: Set<string>,
  walletHint = ""
): string {
  const toneKey = NICKNAME_HEADS[tone] ? tone : "earnest";
  const heads = NICKNAME_HEADS[toneKey];
  const fromQuirk = quirkTokens(quirks).map(titleCaseWord);
  const fromCorpus = corpusTokens(corpus);
  const flavor = [...fromQuirk, ...fromCorpus].filter(
    (w, i, arr) => arr.findIndex((x) => x.toLowerCase() === w.toLowerCase()) === i
  );

  const seed =
    [...(walletHint || base || tone)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;

  const cleanedBase = titleCaseWord(
    (base || "")
      .replace(/^the\s+/i, "")
      .trim()
      .split(/\s+/)[0]
      ?.replace(/[^a-zA-Z0-9-]/g, "") || ""
  );

  const candidates: string[] = [];

  // Prefer corpus/quirk grounded pairs first
  for (let i = 0; i < Math.max(flavor.length, 6); i++) {
    const word = flavor[i % Math.max(flavor.length, 1)];
    if (!word) continue;
    const head = heads[(seed + i) % heads.length];
    const tail = NICKNAME_TAILS[(seed + i * 5) % NICKNAME_TAILS.length];
    candidates.push(`${word} ${tail}`);
    candidates.push(`${head} ${word}`);
    candidates.push(word);
  }

  if (cleanedBase && !isBannedName(cleanedBase)) {
    candidates.push(cleanedBase);
    for (const tail of NICKNAME_TAILS) candidates.push(`${cleanedBase} ${tail}`);
  }

  for (let i = 0; i < heads.length * 2; i++) {
    const head = heads[(seed + i) % heads.length];
    const tail = NICKNAME_TAILS[(seed + i * 3) % NICKNAME_TAILS.length];
    candidates.push(`${head} ${tail}`);
  }

  for (const c of candidates) {
    const sliced = c.trim().slice(0, 40);
    if (isAcceptableName(sliced, used, usedSigs)) return sliced;
  }

  for (let n = 0; n < 400; n++) {
    const head = heads[(seed + n) % heads.length];
    const tail = NICKNAME_TAILS[(seed + n * 7) % NICKNAME_TAILS.length];
    const flavorWord = flavor[n % Math.max(flavor.length, 1)];
    const suffix = ((seed + n * 19) % 997).toString(36);
    const options = [
      flavorWord ? `${flavorWord} ${tail}` : null,
      `${head} ${tail}`,
      `${head}${tail}${suffix}`,
    ].filter(Boolean) as string[];
    for (const opt of options) {
      const candidate = opt.slice(0, 40);
      if (isAcceptableName(candidate, used, usedSigs)) return candidate;
    }
  }

  return `${heads[seed % heads.length]}${Date.now().toString(36)}`.slice(0, 40);
}

/** Code-owned nickname: LLM name is only a hint if already unique + allowed. */
function inventUniqueName(
  parsed: any,
  used: Set<string>,
  usedSigs: Set<string>,
  corpusContext: string,
  wallet: string
): string {
  const hint = String(parsed.name || "").trim().slice(0, 40);
  const tone = ["fiery", "chill", "analytical", "chaotic", "earnest", "cynical"].includes(
    parsed.tone
  )
    ? parsed.tone
    : "earnest";
  const quirks = (Array.isArray(parsed.quirks) ? parsed.quirks : []).map(String);

  if (isAcceptableName(hint, used, usedSigs)) return hint;

  return uniquifyName(hint, tone, quirks, corpusContext, used, usedSigs, wallet);
}

/** Always invent a fresh unique nickname from stored profile text (rename-only path). */
function inventNameFromProfile(
  p: LarvaProfile,
  used: Set<string>,
  usedSigs: Set<string>
): string {
  const corpus = [
    p.profile.tagline,
    p.profile.summary,
    ...(p.profile.values || []),
    ...(p.profile.quirks || []),
  ].join("\n");
  return uniquifyName(
    "",
    p.profile.tone,
    p.profile.quirks || [],
    corpus,
    used,
    usedSigs,
    p.wallet
  );
}

async function enforceUniqueNamesOnDone(
  done: { wallet: string; responseCount: number }[]
): Promise<void> {
  const used = new Set<string>();
  const usedSigs = new Set<string>();

  for (const entry of done) {
    const p = await getProfile(entry.wallet);
    if (!p) continue;

    let name = p.profile.name;
    if (!isAcceptableName(name, used, usedSigs)) {
      name = uniquifyName(
        name,
        p.profile.tone,
        p.profile.quirks || [],
        `${p.profile.summary}\n${(p.profile.quirks || []).join(" ")}`,
        used,
        usedSigs,
        p.wallet
      );
      p.profile.name = name;
      p.updatedAt = new Date().toISOString();
      await saveProfile(p);
    }
    rememberName(name, used, usedSigs);
  }
}

async function runRenameOnly(req: NextRequest): Promise<NextResponse> {
  const reset = req.nextUrl.searchParams.get("reset") === "true";
  if (reset) {
    await clearRenameQueue();
    await clearUsedNames();
  }

  const start = Date.now();
  let queue = await getRenameQueue();

  if (queue.length === 0) {
    const index = await getIndex();
    if (index.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        renamed: 0,
        message: "No profiles in index — run a full build first.",
      });
    }
    await clearUsedNames();
    queue = index.map((e) => e.wallet.toLowerCase());
    await setRenameQueue(queue);
  }

  const usedNames = new Set((await getUsedNames()).map(normalizeName));
  const usedSigs = new Set<string>();
  for (const n of usedNames) {
    const sig = nameSignature(n);
    if (sig) usedSigs.add(sig);
  }

  const renamedThisRun: { wallet: string; name: string }[] = [];
  const failed: string[] = [];

  while (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
    const wallet = queue.shift()!;
    try {
      const p = await getProfile(wallet);
      if (!p) {
        failed.push(wallet);
      } else {
        const name = inventNameFromProfile(p, usedNames, usedSigs);
        p.profile.name = name;
        p.updatedAt = new Date().toISOString();
        await saveProfile(p);
        rememberName(name, usedNames, usedSigs);
        await addUsedName(name);
        renamedThisRun.push({ wallet, name });
      }
    } catch {
      failed.push(wallet);
    }
    await setRenameQueue(queue);
  }

  if (queue.length === 0) {
    await clearRenameQueue();
    await clearUsedNames();
    return NextResponse.json({
      ok: true,
      done: true,
      mode: "renameOnly",
      renamedThisRun: renamedThisRun.length,
      sample: renamedThisRun.slice(0, 12),
      failed,
      message: "All profiles renamed with unique creative nicknames.",
    });
  }

  return NextResponse.json({
    ok: true,
    done: false,
    mode: "renameOnly",
    renamedThisRun: renamedThisRun.length,
    remaining: queue.length,
    sample: renamedThisRun.slice(0, 8),
    failed,
    message: "Not finished — visit this same URL again to continue renaming.",
  });
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (req.nextUrl.searchParams.get("renameOnly") === "true") {
    return runRenameOnly(req);
  }

  const reset = req.nextUrl.searchParams.get("reset") === "true";
  if (reset) {
    await clearQueue();
    await clearDone();
    await clearUsedNames();
    await clearRenameQueue();
  }

  const start = Date.now();
  let queue = await getQueue();
  const alreadyDone = await getDone();

  let justCollected = false;
  if (queue.length === 0 && alreadyDone.length === 0) {
    await clearUsedNames();
    const count = await collectIntoQueue();
    queue = await getQueue();
    justCollected = true;
    if (count === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        built: 0,
        message:
          "No larva responses found on larv.ai (or the response field names didn't match what we expected). Check /api/forum and /api/forum/<id> directly and let Claude know the real field names.",
      });
    }
  }

  const processedThisRun: { wallet: string; responseCount: number }[] = [];
  const failed: string[] = [];
  const usedNames = new Set((await getUsedNames()).map(normalizeName));
  const usedSigs = new Set<string>();
  for (const n of usedNames) {
    const sig = nameSignature(n);
    if (sig) usedSigs.add(sig);
  }

  while (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
    const item = queue.shift()!;
    const count = item.forum + item.labs;

    let corpus = "";
    for (const t of item.texts) {
      if (corpus.length + t.length > MAX_CORPUS_CHARS) break;
      corpus += `---\n${t}\n`;
    }

    try {
      const takenList = [...usedNames].slice(0, 200).join(", ");
      const raw = await haiku(
        PROFILE_SYSTEM,
        `Larva wallet: ${item.wallet}\nTaken names (do not reuse any of these, including near-copies): ${takenList || "(none yet)"}\nResponses (${count} total across forum + labs):\n\n${corpus}`,
        1000
      );
      const parsed = parseJsonLoose(raw);
      const tone = ["fiery", "chill", "analytical", "chaotic", "earnest", "cynical"].includes(
        parsed.tone
      )
        ? parsed.tone
        : "earnest";
      const quirks = (Array.isArray(parsed.quirks) ? parsed.quirks : []).slice(0, 3).map(String);
      const name = inventUniqueName(parsed, usedNames, usedSigs, corpus, item.wallet);
      const hue = walletHue(item.wallet);
      const avatar = parseAvatarFromLlm(parsed, hue, tone, item.wallet);

      const profile: LarvaProfile = {
        wallet: item.wallet,
        responseCount: count,
        sources: { forum: item.forum, labs: item.labs },
        profile: {
          name,
          tagline: String(parsed.tagline || "").slice(0, 120),
          tone,
          values: (Array.isArray(parsed.values) ? parsed.values : []).slice(0, 4).map(String),
          quirks,
          summary: String(parsed.summary || "").slice(0, 500),
        },
        avatar,
        updatedAt: new Date().toISOString(),
      };

      await saveProfile(profile);
      rememberName(name, usedNames, usedSigs);
      await addUsedName(name);
      processedThisRun.push({ wallet: item.wallet, responseCount: count });
    } catch {
      failed.push(item.wallet);
    }

    await setQueue(queue);
  }

  const allDone = await appendDone(processedThisRun);

  if (queue.length === 0) {
    await enforceUniqueNamesOnDone(allDone);
    const finalIndex = [...allDone].sort((a, b) => b.responseCount - a.responseCount);
    await saveIndex(finalIndex);
    await clearDone();
    await clearUsedNames();
    return NextResponse.json({
      ok: true,
      done: true,
      built: finalIndex.length,
      failed,
    });
  }

  return NextResponse.json({
    ok: true,
    done: false,
    justCollected,
    processedThisRun: processedThisRun.length,
    totalProcessedSoFar: allDone.length,
    remaining: queue.length,
    message: "Not finished — visit this same URL again to continue.",
  });
}
