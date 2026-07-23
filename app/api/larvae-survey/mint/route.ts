// app/api/larvae-survey/mint/route.ts
// Invent creative survey questions into the Redis bank (does not build boards).
//
//   /api/larvae-survey/mint?secret=YOUR_SECRET&count=5

import { NextRequest, NextResponse } from "next/server";
import { ensureQuestionBank, mintQuestions } from "@/lib/larvae-survey";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureQuestionBank();
  const count = Math.min(12, Math.max(1, parseInt(req.nextUrl.searchParams.get("count") || "3", 10) || 3));
  const result = await mintQuestions(count);

  return NextResponse.json({
    ok: true,
    ...result,
    hint:
      result.minted.length > 0
        ? "Visit /api/larvae-survey/build?secret=… to build boards for the new questions."
        : undefined,
  });
}
