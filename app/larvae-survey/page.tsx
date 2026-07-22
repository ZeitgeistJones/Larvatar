// app/larvae-survey/page.tsx
// Larvae Survey Game — Arkadium-style Family Feud flow.
// 3 timed survey rounds → Fast Money (5 one-guess questions) → results.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

type Phase =
  | "title"
  | "round"
  | "reveal"
  | "fastmoney"
  | "fm-result"
  | "results";

const INK = "#1e2a3a";
const CORAL = "#e8604c";
const SHEET = "#eef4f1";
const GOLD = "#d4a017";

const ROUND_TIMERS = [45, 40, 35];
const FM_TIMER = 20;
const FM_BONUS_THRESHOLD = 100;
const FM_BONUS = 500;
const MAIN_ROUNDS = 3;
const FM_QUESTIONS = 5;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function LarvaeSurveyPage() {
  const [boards, setBoards] = useState<BoardStub[]>([]);
  const [loading, setLoading] = useState(true);

  const [phase, setPhase] = useState<Phase>("title");
  const [mainIds, setMainIds] = useState<string[]>([]);
  const [fmIds, setFmIds] = useState<string[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [fmIndex, setFmIndex] = useState(0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [respondents, setRespondents] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [revealed, setRevealed] = useState<Answer[]>([]);
  const [roundScore, setRoundScore] = useState(0);
  const [sessionScore, setSessionScore] = useState(0);
  const [fmScore, setFmScore] = useState(0);
  const [fmAnswers, setFmAnswers] = useState<
    { question: string; guess: string; points: number; label: string | null }[]
  >([]);
  const [guess, setGuess] = useState("");
  const [checking, setChecking] = useState(false);
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null);
  const [lastFlipped, setLastFlipped] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const endingRef = useRef(false);
  const revealedRef = useRef<Answer[]>([]);
  const roundScoreRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("title");
  const questionRef = useRef("");
  const fmIndexRef = useRef(0);
  const fmIdsRef = useRef<string[]>([]);

  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);
  useEffect(() => {
    roundScoreRef.current = roundScore;
  }, [roundScore]);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    questionRef.current = question;
  }, [question]);
  useEffect(() => {
    fmIndexRef.current = fmIndex;
  }, [fmIndex]);
  useEffect(() => {
    fmIdsRef.current = fmIds;
  }, [fmIds]);

  useEffect(() => {
    fetch("/api/larvae-survey")
      .then((r) => r.json())
      .then((d) => setBoards(d.boards || []))
      .finally(() => setLoading(false));
  }, []);

  const loadBoard = useCallback(async (id: string) => {
    const d = await fetch(`/api/larvae-survey?id=${id}`).then((r) => r.json());
    if (d.error) throw new Error(d.error);
    setActiveId(id);
    setQuestion(d.question);
    setRespondents(d.respondents);
    setSlots(d.slots || []);
    setRevealed([]);
    setRoundScore(0);
    setGuess("");
    setFlash(null);
    setLastFlipped(null);
    endingRef.current = false;
    return d as { id: string; question: string; slots: Slot[] };
  }, []);

  const revealBoard = useCallback(async (id: string) => {
    const d = await fetch("/api/larvae-survey", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).then((r) => r.json());
    if (d.answers) setRevealed(d.answers);
    return d;
  }, []);

  const finishMainRound = useCallback(
    async (id: string) => {
      if (endingRef.current) return;
      endingRef.current = true;
      setChecking(true);
      try {
        await revealBoard(id);
        setSessionScore((s) => s + roundScoreRef.current);
        setPhase("reveal");
      } finally {
        setChecking(false);
      }
    },
    [revealBoard]
  );

  // Countdown for main rounds + Fast Money
  useEffect(() => {
    if (phase !== "round" && phase !== "fastmoney") return;
    if (secondsLeft <= 0) return;

    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft]);

  useEffect(() => {
    if (secondsLeft !== 0) return;
    if (phase === "round" && activeId) {
      void finishMainRound(activeId);
    }
  }, [secondsLeft, phase, activeId, finishMainRound]);

  async function startGame() {
    setError(null);
    const need = MAIN_ROUNDS + FM_QUESTIONS;
    if (boards.length < need) {
      setError(
        `Need at least ${need} boards built (have ${boards.length}). Run the survey build endpoint.`
      );
      return;
    }
    const picked = shuffle(boards).slice(0, need);
    const mains = picked.slice(0, MAIN_ROUNDS).map((b) => b.id);
    const fms = picked.slice(MAIN_ROUNDS).map((b) => b.id);
    setMainIds(mains);
    setFmIds(fms);
    setRoundIndex(0);
    setFmIndex(0);
    setSessionScore(0);
    setFmScore(0);
    setFmAnswers([]);
    setChecking(true);
    try {
      await loadBoard(mains[0]);
      setSecondsLeft(ROUND_TIMERS[0]);
      setPhase("round");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load board");
    } finally {
      setChecking(false);
    }
  }

  async function advanceAfterReveal() {
    const next = roundIndex + 1;
    if (next < MAIN_ROUNDS) {
      setChecking(true);
      try {
        await loadBoard(mainIds[next]);
        setRoundIndex(next);
        setSecondsLeft(ROUND_TIMERS[next]);
        setPhase("round");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load board");
      } finally {
        setChecking(false);
      }
      return;
    }
    // Enter Fast Money
    setChecking(true);
    try {
      await loadBoard(fmIds[0]);
      setFmIndex(0);
      setSecondsLeft(FM_TIMER);
      setPhase("fastmoney");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load board");
    } finally {
      setChecking(false);
    }
  }

  async function submitMainGuess() {
    if (!guess.trim() || checking || phase !== "round" || !activeId) return;
    setChecking(true);
    setFlash(null);
    try {
      const d = await fetch("/api/larvae-survey", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: activeId,
          guess: guess.trim(),
          revealed: revealedRef.current.map((r) => r.rank),
        }),
      }).then((r) => r.json());

      if (d.match) {
        const next = [...revealedRef.current, d.match];
        setRevealed(next);
        setRoundScore((s) => s + d.match.points);
        setFlash("hit");
        setLastFlipped(d.match.rank);
        setGuess("");
        if (next.length === slots.length) {
          await finishMainRound(activeId);
        }
      } else {
        setFlash("miss");
        setGuess("");
      }
    } finally {
      setChecking(false);
      setTimeout(() => setFlash(null), 600);
    }
  }

  async function resolveFastMoney(playerGuess: string | null) {
    if (endingRef.current || phaseRef.current !== "fastmoney") return;
    endingRef.current = true;
    setChecking(true);
    const id = activeIdRef.current;
    const q = questionRef.current;
    const currentFm = fmIndexRef.current;
    let points = 0;
    let label: string | null = null;
    const trimmed = (playerGuess || "").trim();

    try {
      if (id && trimmed) {
        const d = await fetch("/api/larvae-survey", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, guess: trimmed, revealed: [] }),
        }).then((r) => r.json());
        if (d.match) {
          points = d.match.points;
          label = d.match.label;
        }
      }
    } catch {
      // continue even on network miss
    }

    setFmAnswers((prev) => [
      ...prev,
      {
        question: q,
        guess: trimmed || "(no answer)",
        points,
        label,
      },
    ]);
    setFmScore((s) => s + points);
    setFlash(points > 0 ? "hit" : "miss");

    const nextIdx = currentFm + 1;
    if (nextIdx < FM_QUESTIONS) {
      try {
        await loadBoard(fmIdsRef.current[nextIdx]);
        setFmIndex(nextIdx);
        setSecondsLeft(FM_TIMER);
        endingRef.current = false;
        setPhase("fastmoney");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load board");
        setPhase("results");
      }
    } else {
      setPhase("fm-result");
    }
    setChecking(false);
    setTimeout(() => setFlash(null), 500);
  }

  // Fast Money timer expiry → auto-resolve with empty guess
  useEffect(() => {
    if (phase !== "fastmoney") return;
    if (secondsLeft !== 0) return;
    void resolveFastMoney(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only fire on timer zero
  }, [secondsLeft, phase]);

  async function submitFmGuess() {
    if (!guess.trim() || checking || phase !== "fastmoney") return;
    const g = guess.trim();
    setGuess("");
    await resolveFastMoney(g);
  }

  function finishGame() {
    setPhase("results");
  }

  function backToTitle() {
    setPhase("title");
    setActiveId(null);
    setRevealed([]);
    setGuess("");
    endingRef.current = false;
  }

  const revealedByRank = new Map(revealed.map((a) => [a.rank, a]));
  const fmBonus = fmScore >= FM_BONUS_THRESHOLD ? FM_BONUS : 0;
  const grandTotal = sessionScore + fmScore + fmBonus;
  const canPlay = boards.length >= MAIN_ROUNDS + FM_QUESTIONS;

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-2xl">
        <header className="mb-8">
          <p className="font-mono text-xs tracking-widest uppercase" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Larvae Survey Game</h1>
          {phase === "title" && (
            <p className="mt-2 max-w-xl text-sm opacity-75">
              Three timed survey rounds — guess what the hive said. Then Fast Money:
              five questions, one guess each. Score 100+ in Fast Money for a 500-point bonus.
            </p>
          )}
        </header>

        {/* ── Title ── */}
        {phase === "title" && (
          <section
            className="rounded-xl border p-6"
            style={{ borderColor: `${INK}22`, background: "#fff" }}
          >
            {loading ? (
              <p className="text-sm opacity-60">loading boards…</p>
            ) : boards.length === 0 ? (
              <p className="text-sm opacity-60">
                No boards built yet. Run the larvae survey build endpoint first.
              </p>
            ) : (
              <>
                <div className="mb-5 space-y-2 font-mono text-[10px] uppercase tracking-widest opacity-55">
                  <p>3 survey rounds · timed</p>
                  <p>Fast Money · 5 questions · 20s each</p>
                  <p>{boards.length} boards ready</p>
                </div>
                {error && (
                  <p className="mb-3 text-sm" style={{ color: CORAL }}>
                    {error}
                  </p>
                )}
                {!canPlay && (
                  <p className="mb-3 text-sm opacity-60">
                    Need at least {MAIN_ROUNDS + FM_QUESTIONS} boards to play a full game
                    (have {boards.length}).
                  </p>
                )}
                <button
                  onClick={startGame}
                  disabled={checking || !canPlay}
                  className="w-full rounded-lg px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: CORAL }}
                >
                  {checking ? "…" : "Play"}
                </button>
              </>
            )}
          </section>
        )}

        {/* ── Main round ── */}
        {phase === "round" && activeId && (
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
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                    Round {roundIndex + 1} of {MAIN_ROUNDS}
                  </p>
                  <p className="mt-1 text-xl font-bold">{question}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest opacity-45">
                    {respondents} larvae surveyed
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                    time
                  </p>
                  <p
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: secondsLeft <= 10 ? CORAL : INK }}
                  >
                    {secondsLeft}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                    round
                  </p>
                  <p className="text-2xl font-bold" style={{ color: GOLD }}>
                    {roundScore}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                    total
                  </p>
                  <p className="text-2xl font-bold">{sessionScore}</p>
                </div>
              </div>
            </section>

            <AnswerBoard
              slots={slots}
              revealedByRank={revealedByRank}
              lastFlipped={lastFlipped}
              showPoints={false}
            />

            <div className="flex gap-2">
              <input
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitMainGuess()}
                maxLength={80}
                autoFocus
                placeholder="your guess…"
                className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2"
                style={{ borderColor: `${INK}25` }}
              />
              <button
                onClick={submitMainGuess}
                disabled={checking || !guess.trim()}
                className="shrink-0 rounded-lg px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: CORAL }}
              >
                {checking ? "…" : "Guess"}
              </button>
            </div>
          </>
        )}

        {/* ── Round reveal ── */}
        {phase === "reveal" && (
          <section
            className="rounded-xl border p-5"
            style={{ borderColor: `${INK}22`, background: "#fff" }}
          >
            <p className="font-mono text-xs uppercase tracking-widest opacity-60">
              Round {roundIndex + 1} — survey says
            </p>
            <p className="mt-1 text-lg font-bold">{question}</p>
            <p className="mt-2 text-2xl font-bold" style={{ color: GOLD }}>
              +{roundScore} this round
            </p>
            <p className="font-mono text-xs uppercase tracking-widest opacity-50">
              session total {sessionScore}
            </p>

            <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: `${INK}15` }}>
              {revealed
                .slice()
                .sort((a, b) => a.rank - b.rank)
                .map((a) => (
                  <div key={a.rank}>
                    <p className="text-sm font-bold">
                      {a.rank}. {a.label}{" "}
                      <span className="font-mono text-xs font-normal opacity-50">
                        {a.points} pts · ×{a.count}
                      </span>
                    </p>
                    <p className="text-xs opacity-60">{a.voices.join(" · ")}</p>
                  </div>
                ))}
            </div>

            <button
              onClick={advanceAfterReveal}
              disabled={checking}
              className="mt-5 w-full rounded-lg px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: CORAL }}
            >
              {checking
                ? "…"
                : roundIndex + 1 < MAIN_ROUNDS
                  ? `Next: Round ${roundIndex + 2}`
                  : "Fast Money"}
            </button>
          </section>
        )}

        {/* ── Fast Money ── */}
        {phase === "fastmoney" && activeId && (
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
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                    Fast Money · {fmIndex + 1} of {FM_QUESTIONS}
                  </p>
                  <p className="mt-1 text-xl font-bold">{question}</p>
                  <p className="mt-1 text-sm opacity-60">One guess. Go with your gut.</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                    time
                  </p>
                  <p
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: secondsLeft <= 5 ? CORAL : INK }}
                  >
                    {secondsLeft}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                  fast money score
                </p>
                <p className="text-2xl font-bold" style={{ color: GOLD }}>
                  {fmScore}
                </p>
              </div>
            </section>

            <div className="flex gap-2">
              <input
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitFmGuess()}
                maxLength={80}
                autoFocus
                placeholder="one answer…"
                className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2"
                style={{ borderColor: `${INK}25` }}
              />
              <button
                onClick={submitFmGuess}
                disabled={checking || !guess.trim()}
                className="shrink-0 rounded-lg px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: CORAL }}
              >
                {checking ? "…" : "Lock in"}
              </button>
            </div>
          </>
        )}

        {/* ── Fast Money summary (before final results) ── */}
        {phase === "fm-result" && (
          <section
            className="rounded-xl border p-5"
            style={{ borderColor: `${INK}22`, background: "#fff" }}
          >
            <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
              Fast Money results
            </p>
            <p className="mt-1 text-3xl font-bold" style={{ color: GOLD }}>
              {fmScore} points
            </p>
            {fmBonus > 0 ? (
              <p className="mt-1 text-sm font-semibold" style={{ color: CORAL }}>
                +{FM_BONUS} bonus — you hit {FM_BONUS_THRESHOLD}+!
              </p>
            ) : (
              <p className="mt-1 text-sm opacity-60">
                Need {FM_BONUS_THRESHOLD}+ for the {FM_BONUS}-point bonus.
              </p>
            )}

            <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: `${INK}15` }}>
              {fmAnswers.map((a, i) => (
                <div key={i}>
                  <p className="text-xs opacity-55">{a.question}</p>
                  <p className="text-sm font-bold">
                    {a.guess}
                    {a.label ? (
                      <span className="font-normal opacity-60"> → {a.label}</span>
                    ) : null}{" "}
                    <span className="font-mono text-xs" style={{ color: a.points ? GOLD : CORAL }}>
                      {a.points > 0 ? `+${a.points}` : "0"}
                    </span>
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={finishGame}
              className="mt-5 w-full rounded-lg px-5 py-3 text-sm font-semibold text-white"
              style={{ background: CORAL }}
            >
              See final score
            </button>
          </section>
        )}

        {/* ── Final results ── */}
        {phase === "results" && (
          <section
            className="rounded-xl border p-5"
            style={{ borderColor: `${INK}22`, background: "#fff" }}
          >
            <p className="font-mono text-xs uppercase tracking-widest opacity-60">
              game over
            </p>
            <p className="mt-1 text-4xl font-bold" style={{ color: GOLD }}>
              {grandTotal}
            </p>
            <div className="mt-4 space-y-1 font-mono text-xs uppercase tracking-widest opacity-60">
              <p>Survey rounds · {sessionScore}</p>
              <p>Fast Money · {fmScore}</p>
              {fmBonus > 0 && <p>Bonus · {fmBonus}</p>}
            </div>
            <button
              onClick={backToTitle}
              className="mt-5 w-full rounded-lg px-5 py-3 text-sm font-semibold text-white"
              style={{ background: CORAL }}
            >
              Play again
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

function AnswerBoard({
  slots,
  revealedByRank,
  lastFlipped,
  showPoints,
}: {
  slots: Slot[];
  revealedByRank: Map<number, Answer>;
  lastFlipped: number | null;
  showPoints: boolean;
}) {
  return (
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
                <span className="min-w-0 flex-1 font-bold tracking-wide">{answer.label}</span>
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
                  {showPoints ? slot.points : "?"}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
