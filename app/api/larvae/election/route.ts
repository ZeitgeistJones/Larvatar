// app/api/larvae/election/route.ts
// GET → candidates (with pitches), tally, and the full vote list (with reasoning)

import { NextResponse } from "next/server";
import { getCandidates, getTally, getVotes } from "@/lib/election";

export const dynamic = "force-dynamic";

export async function GET() {
  const [candidates, tally, votes] = await Promise.all([
    getCandidates(),
    getTally(),
    getVotes(),
  ]);
  return NextResponse.json({ candidates, tally, votes });
}
