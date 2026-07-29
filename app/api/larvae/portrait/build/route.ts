//   /api/larvae/portrait/build?secret=YOUR_SECRET
//   &reset=true or &force=true to regenerate everyone's portrait
// Keep visiting until done: true. Needs GEMINI_API_KEY + BLOB_READ_WRITE_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import {
  clearPortraitQueue,
  generatePortrait,
  getPortraitQueue,
  seedPortraitQueue,
  setPortraitQueue,
} from "@/lib/portrait";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Image gen is slower / quota-sensitive — one per visit with a gap.
const TIME_BUDGET_MS = 50_000;
const GAP_MS = 5_500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimit(err?: string) {
  return !!err && (err.includes("429") || /RESOURCE_EXHAUSTED|quota/i.test(err));
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
          hint: "Add GEMINI_API_KEY in Vercel Production env, then Redeploy.",
        },
        { status: 503 }
      );
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          error: "BLOB_READ_WRITE_TOKEN not configured",
          hint: "Create a Vercel Blob store on the project, then Redeploy so BLOB_READ_WRITE_TOKEN is available.",
        },
        { status: 503 }
      );
    }

    const force =
      req.nextUrl.searchParams.get("force") === "true" ||
      req.nextUrl.searchParams.get("reset") === "true";
    if (req.nextUrl.searchParams.get("reset") === "true") {
      await clearPortraitQueue();
    }

    let queue = await getPortraitQueue();
    if (queue.length === 0) {
      const n = await seedPortraitQueue(force);
      queue = await getPortraitQueue();
      if (n === 0 || queue.length === 0) {
        return NextResponse.json({
          ok: true,
          done: true,
          message: "Every specimen already has a portrait.",
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
    let rateLimited = false;
    const errorSamples: string[] = [];

    while (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
      const wallet = queue.shift()!;
      const result = await generatePortrait(wallet);
      if (result.url) ok += 1;
      else if (isRateLimit(result.error)) {
        queue.unshift(wallet);
        rateLimited = true;
        if (errorSamples.length < 3 && result.error) {
          errorSamples.push(`${wallet.slice(0, 10)}… rate limited — will retry`);
        }
        await setPortraitQueue(queue);
        break;
      } else {
        fail += 1;
        if (errorSamples.length < 5 && result.error) {
          errorSamples.push(`${wallet.slice(0, 10)}… ${result.error}`);
        }
      }
      await setPortraitQueue(queue);
      if (queue.length > 0 && Date.now() - start < TIME_BUDGET_MS) {
        await sleep(GAP_MS);
      }
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
      rateLimited,
      errorSamples,
      message: rateLimited
        ? "Rate limited — wait ~30s then hit again."
        : "Visit again to continue.",
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: "portrait build failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
