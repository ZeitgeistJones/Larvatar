// Chunked moral alignment build — run every specimen through the D&D test.
//
//   /api/larvae/moral/build?secret=YOUR_SECRET
//   &reset=true — clear queue (+ wipe moral index) and retest everyone
//   &force=true — retest even if a result already exists
//
// Keep visiting until done: true.

import { NextRequest, NextResponse } from "next/server";
import { redis, getIndex } from "@/lib/larvae";
import { getMoralResult, runMoralTest } from "@/lib/moral";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const QUEUE_KEY = "lpp:moral:build:queue";
const TIME_BUDGET_MS = 50_000;
const GAP_MS = 4_200; // free-tier Gemini ~15 RPM
const BATCH = 20;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimit(err: unknown) {
  const s = err instanceof Error ? err.message : String(err || "");
  return s.includes("429") || /RESOURCE_EXHAUSTED|quota/i.test(s);
}

async function getQueue(): Promise<string[]> {
  try {
    const raw = await redis.get<string | string[]>(QUEUE_KEY);
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    }
    return [];
  } catch (e) {
    console.error("moral build getQueue", e);
    return [];
  }
}

async function setQueue(wallets: string[]) {
  await redis.set(QUEUE_KEY, JSON.stringify(wallets));
}

async function walletsNeedingTest(force: boolean): Promise<string[]> {
  const index = await getIndex();
  if (!Array.isArray(index) || index.length === 0) return [];

  if (force) {
    return index.map((e) => String(e.wallet).toLowerCase()).filter(Boolean);
  }

  const need: string[] = [];
  for (let i = 0; i < index.length; i += BATCH) {
    const slice = index.slice(i, i + BATCH);
    const existing = await Promise.all(
      slice.map((e) => getMoralResult(String(e.wallet).toLowerCase()))
    );
    for (let j = 0; j < slice.length; j++) {
      if (!existing[j]) need.push(String(slice[j].wallet).toLowerCase());
    }
  }
  return need;
}

export async function GET(req: NextRequest) {
  try {
    const secret = req.nextUrl.searchParams.get("secret");
    if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error: "GEMINI_API_KEY not configured",
          hint: "Add GEMINI_API_KEY in Vercel → Project → Settings → Environment Variables for Production, then Redeploy. LARVAE_BUILD_SECRET alone is not enough.",
        },
        { status: 503 }
      );
    }

    const reset = req.nextUrl.searchParams.get("reset") === "true";
    const force = req.nextUrl.searchParams.get("force") === "true" || reset;

    if (reset) {
      await redis.del(QUEUE_KEY);
      await redis.del("lpp:moral:index");
    }

    let queue = await getQueue();
    if (queue.length === 0) {
      const wallets = await walletsNeedingTest(force);
      queue = wallets;
      await setQueue(queue);
      if (queue.length === 0) {
        return NextResponse.json({
          ok: true,
          done: true,
          message: "Every specimen already has a moral alignment.",
        });
      }
      return NextResponse.json({
        ok: true,
        done: false,
        justSeeded: true,
        queued: queue.length,
        message: "Queue seeded. Visit again to run tests.",
      });
    }

    const start = Date.now();
    let ok = 0;
    let fail = 0;
    let rateLimited = false;
    const failSamples: string[] = [];

    while (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
      const wallet = queue.shift()!;
      try {
        const result = await runMoralTest(wallet);
        if (result) ok += 1;
        else {
          fail += 1;
          if (failSamples.length < 5) failSamples.push(wallet);
        }
      } catch (e) {
        if (isRateLimit(e)) {
          queue.unshift(wallet);
          rateLimited = true;
          if (failSamples.length < 3) {
            failSamples.push(`${wallet.slice(0, 10)}… rate limited`);
          }
          try {
            await setQueue(queue);
          } catch (qe) {
            console.error("moral build setQueue", qe);
          }
          break;
        }
        fail += 1;
        console.error("moral build wallet", wallet, e);
        if (failSamples.length < 5) failSamples.push(wallet);
      }
      try {
        await setQueue(queue);
      } catch (e) {
        console.error("moral build setQueue", e);
      }
      if (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
        await sleep(GAP_MS);
      }
    }

    if (queue.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        tested: ok,
        failed: fail,
        failSamples,
      });
    }

    return NextResponse.json({
      ok: true,
      done: false,
      tested: ok,
      failed: fail,
      remaining: queue.length,
      rateLimited,
      failSamples,
      message: rateLimited
        ? "Rate limited — wait ~25s then hit again."
        : "Not finished — visit this same URL again.",
    });
  } catch (e) {
    console.error("moral build fatal", e);
    return NextResponse.json(
      {
        error: "moral build failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
