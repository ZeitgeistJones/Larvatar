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
import { lookupEnsMany } from "@/lib/ens";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Specimen nicknames only. ENS is resolved separately and never written into
 * the name field — nicknames and wallet labels are different things.
 */
async function resolveNames(wallets: string[]): Promise<Record<string, string>> {
  const index = await getIndex();
  const known = new Set(index.map((e) => e.wallet.toLowerCase()));
  const out: Record<string, string> = {};
  const list = [...new Set(wallets.map((w) => w.toLowerCase()))];
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

    const wallets = [item.author, ...item.responses.map((r) => r.wallet)];
    const names = await resolveNames(wallets);
    const ens = await lookupEnsMany(wallets);

    return NextResponse.json({
      ...item,
      authorName: names[item.author.toLowerCase()] || null,
      authorEns: ens[item.author.toLowerCase()] || null,
      responses: item.responses.map((r) => ({
        ...r,
        name: names[r.wallet.toLowerCase()] || null,
        ens: ens[r.wallet.toLowerCase()] || null,
      })),
    });
  }

  /* ── Majority alignment ── */
  if (view === "alignment") {
    const rows = majorityAlignment(result);
    const wallets = rows.map((r) => r.wallet);
    const names = await resolveNames(wallets);
    const ens = await lookupEnsMany(wallets);

    // Below this many votes, a high agreement rate is what a coin flip
    // produces on a few lopsided ballots, not a signal — so those larvae are
    // reported separately rather than ranked alongside larvae with enough
    // votes for the rate to mean something.
    const MIN_VOTES_FOR_RATE = 4;
    const larvae: (ReturnType<typeof majorityAlignment>[number] & {
      name: string | null;
      ens: string | null;
    })[] = [];
    const insufficientData: {
      wallet: string;
      name: string | null;
      ens: string | null;
      votes: number;
    }[] = [];

    for (const r of rows) {
      const w = r.wallet.toLowerCase();
      const row = {
        ...r,
        name: names[w] || null,
        ens: ens[w] || null,
      };
      if (r.votes >= MIN_VOTES_FOR_RATE) larvae.push(row);
      else insufficientData.push({ wallet: r.wallet, name: row.name, ens: row.ens, votes: r.votes });
    }

    return NextResponse.json({
      note:
        "Votes only. Choice and outcome are both explicit here — nothing is inferred — but this still measures agreement with the majority, not correctness.",
      caveat: `Larvae with fewer than ${MIN_VOTES_FOR_RATE} votes are excluded from the rate ranking and listed in insufficientData instead. With only a handful of lopsided votes, landing with the majority is the expected outcome, not a signal of alignment.`,
      voteCount: result.items.filter((i) => i.kind === "vote").length,
      larvae,
      insufficientData,
    });
  }

  /* ── Vote agreement ── */
  if (view === "agreement") {
    const pairs = voteAgreement(result);
    const wallets = pairs.flatMap((p) => [p.a, p.b]);
    const names = await resolveNames(wallets);
    const ens = await lookupEnsMany(wallets);
    const voteCount = result.items.filter((i) => i.kind === "vote").length;
    const perfectPairs = pairs.filter((p) => p.agreed === p.total).length;

    return NextResponse.json({
      note: "Pairs sharing at least 3 votes, ranked by how often they chose identically.",
      caveat: `${perfectPairs} pair(s) agree on every shared vote. Perfect agreement across just 3-4 lopsided votes — where most larvae land on the same side anyway — is what chance produces on its own, not evidence of a voting bloc.`,
      voteCount,
      perfectPairs,
      pairCount: pairs.length,
      pairs: pairs.slice(0, 100).map((p) => ({
        ...p,
        aName: names[p.a.toLowerCase()] || null,
        bName: names[p.b.toLowerCase()] || null,
        aEns: ens[p.a.toLowerCase()] || null,
        bEns: ens[p.b.toLowerCase()] || null,
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
  const itemAuthorWallets = result.items.map((i) => i.author);
  const wallets = [
    ...proposers.authors.map((a) => a.wallet),
    ...itemAuthorWallets,
  ];
  const names = await resolveNames(wallets);
  const ens = await lookupEnsMany(wallets);

  return NextResponse.json({
    collectedAt: result.collectedAt,
    unpolarizedVotes: result.unpolarized,
    proposers: {
      ...proposers,
      authors: proposers.authors.map((a) => ({
        ...a,
        name: names[a.wallet.toLowerCase()] || null,
        ens: ens[a.wallet.toLowerCase()] || null,
      })),
      note: proposers.singleAuthor
        ? "Every governance item was created by one wallet, so there is no per-author comparison to make here. Proposal creation is gated on larv.ai; this reflects that gate, not a preference of the swarm."
        : `Most active proposer accounts for ${Math.round(proposers.concentration * 100)}% of items.`,
    },
    items: result.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      question: i.question,
      author: i.author,
      authorName: names[i.author.toLowerCase()] || null,
      authorEns: ens[i.author.toLowerCase()] || null,
      status: i.status,
      createdAt: i.createdAt,
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
