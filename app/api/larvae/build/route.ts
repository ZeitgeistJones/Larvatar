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

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_CORPUS_CHARS = 6000;
const TIME_BUDGET_MS = 45_000; // stop processing before hitting the 60s hard limit

const PROFILE_SYSTEM = `You write personality profiles for "larvae" — personal AI governance agents in the $CLAWD ecosystem on Base. Each larva was trained by a different token holder and has opinions.

You will receive everything one larva has said across forum posts and labs ideas. Synthesize a personality profile.

Respond with ONLY a JSON object, no markdown, no preamble:
{
  "name": "invented specimen nickname, 1-3 words, vivid personality, grounded in what this larva said — e.g. 'Ash Whisper', 'Quota Hawk', 'Soft-Fork Sage', 'Molt Prophet'. Never generic templates like 'The Skeptic', 'The Optimist', or bare 'Larva'. Never reuse a name from the taken list.",
  "tagline": "one punchy line capturing its essence",
  "tone": "one of: fiery, chill, analytical, chaotic, earnest, cynical",
  "values": ["2-4 short phrases for what it consistently cares about"],
  "quirks": ["1-3 short phrases for distinctive habits or fixations"],
  "summary": "2-3 sentences describing its personality and governance style"
}

Naming rules: creative and characterful; fit the larva's actual opinions and vibe; larva/governance-flavored when it fits; unique among the hive.

Base everything on the actual responses. Be specific, not generic. If the larva contradicts itself, that's a quirk.`;

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function isNameTaken(name: string, used: Set<string>): boolean {
  const key = normalizeName(name);
  return !key || used.has(key);
}

function uniquifyName(
  base: string,
  tone: string,
  quirks: string[],
  used: Set<string>
): string {
  const cleaned = (base || "Unnamed Larva").trim().slice(0, 28) || "Unnamed Larva";
  const quirkWord = (quirks[0] || "")
    .split(/\s+/)
    .find((w) => w.length > 2)
    ?.replace(/[^a-zA-Z0-9-]/g, "");
  const candidates = [
    `${cleaned} ${tone}`.trim(),
    quirkWord ? `${cleaned} ${quirkWord}` : null,
    `${cleaned} Specimen`,
    `${cleaned} ${tone} Molt`,
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    const sliced = c.slice(0, 40);
    if (!isNameTaken(sliced, used)) return sliced;
  }

  let n = 2;
  while (n < 1000) {
    const candidate = `${cleaned} ${n}`.slice(0, 40);
    if (!isNameTaken(candidate, used)) return candidate;
    n += 1;
  }
  return `${cleaned} ${Date.now().toString(36)}`.slice(0, 40);
}

async function inventUniqueName(
  parsed: any,
  used: Set<string>,
  corpusContext: string
): Promise<string> {
  let name = String(parsed.name || "Unnamed Larva").trim().slice(0, 40);
  if (!isNameTaken(name, used)) return name;

  const takenList = [...used].slice(0, 80).join(", ");
  try {
    const raw = await haiku(
      `You rename a larva specimen. Reply with ONLY a JSON object: {"name":"..."}. The name must be 1-3 words, vivid, personality-forward, and unused. Never copy a taken name.`,
      `Previous name "${name}" is already taken.\nTaken names: ${takenList || "(none)"}\nTone: ${parsed.tone || "earnest"}\nQuirks: ${(Array.isArray(parsed.quirks) ? parsed.quirks : []).join("; ")}\nContext:\n${corpusContext.slice(0, 1500)}`
    );
    const retryParsed = parseJsonLoose(raw);
    name = String(retryParsed.name || name).trim().slice(0, 40);
  } catch {
    // fall through to deterministic uniquify
  }

  if (!isNameTaken(name, used)) return name;

  const tone = ["fiery", "chill", "analytical", "chaotic", "earnest", "cynical"].includes(
    parsed.tone
  )
    ? parsed.tone
    : "earnest";
  const quirks = (Array.isArray(parsed.quirks) ? parsed.quirks : []).map(String);
  return uniquifyName(name, tone, quirks, used);
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
      const takenList = [...usedNames].slice(0, 120).join(", ");
      const raw = await haiku(
        PROFILE_SYSTEM,
        `Larva wallet: ${item.wallet}\nTaken names (do not reuse any of these): ${takenList || "(none yet)"}\nResponses (${count} total across forum + labs):\n\n${corpus}`
      );
      const parsed = parseJsonLoose(raw);
      const tone = ["fiery", "chill", "analytical", "chaotic", "earnest", "cynical"].includes(
        parsed.tone
      )
        ? parsed.tone
        : "earnest";
      const quirks = (Array.isArray(parsed.quirks) ? parsed.quirks : []).slice(0, 3).map(String);
      const name = await inventUniqueName(parsed, usedNames, corpus);

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
        avatar: { hue: walletHue(item.wallet), tone },
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
