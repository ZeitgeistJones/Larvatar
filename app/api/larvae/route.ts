import { NextResponse } from "next/server";
import { getIndex, getProfile } from "@/lib/larvae";
import { lookupEnsCachedOnly } from "@/lib/ens";
import { getMoralResult } from "@/lib/moral";
import { voiceForLarva } from "@/lib/larva-voice";
import { getAlignResult } from "@/lib/alignment";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function peerMaps(pairs: { a: string; b: string; rate: number; total: number }[]) {
  const bestAlly = new Map<string, { wallet: string; rate: number; shared: number }>();
  const bestRival = new Map<string, { wallet: string; rate: number; shared: number }>();
  for (const p of pairs) {
    if (p.total < 10) continue;
    const bump = (
      map: Map<string, { wallet: string; rate: number; shared: number }>,
      self: string,
      other: string,
      preferHigh: boolean
    ) => {
      const cur = map.get(self);
      if (
        !cur ||
        (preferHigh ? p.rate > cur.rate : p.rate < cur.rate) ||
        (p.rate === cur.rate && p.total > cur.shared)
      ) {
        map.set(self, { wallet: other, rate: p.rate, shared: p.total });
      }
    };
    bump(bestAlly, p.a, p.b, true);
    bump(bestAlly, p.b, p.a, true);
    bump(bestRival, p.a, p.b, false);
    bump(bestRival, p.b, p.a, false);
  }
  return { bestAlly, bestRival };
}

export async function GET() {
  const index = await getIndex();
  const profiles = (
    await Promise.all(index.map((e) => getProfile(e.wallet)))
  ).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getProfile>>>[];

  const ens = await lookupEnsCachedOnly(profiles.map((p) => p.wallet));

  // Batch moral reads — same cadence as profiles to avoid Upstash bursts.
  const morals: (Awaited<ReturnType<typeof getMoralResult>> | null)[] = [];
  const BATCH = 25;
  for (let i = 0; i < profiles.length; i += BATCH) {
    const slice = profiles.slice(i, i + BATCH);
    morals.push(
      ...(await Promise.all(slice.map((p) => getMoralResult(p.wallet))))
    );
  }

  const align = await getAlignResult().catch(() => null);
  const peers = align?.pairs ? peerMaps(align.pairs) : null;

  const larvae = profiles.map((p, i) => {
    const moral = morals[i];
    const voice = voiceForLarva({ wallet: p.wallet, tone: p.profile.tone });
    const w = p.wallet.toLowerCase();
    const ally = peers?.bestAlly.get(w) || null;
    const rival = peers?.bestRival.get(w) || null;
    const rivalClean =
      rival && ally && rival.wallet === ally.wallet ? null : rival;
    return {
      ...p,
      ens: ens[w] || null,
      moral: moral
        ? {
            label: moral.label,
            lawChaos: moral.lawChaos,
            goodEvil: moral.goodEvil,
          }
        : null,
      voiceId: voice.voiceId,
      voiceLabel: voice.voiceLabel,
      topAlly: ally,
      topRival: rivalClean,
    };
  });

  return NextResponse.json({ larvae });
}
