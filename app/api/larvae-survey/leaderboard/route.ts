// app/api/larvae-survey/leaderboard/route.ts
// GET → top 20 scores
// POST → { name, score, rounds, fmScore } → saves if top 20 worthy

import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/larvae";

export const dynamic = "force-dynamic";

const LB_KEY = "lpp:survey:leaderboard";
const MAX_ENTRIES = 20;

type LeaderboardEntry = {
  name: string;
  score: number;
  rounds: number;
  fmScore: number;
  date: string;
};

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const raw = await redis.get<string | LeaderboardEntry[]>(LB_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function saveLeaderboard(entries: LeaderboardEntry[]) {
  await redis.set(LB_KEY, JSON.stringify(entries));
}

export async function GET() {
  const lb = await getLeaderboard();
  return NextResponse.json({ leaderboard: lb });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = String(body?.name || "Anonymous").trim().slice(0, 24);
  const score = Number(body?.score || 0);
  const rounds = Number(body?.rounds || 0);
  const fmScore = Number(body?.fmScore || 0);

  if (!Number.isFinite(score) || score <= 0) {
    return NextResponse.json({ error: "invalid score" }, { status: 400 });
  }

  const entry: LeaderboardEntry = {
    name,
    score,
    rounds,
    fmScore,
    date: new Date().toISOString().slice(0, 10),
  };

  const lb = await getLeaderboard();
  lb.push(entry);
  lb.sort((a, b) => b.score - a.score);
  const trimmed = lb.slice(0, MAX_ENTRIES);
  await saveLeaderboard(trimmed);

  const rank = trimmed.findIndex(
    (e) => e.name === name && e.score === score && e.date === entry.date
  );

  return NextResponse.json({
    rank: rank >= 0 ? rank + 1 : null,
    entry,
    leaderboard: trimmed,
  });
}
