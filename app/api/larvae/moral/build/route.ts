// Chunked moral alignment build — run every specimen through the test.
//
//   /api/larvae/moral/build?secret=YOUR_SECRET
//   &reset=true — wipe index and retest everyone
//   &force=true — retest even if a result already exists
//
// Keep visiting until done: true.

import { NextRequest, NextResponse } from "next/server";
import { redis, getIndex } from "@/lib/larvae";
import { getMoralResult, runMoralTest } from "@/lib/moral";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const QUEUE_KEY = "lpp:moral:build:queue";
const TIME_BUDGET_MS = 45_000;

async function getQueue(): Promise<string[]> {
  const raw = await redis.get<string | string[]>(QUEUE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function setQueue(wallets: string[]) {
  await redis.set(QUEUE_KEY, JSON.stringify(wallets));
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const reset = req.nextUrl.searchParams.get("reset") === "true";
  const force = req.nextUrl.searchParams.get("force") === "true" || reset;

  if (reset) {
    await redis.del(QUEUE_KEY);
    await redis.del("lpp:moral:index");
  }

  let queue = await getQueue();
  if (queue.length === 0) {
    const index = await getIndex();
    const wallets: string[] = [];
    for (const e of index) {
      const w = e.wallet.toLowerCase();
      if (!force) {
        const existing = await getMoralResult(w);
        if (existing) continue;
      }
      wallets.push(w);
    }
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

  while (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
    const wallet = queue.shift()!;
    const result = await runMoralTest(wallet);
    if (result) ok += 1;
    else fail += 1;
    await setQueue(queue);
  }

  if (queue.length === 0) {
    return NextResponse.json({
      ok: true,
      done: true,
      tested: ok,
      failed: fail,
    });
  }

  return NextResponse.json({
    ok: true,
    done: false,
    tested: ok,
    failed: fail,
    remaining: queue.length,
    message: "Not finished — visit this same URL again.",
  });
}
