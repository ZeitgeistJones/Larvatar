import { NextResponse } from "next/server";
import { getIndex, getProfile } from "@/lib/larvae";
import { lookupEnsMany } from "@/lib/ens";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const index = await getIndex();
  const profiles = (
    await Promise.all(index.map((e) => getProfile(e.wallet)))
  ).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getProfile>>>[];

  const ens = await lookupEnsMany(profiles.map((p) => p.wallet));
  const larvae = profiles.map((p) => ({
    ...p,
    ens: ens[p.wallet.toLowerCase()] || null,
  }));

  return NextResponse.json({ larvae });
}
