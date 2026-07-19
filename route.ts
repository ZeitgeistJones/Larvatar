// app/api/larvae/build/route.ts
// one-shot batch build. trigger from browser:
//   https://yourapp.vercel.app/api/larvae/build?secret=YOUR_SECRET
// pulls forum + labs larva responses, generates one profile per wallet, writes redis.
// safe to re-run — overwrites profiles, skips wallets with too few responses.

import { NextRequest, NextResponse } from "next/server";
import {
  pullAllResponses,
  haiku,
  parseJsonLoose,
  saveProfile,
  saveIndex,
  walletHue,
  type LarvaProfile,
} from "@/lib/larvae";

export const maxDuration = 300; // vercel pro; on hobby this caps at 60s — see note in response
export const dynamic = "force-dynamic";

const MIN_RESPONSES = 2; // skip one-off wallets
const MAX_CORPUS_CHARS = 6000; // per-wallet cap fed to haiku

const PROFILE_SYSTEM = `You write personality profiles for "larvae" — personal AI governance agents in the $CLAWD ecosystem on Base. Each larva was trained by a different token holder and has opinions.

You will receive everything one larva has said across forum posts and labs ideas. Synthesize a personality profile.

Respond with ONLY a JSON object, no markdown, no preamble:
{
  "name": "short invented specimen name, 1-3 words, evocative, like 'The Skeptic' or 'Burn Maximalist'",
  "tagline": "one punchy line capturing its essence",
  "tone": "one of: fiery, chill, analytical, chaotic, earnest, cynical",
  "values": ["2-4 short phrases for what it consistently cares about"],
  "quirks": ["1-3 short phrases for distinctive habits or fixations"],
  "summary": "2-3 sentences describing its personality and governance style"
}

Base everything on the actual responses. Be specific, not generic. If the larva contradicts itself, that's a quirk.`;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.LARVAE_BUILD_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const byWallet = await pullAllResponses();

  const built: { wallet: string; responseCount: number }[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const [wallet, data] of byWallet.entries()) {
    const count = data.forum + data.labs;
    if (count < MIN_RESPONSES) {
      skipped.push(wallet);
      continue;
    }

    // build corpus, newest-ish first, capped
    let corpus = "";
    for (const t of data.texts) {
      if (corpus.length + t.length > MAX_CORPUS_CHARS) break;
      corpus += `---\n${t}\n`;
    }

    try {
      const raw = await haiku(
        PROFILE_SYSTEM,
        `Larva wallet: ${wallet}\nResponses (${count} total across forum + labs):\n\n${corpus}`
      );
      const parsed = parseJsonLoose(raw);

      const profile: LarvaProfile = {
        wallet,
        responseCount: count,
        sources: { forum: data.forum, labs: data.labs },
        profile: {
          name: String(parsed.name || "Unnamed Larva").slice(0, 40),
          tagline: String(parsed.tagline || "").slice(0, 120),
          tone: ["fiery", "chill", "analytical", "chaotic", "earnest", "cynical"].includes(parsed.tone)
            ? parsed.tone
            : "earnest",
          values: (Array.isArray(parsed.values) ? parsed.values : []).slice(0, 4).map(String),
          quirks: (Array.isArray(parsed.quirks) ? parsed.quirks : []).slice(0, 3).map(String),
          summary: String(parsed.summary || "").slice(0, 500),
        },
        avatar: { hue: walletHue(wallet), tone: parsed.tone || "earnest" },
        updatedAt: new Date().toISOString(),
      };

      await saveProfile(profile);
      built.push({ wallet, responseCount: count });
    } catch (e) {
      failed.push(wallet);
    }
  }

  built.sort((a, b) => b.responseCount - a.responseCount);
  await saveIndex(built);

  return NextResponse.json({
    ok: true,
    built: built.length,
    skipped: skipped.length,
    failed,
    wallets: built,
  });
}
