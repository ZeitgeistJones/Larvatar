// app/api/larvae/pepe/route.ts
// Public read. Never calls a model — the page is free to load as often as it likes.

import { NextResponse } from "next/server";
import { getResults, getState } from "@/lib/pepe";

export const dynamic = "force-dynamic";

export async function GET() {
  const [results, state] = await Promise.all([getResults(), getState()]);

  if (!results) {
    return NextResponse.json({
      ready: false,
      phase: state?.phase ?? null,
      considered: state?.considered ?? 0,
      note: state?.note ?? null,
    });
  }

  return NextResponse.json({
    ready: true,
    phase: state?.phase ?? "done",
    note: state?.note ?? null,
    ...results,
  });
}
