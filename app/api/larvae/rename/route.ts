// app/api/larvae/rename/route.ts
//
// Re-name every existing larva using the evidence-based naming system, without
// rebuilding profiles. Profiles are expensive (full corpus synthesis + avatar);
// naming is one small call. This route only touches profile.name.
//
//   https://larvatar.vercel.app/api/larvae/rename?secret=YOUR_SECRET
//
// Same chunked-resumable pattern as the other builds — keep visiting until
// "done": true. Because naming needs the larva's corpus and profiles don't
// store it, the first pass re-fetches the corpus from larv.ai and caches it.
//
//   &reset=true    start over
//   &preview=true  name a handful and show the results WITHOUT saving
//   &wallet=0x...  re-name a single larva

import { NextRequest, NextResponse } from "next/server";
import {
  redis,
  getIndex,
  getProfile,
  saveProfile,
  collectIntoQueue,
  getQueue,
  setQueue,
  clearQueue,
} from "@/lib/larvae";
import { nameLarva, remember } from "@/lib/naming";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// A paced naming call is ~7s and a 429 backoff can add ~20s, so stop
// early enough that an in-flight call still finishes inside Vercel's 60s.
const TIME_BUDGET_MS = 25_000;

const CORPUS_KEY = (w: string) => `lpp:rename:corpus:${w.toLowerCase()}`;
const RENAME_QUEUE_KEY = "lpp:rename:queue";
const RENAME_NAMES_KEY = "lpp:rename:names";

type RenameQueueItem = { wallet: string };

