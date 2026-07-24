import { NextResponse } from "next/server";
import { getIndex, getProfile } from "@/lib/larvae";
import { lookupEnsCachedOnly } from "@/lib/ens";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const index = await getIndex();
  const profiles = (
    await Promise.all(index.map((e) => getProfile(e.wallet)))
  ).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getProfile>>>[];

  // Cache-only ENS — never block the Specimens grid on external resolve.
  const ens = await lookupEnsCachedOnly(profiles.map((p) => p.wallet));
  const larvae = profiles.map((p) => ({
    ...p,
    ens: ens[p.wallet.toLowerCase()] || null,
  }));

  return NextResponse.json({ larvae });
}
