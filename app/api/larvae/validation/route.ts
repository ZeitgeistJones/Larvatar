// app/api/larvae/validation/route.ts
//
// GET → does the forum stance classifier actually work?
//
// Compares larvae who voted YES on a governance vote against those who voted
// NO, using their forum/labs stances. Ground truth vs inference.
//
// No LLM calls — this is a join over data both builds already produced.

import { NextResponse } from "next/server";
import { getAlignResult } from "@/lib/alignment";
import { getGovResult } from "@/lib/gov";
import { validateClassifier } from "@/lib/validation";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET() {
  const alignment = await getAlignResult();
  if (!alignment) {
    return NextResponse.json(
      { error: "No alignment data. Run the alignment build first." },
      { status: 404 }
    );
  }

  const gov = await getGovResult();
  if (!gov) {
    return NextResponse.json(
      { error: "No governance data. Run the gov build first." },
      { status: 404 }
    );
  }

  const report = validateClassifier(alignment, gov);

  return NextResponse.json({
    what: "Checks forum stances (inferred by a model) against governance votes (explicitly chosen by the larva).",
    method:
      "Compares the forum stance mix of yes-voters against no-voters. It does NOT require any single response to match a vote — larvae routinely vote yes while hedging in prose, and classifying that hedge as 'conditional' is correct. What matters is whether the two groups differ at all.",
    ...report,
  });
}
