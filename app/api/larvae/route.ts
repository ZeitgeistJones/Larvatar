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

  // ENS is nice-to-have. A cold cache can take minutes across 100+ wallets and
  // leaves the Specimens page stuck on "loading…". Cap the wait hard.
  const ens = await Promise.race([
    lookupEnsMany(profiles.map((p) => p.wallet)),
    new Promise<Record<string, string>>((resolve) =>
      setTimeout(() => resolve({}), 2500)
    ),
  ]);
  const larvae = profiles.map((p) => ({
    ...p,
    ens: ens[p.wallet.toLowerCase()] || null,
  }));

  return NextResponse.json({ larvae });
}
