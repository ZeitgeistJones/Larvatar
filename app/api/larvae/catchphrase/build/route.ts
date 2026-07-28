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
  try {
    const secret = req.nextUrl.searchParams.get("secret");
    if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error: "GEMINI_API_KEY not configured",
          hint: "Add GEMINI_API_KEY in Vercel Production env, then Redeploy.",
        },
        { status: 503 }
      );
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
      return NextResponse.json({
        ok: true,
        done: false,
        justSeeded: true,
        queued: queue.length,
        message: "Queue seeded. Visit again to continue.",
      });
    }

    const start = Date.now();
    let ok = 0;
    let fail = 0;
    const errorSamples: string[] = [];

    while (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
      const wallet = queue.shift()!;
      const result = await generateCatchphrase(wallet);
      if (result.line) ok += 1;
      else {
        fail += 1;
        if (errorSamples.length < 5 && result.error) {
          errorSamples.push(`${wallet.slice(0, 10)}… ${result.error}`);
        }
      }
      await setCatchphraseQueue(queue);
    }

    if (queue.length === 0) {
      return NextResponse.json({
        ok: true,
        done: true,
        written: ok,
        failed: fail,
        errorSamples,
      });
    }
    return NextResponse.json({
      ok: true,
      done: false,
      written: ok,
      failed: fail,
      remaining: queue.length,
      errorSamples,
      message: "Visit again to continue.",
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "catchphrase build failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
