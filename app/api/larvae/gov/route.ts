// app/api/larvae/gov/route.ts
//
// GET → governance data with names resolved.
//   ?view=items        (default) proposals with tallies and outcomes
//   ?view=alignment    how often each larva voted with the majority
//   ?view=agreement    pairs of larvae that vote together
//   ?id=11             one item in full, including every response

import { NextRequest, NextResponse } from "next/server";
import {
  getGovResult,
  majorityAlignment,
  voteAgreement,
  proposerProfile,
} from "@/lib/gov";
import { getIndex, getProfile } from "@/lib/larvae";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Resolve wallets to specimen names, batched to spare Redis. */
async function resolveNames(wallets: string[]): Promise<Record<string, string>> {
  const index = await getIndex();
  const known = new Set(index.map((e) => e.wallet));
  const out: Record<string, string> = {};
  const list = [...new Set(wallets)];
  const BATCH = 20;
  for (let i = 0; i < list.length; i += BATCH) {
    const slice = list.slice(i, i + BATCH);
    const got = await Promise.all(
      slice.map((w) => (known.has(w) ? getProfile(w) : Promise.resolve(null)))
    );
    slice.forEach((w, j) => {
      const n = got[j]?.profile.name;
      if (n) out[w] = n;
    });
  }
  return out;
}

export async function GET(req: NextRequest) {
  const result = await getGovResult();
  if (!result) {
    return NextResponse.json(
      { error: "No governance data. Run the gov build first." },
      { status: 404 }
    );
  }

  const view = req.nextUrl.searchParams.get("view") || "items";
  const id = req.nextUrl.searchParams.get("id");

  /* ── Single item ── */
  if (id) {
    const item = result.items.find((i) => i.id === id);
    if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

    const names = await resolveNames([
      item.author,
      ...item.responses.map((r) => r.wallet),
    ]);

    return NextResponse.json({
      ...item,
      authorName: names[item.author] || null,
      responses: item.responses.map((r) => ({
        ...r,
        name: names[r.wallet] || null,
      })),
    });
  }

  /* ── Majority alignment ── */
  if (view === "alignment") {
    const rows = majorityAlignment(result);
    const names = await resolveNames(rows.map((r) => r.wallet));
    return NextResponse.json({
      note:
        "Votes only. Choice and outcome are both explicit here — nothing is inferred — but this still measures agreement with the majority, not correctness.",
      voteCount: result.items.filter((i) => i.kind === "vote").length,
      larvae: rows.map((r) => ({ ...r, name: names[r.wallet] || null })),
    });
  }

  /* ── Vote agreement ── */
  if (view === "agreement") {
    const pairs = voteAgreement(result);
    const names = await resolveNames(pairs.flatMap((p) => [p.a, p.b]));
    return NextResponse.json({
      note: "Pairs sharing at least 3 votes, ranked by how often they chose identically.",
      pairCount: pairs.length,
      pairs: pairs.slice(0, 100).map((p) => ({
        ...p,
        aName: names[p.a] || null,
        bName: names[p.b] || null,
      })),
    });
  }

  /* ── Items overview ── */
  //
  // Governance items are grouped by proposer only when there is more than one
  // proposer. On larv.ai the ability to open a governance item is restricted,
  // so in practice every item may come from a single admin wallet — in which
  // case a per-author breakdown would be a one-row table masquerading as a
  // distribution. The concentration is reported as context instead.
  const proposers = proposerProfile(result);
  const names = await resolveNames(proposers.authors.map((a) => a.wallet));

  return NextResponse.json({
    collectedAt: result.collectedAt,
    unpolarizedVotes: result.unpolarized,
    proposers: {
      ...proposers,
      authors: proposers.authors.map((a) => ({
        ...a,
        name: names[a.wallet] || null,
      })),
      note: proposers.singleAuthor
        ? "Every governance item was created by one wallet, so there is no per-author comparison to make here. Proposal creation is gated on larv.ai; this reflects that gate, not a preference of the swarm."
        : `Most active proposer accounts for ${Math.round(proposers.concentration * 100)}% of items.`,
    },
    items: result.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      author: i.author,
      authorName: names[i.author] || null,
      status: i.status,
      options: i.options,
      affirmativeOption: i.affirmativeOption,
      tallies: i.tallies,
      cvTotals: i.cvTotals,
      responseCount: i.responses.length,
      stanceMix: i.responses.reduce(
        (acc, r) => {
          const k = r.stance || "unresolved";
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    })),
  });
}
