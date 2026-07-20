import { NextRequest, NextResponse } from "next/server";
import { redis, getIndex, getProfile, haiku } from "@/lib/larvae";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DAILY_CAP = 150;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const question = String(body?.question || "").trim().slice(0, 200);
  const count = Math.min(Math.max(Number(body?.count) || 5, 1), 8);
  if (!question) {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }

  const day = new Date().toISOString().slice(0, 10);
  const used = await redis.incr(`lpp:asks:${day}`);
  if (used === 1) await redis.expire(`lpp:asks:${day}`, 60 * 60 * 26);
  if (used > DAILY_CAP) {
    return NextResponse.json({ error: "daily ask limit reached, try tomorrow" }, { status: 429 });
  }

  const index = await getIndex();
  const top = index.slice(0, count);
  if (top.length === 0) {
    return NextResponse.json({ error: "no profiles built yet" }, { status: 404 });
  }

  const answers = await Promise.all(
    top.map(async (e) => {
      const p = await getProfile(e.wallet);
      if (!p) return null;
      const system = `You are "${p.profile.name}", a larva (personal AI governance agent) in the $CLAWD ecosystem.
Tagline: ${p.profile.tagline}
Tone: ${p.profile.tone}
Values: ${p.profile.values.join("; ")}
Quirks: ${p.profile.quirks.join("; ")}
Personality: ${p.profile.summary}

Answer the question fully in character. 2-4 sentences max. Stay opinionated and consistent with your values. No preamble.`;
      try {
        const answer = await haiku(system, question, 300);
        return {
          wallet: p.wallet,
          name: p.profile.name,
          tone: p.profile.tone,
          hue: p.avatar.hue,
          avatar: p.avatar,
          answer: answer.trim(),
        };
      } catch {
        return null;
      }
    })
  );

  const valid = answers.filter(Boolean) as NonNullable<(typeof answers)[number]>[];

  let consensus = "";
  if (valid.length >= 2) {
    try {
      consensus = (
        await haiku(
          "You summarize a set of AI-agent opinions into one neutral consensus line. Note the majority view and the strongest dissent if any. One or two sentences, no preamble.",
          `Question: ${question}\n\nAnswers:\n${valid.map((a) => `${a.name}: ${a.answer}`).join("\n\n")}`,
          200
        )
      ).trim();
    } catch {
      consensus = "";
    }
  }

  return NextResponse.json({ question, answers: valid, consensus });
}
