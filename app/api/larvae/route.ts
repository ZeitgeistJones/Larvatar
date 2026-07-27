import { NextResponse } from "next/server";
import { getIndex, getProfile } from "@/lib/larvae";
import { lookupEnsCachedOnly } from "@/lib/ens";
import { getMoralResult } from "@/lib/moral";
import { voiceForLarva } from "@/lib/larva-voice";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

  const larvae = profiles.map((p, i) => {
    const moral = morals[i];
    const voice = voiceForLarva({ wallet: p.wallet, tone: p.profile.tone });
    return {
      ...p,
      ens: ens[p.wallet.toLowerCase()] || null,
      moral: moral
        ? {
            label: moral.label,
            lawChaos: moral.lawChaos,
            goodEvil: moral.goodEvil,
          }
        : null,
      voiceId: voice.voiceId,
      voiceLabel: voice.voiceLabel,
    };
  });

  return NextResponse.json({ larvae });
}
