//   /api/larvae/catchphrase/build?secret=YOUR_SECRET
//   &reset=true or &force=true to rewrite everyone's catchphrase
// Keep visiting until done: true.

import { NextRequest, NextResponse } from "next/server";
import {
  clearCatchphraseQueue,
  generateCatchphrase,
  getCatchphraseQueue,
  seedCatchphraseQueue,
  setCatchphraseQueue,
} from "@/lib/catchphrase";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 45_000;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const force =
    req.nextUrl.searchParams.get("force") === "true" ||
    req.nextUrl.searchParams.get("reset") === "true";
  if (req.nextUrl.searchParams.get("reset") === "true") {
    await clearCatchphraseQueue();
  }

  let queue = await getCatchphraseQueue();
  if (queue.length === 0) {
    const n = await seedCatchphraseQueue(force);
    queue = await getCatchphraseQueue();
    if (n === 0 || queue.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        message: "Every specimen already has a catchphrase.",
      });
    }
  }

  const start = Date.now();
  let ok = 0;
  let fail = 0;
  while (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
    const wallet = queue.shift()!;
    const line = await generateCatchphrase(wallet);
    if (line) ok += 1;
    else fail += 1;
    await setCatchphraseQueue(queue);
  }

  if (queue.length === 0) {
    return NextResponse.json({ ok: true, done: true, written: ok, failed: fail });
  }
  return NextResponse.json({
    ok: true,
    done: false,
    written: ok,
    failed: fail,
    remaining: queue.length,
    message: "Visit again to continue.",
  });
}