async function getRenameQueue(): Promise<RenameQueueItem[]> {
  const raw = await redis.get<string | RenameQueueItem[]>(RENAME_QUEUE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function setRenameQueue(items: RenameQueueItem[]) {
  await redis.set(RENAME_QUEUE_KEY, JSON.stringify(items));
}

async function getAssignedNames(): Promise<string[]> {
  const raw = await redis.get<string | string[]>(RENAME_NAMES_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function setAssignedNames(names: string[]) {
  await redis.set(RENAME_NAMES_KEY, JSON.stringify(names));
}

async function getCorpus(wallet: string): Promise<string | null> {
  const raw = await redis.get<string>(CORPUS_KEY(wallet));
  return raw || null;
}

async function setCorpus(wallet: string, corpus: string) {
  // Corpora are only needed for the duration of a rename run.
  await redis.set(CORPUS_KEY(wallet), corpus, { ex: 60 * 60 * 6 });
}

/**
 * Populate the corpus cache from larv.ai. collectIntoQueue already does the
 * fetching and per-wallet grouping for the profile build, so we reuse it and
 * then restore whatever was in the profile queue.
 */
async function primeCorpora(): Promise<number> {
  const existing = await getQueue();
  await collectIntoQueue();
  const fresh = await getQueue();

  let cached = 0;
  for (const item of fresh) {
    let corpus = "";
    for (const t of item.texts) {
      if (corpus.length + t.length > 6000) break;
      corpus += `---\n${t}\n`;
    }
    if (corpus) {
      await setCorpus(item.wallet, corpus);
      cached++;
    }
  }

  // Don't clobber an in-progress profile build.
  if (existing.length > 0) {
    await setQueue(existing);
  } else {
    await clearQueue();
  }
  return cached;
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const preview = req.nextUrl.searchParams.get("preview") === "true";
  const singleWallet = req.nextUrl.searchParams.get("wallet")?.toLowerCase();
  const reset = req.nextUrl.searchParams.get("reset") === "true";

  if (reset) {
    await redis.del(RENAME_QUEUE_KEY);
    await redis.del(RENAME_NAMES_KEY);
  }

  /* ── Single wallet ── */
  if (singleWallet) {
    const p = await getProfile(singleWallet);
    if (!p) return NextResponse.json({ error: "profile not found" }, { status: 404 });

    let corpus = await getCorpus(singleWallet);
    if (!corpus) {
      await primeCorpora();
      corpus = await getCorpus(singleWallet);
    }

    const index = await getIndex();
    const others = await Promise.all(
      index.filter((e) => e.wallet !== singleWallet).slice(0, 200).map((e) => getProfile(e.wallet))
    );
    const used = new Set<string>();
    const usedSigs = new Set<string>();
    for (const o of others) {
      if (o?.profile.name) remember(o.profile.name, used, usedSigs);
    }

    const result = await nameLarva(
      {
        wallet: singleWallet,
        corpus: corpus || "",
        tone: p.profile.tone,
        tagline: p.profile.tagline,
        quirks: p.profile.quirks,
        values: p.profile.values,
      },
      used,
      usedSigs
    );

    if (!preview) {
      p.profile.name = result.name;
      await saveProfile(p);
    }

    return NextResponse.json({
      ok: true,
      done: true,
      preview,
      wallet: singleWallet,
      oldName: p.profile.name,
      newName: result.name,
      source: result.source,
      attempts: result.attempts,
    });
  }

  const start = Date.now();
  let queue = await getRenameQueue();

  /* ── Collection ── */
  if (queue.length === 0) {
    const index = await getIndex();
    if (index.length === 0) {
      return NextResponse.json({ error: "no larvae in index — run the profile build first" }, { status: 400 });
    }

    const cached = await primeCorpora();

    // Most-active larvae first: they have the richest corpora, so the earliest
    // (and best) names go to the specimens people are most likely to look at.
    queue = [...index]
      .sort((a, b) => b.responseCount - a.responseCount)
      .map((e) => ({ wallet: e.wallet }));

    await setRenameQueue(queue);
    await setAssignedNames([]);

    return NextResponse.json({
      ok: true,
      done: false,
      justCollected: true,
      queued: queue.length,
      corporaCached: cached,
      message: "Corpora cached. Visit this same URL again to start naming.",
    });
  }

  /* ── Naming ── */
  const assigned = await getAssignedNames();
  const used = new Set<string>();
  const usedSigs = new Set<string>();
  for (const n of assigned) remember(n, used, usedSigs);

  const renamed: {
    wallet: string;
    from: string;
    to: string;
    source: string;
    error?: string;
  }[] = [];
  const failed: string[] = [];
  // Paced calls mean ~5 larvae per request; preview stops early on purpose.
  const previewLimit = preview ? 5 : Infinity;

  while (
    queue.length > 0 &&
    Date.now() - start < TIME_BUDGET_MS &&
    renamed.length < previewLimit
  ) {
    const item = queue[0];

    try {
      const p = await getProfile(item.wallet);
      if (!p) {
        queue.shift();
        continue;
      }

      const corpus = (await getCorpus(item.wallet)) || "";
      const result = await nameLarva(
        {
          wallet: item.wallet,
          corpus,
          tone: p.profile.tone,
          tagline: p.profile.tagline,
          quirks: p.profile.quirks,
          values: p.profile.values,
        },
        used,
        usedSigs
      );

      renamed.push({
        wallet: item.wallet,
        from: p.profile.name,
        to: result.name,
        source: result.source,
        ...(result.error ? { error: result.error } : {}),
      });

      remember(result.name, used, usedSigs);
      assigned.push(result.name);

      if (!preview) {
        p.profile.name = result.name;
        await saveProfile(p);
        queue.shift();
        await setRenameQueue(queue);
        await setAssignedNames(assigned);
      } else {
        // Preview mustn't consume the queue.
        queue = queue.slice(1);
      }
    } catch (e) {
      failed.push(
        `${item.wallet.slice(0, 10)}: ${e instanceof Error ? e.message : String(e)}`
      );
      if (!preview) {
        queue.shift();
        await setRenameQueue(queue);
      } else {
        queue = queue.slice(1);
      }
    }
  }

  if (preview) {
    return NextResponse.json({
      ok: true,
      done: true,
      preview: true,
      note: "Nothing saved. Drop &preview=true to apply.",
      queueLength: queue.length,
      sample: renamed,
      failed,
    });
  }

  if (queue.length === 0) {
    const bySource = renamed.reduce(
      (acc, r) => {
        acc[r.source] = (acc[r.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    return NextResponse.json({
      ok: true,
      done: true,
      renamedThisRun: renamed.length,
      totalNames: assigned.length,
      bySource,
      sample: renamed.slice(0, 15),
      failed,
    });
  }

  return NextResponse.json({
    ok: true,
    done: false,
    renamedThisRun: renamed.length,
    remaining: queue.length,
    bySource: renamed.reduce(
      (acc, r) => {
        acc[r.source] = (acc[r.source] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ),
    sample: renamed.slice(0, 10),
    failed: failed.length ? failed.slice(0, 3) : undefined,
    message: "Not finished — visit this same URL again to continue.",
  });
}
