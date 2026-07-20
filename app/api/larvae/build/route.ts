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
// Add &reset=true to wipe progress and start over from scratch (e.g. after new posts appear).

import { NextRequest, NextResponse } from "next/server";
import {
  haiku,
  parseJsonLoose,
  saveProfile,
  saveIndex,
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
  type LarvaProfile,
} from "@/lib/larvae";
import { parseAvatarFromLlm } from "@/lib/avatar";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_CORPUS_CHARS = 6000;
const TIME_BUDGET_MS = 45_000; // stop processing before hitting the 60s hard limit

const PROFILE_SYSTEM = `You write personality profiles for "larvae" — personal AI governance agents in the $CLAWD ecosystem on Base. Each larva was trained by a different token holder and has opinions.

You will receive everything one larva has said across forum posts and labs ideas. Synthesize a personality profile AND invent a matching "larvatar" — the little mascot creature that visually expresses this larva's personality.

Respond with ONLY a JSON object, no markdown, no preamble:
{
  "name": "invented specimen nickname, preferably 1-2 words (max 3), vivid and characterful, grounded in what THIS larva said — e.g. 'Ash Whisper', 'Quota Hawk', 'Molt Prophet', 'Squit'. Never role titles. Never reuse a name from the taken list.",
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
- Prefer 1–2 word nicknames with personality (specimen vibe), not job titles.
- NEVER use names starting with "The ".
- NEVER use bare "Larva" / "Unnamed" / "Specimen".
- NEVER use generic role templates ending in Maximalist, Purist, Architect, Pragmatist, Builder, Operator, Auditor, Executor, Sequencer, Empiricist, Mechanism — or near-clones of those.
- Ground the name in quirks, fixations, or distinctive phrasing from their actual words.
- Must be unique among the taken-names list.

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

const BANNED_NAME_SUFFIXES = [
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
];

const NICKNAME_PARTS: Record<string, string[]> = {
  fiery: ["Ember", "Spark", "Forge", "Blaze", "Volt", "Flare"],
  chill: ["Drift", "Moss", "Dew", "Haze", "Soft", "Lull"],
  analytical: ["Glyph", "Prism", "Cipher", "Vector", "Lattice", "Axiom"],
  chaotic: ["Zig", "Static", "Glitch", "Scatter", "Wobble", "Spark"],
  earnest: ["Grove", "Pledge", "Kindle", "Harbor", "Root", "Bloom"],
  cynical: ["Ash", "Wry", "Salt", "Shade", "Dry", "Skeptic"],
};

const NICKNAME_TAILS = ["Molt", "Whisper", "Coil", "Hive", "Quirk", "Pulse", "Nod", "Tint"];

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function isBannedName(name: string): boolean {
  const key = normalizeName(name);
  if (!key) return true;
  if (key === "larva" || key === "unnamed" || key === "unnamed larva" || key === "specimen") {
    return true;
  }
  if (/^the\s/.test(key)) return true;
  const last = key.split(/\s+/).pop() || "";
  if (BANNED_NAME_SUFFIXES.includes(last)) return true;
  // "Infrastructure Purist", "Revenue Architect", etc.
  for (const suffix of BANNED_NAME_SUFFIXES) {
    if (key.endsWith(` ${suffix}`) || key === suffix) return true;
  }
  return false;
}

function isNameTaken(name: string, used: Set<string>): boolean {
  const key = normalizeName(name);
  return !key || used.has(key);
}

function isAcceptableName(name: string, used: Set<string>): boolean {
  return !isBannedName(name) && !isNameTaken(name, used);
}

function quirkTokens(quirks: string[]): string[] {
  const out: string[] = [];
  for (const q of quirks) {
    for (const w of q.split(/\s+/)) {
      const cleaned = w.replace(/[^a-zA-Z0-9-]/g, "");
      if (cleaned.length > 2 && cleaned.length < 12) out.push(cleaned);
    }
  }
  return out;
}

function titleCaseWord(w: string): string {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

function uniquifyName(
  base: string,
  tone: string,
  quirks: string[],
  used: Set<string>,
  walletHint = ""
): string {
  const toneKey = NICKNAME_PARTS[tone] ? tone : "earnest";
  const heads = NICKNAME_PARTS[toneKey];
  const tokens = quirkTokens(quirks).map(titleCaseWord);
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
  if (cleanedBase && !isBannedName(cleanedBase)) candidates.push(cleanedBase);

  for (let i = 0; i < heads.length; i++) {
    const head = heads[(seed + i) % heads.length];
    const tail = NICKNAME_TAILS[(seed + i * 3) % NICKNAME_TAILS.length];
    candidates.push(`${head} ${tail}`);
    if (tokens[i % Math.max(tokens.length, 1)]) {
      candidates.push(`${head} ${tokens[i % tokens.length]}`);
      candidates.push(`${tokens[i % tokens.length]} ${tail}`);
    }
  }

  if (cleanedBase) {
    for (const tail of NICKNAME_TAILS) {
      candidates.push(`${cleanedBase} ${tail}`);
    }
  }

  for (const c of candidates) {
    const sliced = c.trim().slice(0, 40);
    if (isAcceptableName(sliced, used)) return sliced;
  }

  // last resort: tone head + short wallet-derived suffix (still nickname-like)
  for (let n = 0; n < 200; n++) {
    const head = heads[(seed + n) % heads.length];
    const tail = NICKNAME_TAILS[(seed + n * 5) % NICKNAME_TAILS.length];
    const suffix = ((seed + n * 17) % 97).toString(36);
    const candidate = `${head}${tail}${suffix}`.slice(0, 40);
    if (isAcceptableName(candidate, used)) return candidate;
  }

  return `${heads[seed % heads.length]}${Date.now().toString(36)}`.slice(0, 40);
}

async function inventUniqueName(
  parsed: any,
  used: Set<string>,
  corpusContext: string,
  wallet: string
): Promise<string> {
  let name = String(parsed.name || "").trim().slice(0, 40);
  if (isAcceptableName(name, used)) return name;

  const takenList = [...used].slice(0, 200).join(", ");
  const tone = ["fiery", "chill", "analytical", "chaotic", "earnest", "cynical"].includes(
    parsed.tone
  )
    ? parsed.tone
    : "earnest";
  const quirks = (Array.isArray(parsed.quirks) ? parsed.quirks : []).map(String);

  try {
    const raw = await haiku(
      `You rename a larva specimen. Reply with ONLY a JSON object: {"name":"..."}. Rules: 1-2 words preferred (max 3), vivid nickname, personality-forward, unused. NEVER start with "The". NEVER use role titles like Architect/Pragmatist/Maximalist/Purist/Builder. Never copy a taken name.`,
      `Previous name "${name || "(empty)"}" is invalid or taken.\nTaken names: ${takenList || "(none)"}\nTone: ${tone}\nQuirks: ${quirks.join("; ")}\nContext:\n${corpusContext.slice(0, 1500)}`
    );
    const retryParsed = parseJsonLoose(raw);
    name = String(retryParsed.name || name).trim().slice(0, 40);
  } catch {
    // fall through to deterministic uniquify
  }

  if (isAcceptableName(name, used)) return name;
  return uniquifyName(name, tone, quirks, used, wallet);
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const reset = req.nextUrl.searchParams.get("reset") === "true";
  if (reset) {
    await clearQueue();
    await clearDone();
    await clearUsedNames();
  }

  const start = Date.now();
  let queue = await getQueue();
  const alreadyDone = await getDone();

  // first visit (or after reset): no queue yet — collect from larv.ai first.
  // this is fetch-only, no LLM calls, so it's the fast phase.
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
        `Larva wallet: ${item.wallet}\nTaken names (do not reuse any of these): ${takenList || "(none yet)"}\nResponses (${count} total across forum + labs):\n\n${corpus}`,
        1000
      );
      const parsed = parseJsonLoose(raw);
      const tone = ["fiery", "chill", "analytical", "chaotic", "earnest", "cynical"].includes(
        parsed.tone
      )
        ? parsed.tone
        : "earnest";
      const quirks = (Array.isArray(parsed.quirks) ? parsed.quirks : []).slice(0, 3).map(String);
      const name = await inventUniqueName(parsed, usedNames, corpus, item.wallet);
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
      usedNames.add(normalizeName(name));
      await addUsedName(name);
      processedThisRun.push({ wallet: item.wallet, responseCount: count });
    } catch {
      failed.push(item.wallet);
    }

    // persist queue progress after every single larva, so a mid-batch crash
    // or a future timeout never loses more than the one in-flight item
    await setQueue(queue);
  }

  const allDone = await appendDone(processedThisRun);

  if (queue.length === 0) {
    // fully finished — build final sorted index and clean up
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
