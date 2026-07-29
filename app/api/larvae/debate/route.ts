// POST /api/larvae/debate
// Two larvae argue a prompt; optional 3-peer jury picks a winner.

import { NextRequest, NextResponse } from "next/server";
import { redis, getIndex, getProfile, haiku } from "@/lib/larvae";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DAILY_CAP = 40;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function speak(
  wallet: string,
  systemExtra: string,
  user: string
): Promise<{ wallet: string; name: string; tone: string; hue: number; text: string } | null> {
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
    };
  } catch {
    return null;
  }
}

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

  const opening = await speak(
    a,
    "You open a short debate. State your position clearly. You may needle the other side.",
    `Debate topic: ${question}\n\nGive your opening statement.`
  );
  if (!opening) {
    return NextResponse.json({ error: "first larva failed to speak" }, { status: 502 });
  }

  await sleep(400);

  const rebuttal = await speak(
    b,
    "You are debating an opponent. Rebut their opening. Push your own case. You may roast them lightly.",
    `Debate topic: ${question}\n\nOpponent (${opening.name}) opened with:\n"${opening.text}"\n\nGive your rebuttal.`
  );
  if (!rebuttal) {
    return NextResponse.json({ error: "second larva failed to speak" }, { status: 502 });
  }

  await sleep(400);

  const closing = await speak(
    a,
    "You close the debate. Answer their rebuttal and land a final punch. Do not concede unless it fits your character.",
    `Debate topic: ${question}\n\nYou opened with:\n"${opening.text}"\n\nOpponent (${rebuttal.name}) replied:\n"${rebuttal.text}"\n\nGive your closing.`
  );

  const turns = [opening, rebuttal, closing].filter(Boolean) as NonNullable<
    typeof opening
  >[];

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
      .map((t, i) => `${i + 1}. ${t.name}: ${t.text}`)
      .join("\n\n");

    for (const jw of jurors) {
      const p = await getProfile(jw);
      if (!p) continue;
      try {
        const raw = await haiku(
          `You are "${p.profile.name}", judging a short larva debate.
Tone: ${p.profile.tone}. Stay in character.
Reply with JSON only: {"pick":"a"|"b"|"tie","note":"one dry sentence"}
"a" = ${opening.name}, "b" = ${rebuttal.name}.`,
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
          ? `${opening.name} edges it`
          : winner === "b"
            ? `${rebuttal.name} edges it`
            : "Jury splits — no clear winner",
    };
  }

  return NextResponse.json({
    question,
    a: { wallet: a, name: opening.name },
    b: { wallet: b, name: rebuttal.name },
    turns,
    jury,
    verdict,
  });
}
