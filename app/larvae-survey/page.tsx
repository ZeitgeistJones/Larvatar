// app/larvae-survey/page.tsx
// Larvae Survey Game — guess what the hive said.
// Board slots flip open as answers are matched. Three strikes ends the round
// and reveals the rest, with the larvae who gave each answer.

"use client";

import { useEffect, useState } from "react";

type BoardStub = {
  id: string;
  question: string;
  answerCount: number;
  respondents: number;
  totalPoints: number;
};

type Slot = { rank: number; points: number };

type Answer = {
  rank: number;
  label: string;
  count: number;
  points: number;
  voices: string[];
  sample: string;
};

const INK = "#1e2a3a";
const CORAL = "#e8604c";
const SHEET = "#eef4f1";
const GOLD = "#d4a017";

export default function LarvaeSurveyPage() {
  const [boards, setBoards] = useState<BoardStub[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [respondents, setRespondents] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [revealed, setRevealed] = useState<Answer[]>([]);
  const [strikes, setStrikes] = useState(0);
  const [score, setScore] = useState(0);
  const [guess, setGuess] = useState("");
  const [checking, setChecking] = useState(false);
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null);
  const [roundOver, setRoundOver] = useState(false);
  const [lastFlipped, setLastFlipped] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/larvae-survey")
      .then((r) => r.json())
      .then((d) => setBoards(d.boards || []))
      .finally(() => setLoading(false));
  }, []);

  async function startRound(id: string) {
    setChecking(true);
    try {
      const d = await fetch(`/api/larvae-survey?id=${id}`).then((r) => r.json());
      if (d.error) return;
      setActiveId(id);
      setQuestion(d.question);
      setRespondents(d.respondents);
      setSlots(d.slots || []);
      setRevealed([]);
      setStrikes(0);
      setScore(0);
      setGuess("");
      setRoundOver(false);
      setFlash(null);
      setLastFlipped(null);
    } finally {
      setChecking(false);
    }
  }

  async function endRound(id: string) {
    const d = await fetch("/api/larvae-survey", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).then((r) => r.json());
    if (d.answers) setRevealed(d.answers);
    setRoundOver(true);
  }

  async function submitGuess() {
    if (!guess.trim() || checking || roundOver || !activeId) return;
    setChecking(true);
    setFlash(null);
    try {
      const d = await fetch("/api/larvae-survey", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: activeId,
          guess: guess.trim(),
          revealed: revealed.map((r) => r.rank),
        }),
      }).then((r) => r.json());

      if (d.match) {
        const next = [...revealed, d.match];
        setRevealed(next);
        setScore((s) => s + d.match.points);
        setFlash("hit");
        setLastFlipped(d.match.rank);
        setGuess("");
        if (next.length === slots.length) {
          await endRound(activeId);
        }
      } else {
        const nextStrikes = strikes + 1;
        setStrikes(nextStrikes);
        setFlash("miss");
        setGuess("");
        if (nextStrikes >= 3) {
          await endRound(activeId);
        }
      }
    } finally {
      setChecking(false);
      setTimeout(() => setFlash(null), 600);
    }
  }

  function backToMenu() {
    setActiveId(null);
    setRoundOver(false);
    setRevealed([]);
  }

  const revealedByRank = new Map(revealed.map((a) => [a.rank, a]));

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <p className="font-mono text-xs tracking-widest uppercase" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Larvae Survey Game</h1>
          <p className="mt-2 max-w-xl text-sm opacity-75">
            We surveyed the hive. Guess what they said — the more larvae who gave
            an answer, the more it's worth. Three strikes ends the round.
          </p>
        </header>

        {/* ── Board select ── */}
        {!activeId && (
          <>
            {loading ? (
              <p className="text-sm opacity-60">loading boards…</p>
            ) : boards.length === 0 ? (
              <p className="text-sm opacity-60">
                No boards built yet. Run the larvae survey build endpoint first.
              </p>
            ) : (
              <div className="space-y-3">
                {boards.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => startRound(b.id)}
                    disabled={checking}
                    className="w-full rounded-xl border p-4 text-left transition-shadow hover:shadow-md disabled:opacity-50"
                    style={{ borderColor: `${INK}22`, background: "#fff" }}
                  >
                    <p className="text-base font-bold">{b.question}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-widest opacity-50">
                      {b.answerCount} answers · {b.respondents} larvae surveyed
                    </p>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Active round ── */}
        {activeId && (
          <>
            <section
              className="mb-5 rounded-xl border p-5"
              style={{
                borderColor: flash === "hit" ? GOLD : flash === "miss" ? CORAL : `${INK}22`,
                borderWidth: flash ? 2 : 1,
                background: "#fff",
                transition: "border-color 150ms ease",
              }}
            >
              <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                survey says
              </p>
              <p className="mt-1 text-xl font-bold">{question}</p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest opacity-45">
                {respondents} larvae surveyed
              </p>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                    score
                  </p>
                  <p className="text-2xl font-bold" style={{ color: GOLD }}>
                    {score}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                    strikes
                  </p>
                  <p className="text-2xl font-bold tracking-widest" style={{ color: CORAL }}>
                    {"✕".repeat(strikes)}
                    <span className="opacity-20">{"✕".repeat(3 - strikes)}</span>
                  </p>
                </div>
              </div>
            </section>

            {/* Board */}
            <div className="mb-5 space-y-2">
              {slots.map((slot) => {
                const answer = revealedByRank.get(slot.rank);
                const justFlipped = lastFlipped === slot.rank;
                return (
                  <div
                    key={slot.rank}
                    className="flex items-center gap-3 rounded-lg border px-4 py-3"
                    style={{
                      borderColor: answer ? `${GOLD}66` : `${INK}18`,
                      background: answer ? "#fff" : `${INK}08`,
                      boxShadow: justFlipped ? `0 0 0 2px ${GOLD}55` : "none",
                      transition: "all 200ms ease",
                    }}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold"
                      style={{
                        background: answer ? GOLD : `${INK}18`,
                        color: answer ? "#fff" : `${INK}66`,
                      }}
                    >
                      {slot.rank}
                    </span>

                    {answer ? (
                      <>
                        <span className="min-w-0 flex-1 font-bold tracking-wide">
                          {answer.label}
                        </span>
                        <span className="shrink-0 font-mono text-sm font-bold" style={{ color: CORAL }}>
                          {answer.points}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 font-mono text-sm tracking-[0.3em] opacity-25">
                          ▒▒▒▒▒▒▒▒
                        </span>
                        <span className="shrink-0 font-mono text-sm opacity-25">
                          {roundOver ? slot.points : "?"}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Guess input / round end */}
            {!roundOver ? (
              <div className="flex gap-2">
                <input
                  value={guess}
                  onChange={(e) => setGuess(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitGuess()}
                  maxLength={80}
                  autoFocus
                  placeholder="your guess…"
                  className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2"
                  style={{ borderColor: `${INK}25` }}
                />
                <button
                  onClick={submitGuess}
                  disabled={checking || !guess.trim()}
                  className="shrink-0 rounded-lg px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: CORAL }}
                >
                  {checking ? "…" : "Guess"}
                </button>
              </div>
            ) : (
              <section
                className="rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: "#fff" }}
              >
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  round over
                </p>
                <p className="mt-1 text-2xl font-bold" style={{ color: GOLD }}>
                  {score} points
                </p>

                <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: `${INK}15` }}>
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                    who said what
                  </p>
                  {revealed
                    .slice()
                    .sort((a, b) => a.rank - b.rank)
                    .map((a) => (
                      <div key={a.rank}>
                        <p className="text-sm font-bold">
                          {a.rank}. {a.label}{" "}
                          <span className="font-mono text-xs font-normal opacity-50">
                            ×{a.count}
                          </span>
                        </p>
                        <p className="text-xs opacity-60">{a.voices.join(" · ")}</p>
                      </div>
                    ))}
                </div>

                <button
                  onClick={backToMenu}
                  className="mt-5 w-full rounded-lg px-5 py-3 text-sm font-semibold text-white"
                  style={{ background: CORAL }}
                >
                  Play another
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
