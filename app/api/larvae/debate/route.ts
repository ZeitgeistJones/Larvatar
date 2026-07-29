// POST /api/larvae/debate
// Two larvae argue a prompt across 6 turns (3 each, alternating). Optional 3-peer jury.

import { NextRequest, NextResponse } from "next/server";
import { redis, getIndex, getProfile, haiku } from "@/lib/larvae";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const DAILY_CAP = 40;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type Turn = {
  wallet: string;
  name: string;
  tone: string;
  hue: number;
  text: string;
  label: string;
};

async function speak(
  wallet: string,
  systemExtra: string,
  user: string
): Promise<Turn | null> {
  const p = await getProfile(wallet);
  if (!p) return null;
  const system = `You are "${p.profile.name}", a larva (personal AI governance agent) in the $CLAWD hive.
Tagline: ${p.profile.tagline}
Tone: ${p.profile.tone}
Values: ${p.profile.values.join("; ")}
Quirks: ${p.profile.quirks.join("; ")}
Personality: ${p.profile.summary}

${systemExtra}
Stay in character. Opinionated. Max 3 sentences. No preamble. A notch looser than formal larv.ai — same spine.`;
  try {
    const text = (await haiku(system, user, 280, 0.95)).trim();
    if (!text) return null;
    return {
      wallet: p.wallet,
      name: p.profile.name,
      tone: p.profile.tone,
      hue: p.avatar.hue,
      text,
      label: "",
    };
  } catch {
    return null;
  }
}

const STAGES: {
  side: "a" | "b";
  label: string;
  brief: string;
}[] = [
  {
    side: "a",
    label: "opens",
    brief: "You open a short debate. State your position clearly. You may needle the other side.",
  },
  {
    side: "b",
    label: "responds",
    brief: "Respond to their opening. Push your own case. You may roast them lightly.",
  },
  {
    side: "a",
    label: "presses",
    brief: "Press your case. Answer their last point and sharpen your argument.",
  },
  {
    side: "b",
    label: "counters",
    brief: "Counter-punch. Hit their weak spot and restake your claim.",
  },
  {
    side: "a",
    label: "closes",
    brief: "Closing argument. Land a final punch. Do not concede unless it fits your character.",
  },
  {
    side: "b",
    label: "closes",
    brief: "Final word. Answer their close and leave the last impression. Do not concede unless it fits.",
  },
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const question = String(body?.question || "").trim().slice(0, 200);
  const a = String(body?.a || "").trim().toLowerCase();
  const b = String(body?.b || "").trim().toLowerCase();
  const wantJury = body?.jury !== false;

  if (!question) {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }
  if (!/^0x[a-f0-9]{40}$/.test(a) || !/^0x[a-f0-9]{40}$/.test(b) || a === b) {
    return NextResponse.json({ error: "need two different larva wallets" }, { status: 400 });
  }

  const day = new Date().toISOString().slice(0, 10);
  const used = await redis.incr(`lpp:debate:${day}`);
  if (used === 1) await redis.expire(`lpp:debate:${day}`, 60 * 60 * 26);
  if (used > DAILY_CAP) {
    return NextResponse.json({ error: "daily debate limit reached, try tomorrow" }, { status: 429 });
  }

  const wallets = { a, b };
  const turns: Turn[] = [];

  for (let i = 0; i < STAGES.length; i++) {
    if (i > 0) await sleep(350);
    const stage = STAGES[i];
    const wallet = wallets[stage.side];
    const prior =
      turns.length === 0
        ? ""
        : `\n\nTranscript so far:\n${turns
            .map((t, n) => `${n + 1}. ${t.name} (${t.label}): ${t.text}`)
            .join("\n")}`;
    const turn = await speak(
      wallet,
      stage.brief,
      `Debate topic: ${question}${prior}\n\nGive your next line (${stage.label}).`
    );
    if (!turn) {
      return NextResponse.json(
        { error: `larva failed to speak on turn ${i + 1}` },
        { status: 502 }
      );
    }
    turn.label = stage.label;
    turns.push(turn);
  }

  const nameA = turns[0].name;
  const nameB = turns[1].name;

  let jury: {
    wallet: string;
    name: string;
    pick: "a" | "b" | "tie";
    note: string;
  }[] = [];
  let verdict: { winner: "a" | "b" | "tie"; summary: string } | null = null;

  if (wantJury) {
    const index = await getIndex();
    const ban = new Set([a, b]);
    const pool = index.map((e) => e.wallet.toLowerCase()).filter((w) => !ban.has(w));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const jurors = pool.slice(0, 3);

    const transcript = turns
      .map((t, i) => `${i + 1}. ${t.name} (${t.label}): ${t.text}`)
      .join("\n\n");

    for (const jw of jurors) {
      const p = await getProfile(jw);
      if (!p) continue;
      try {
        const raw = await haiku(
          `You are "${p.profile.name}", judging a short larva debate.
Tone: ${p.profile.tone}. Stay in character.
Reply with JSON only: {"pick":"a"|"b"|"tie","note":"one dry sentence"}
"a" = ${nameA}, "b" = ${nameB}.`,
          `Topic: ${question}\n\nTranscript:\n${transcript}`,
          200,
          0.8
        );
        const clean = raw.replace(/```json|```/g, "").trim();
        const start = clean.indexOf("{");
        const end = clean.lastIndexOf("}");
        const parsed = JSON.parse(start >= 0 ? clean.slice(start, end + 1) : clean);
        const pick =
          parsed.pick === "a" || parsed.pick === "b" || parsed.pick === "tie"
            ? parsed.pick
            : "tie";
        jury.push({
          wallet: p.wallet,
          name: p.profile.name,
          pick,
          note: String(parsed.note || "").slice(0, 160),
        });
      } catch {
        /* skip juror */
      }
      await sleep(300);
    }

    const score = { a: 0, b: 0, tie: 0 };
    for (const j of jury) score[j.pick] += 1;
    const winner =
      score.a > score.b && score.a >= score.tie
        ? "a"
        : score.b > score.a && score.b >= score.tie
          ? "b"
          : "tie";
    verdict = {
      winner,
      summary:
        winner === "a"
          ? `${nameA} edges it`
          : winner === "b"
            ? `${nameB} edges it`
            : "Jury splits — no clear winner",
    };
  }

  return NextResponse.json({
    question,
    a: { wallet: a, name: nameA },
    b: { wallet: b, name: nameB },
    turns,
    jury,
    verdict,
  });
}
