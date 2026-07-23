// app/larvae-survey/page.tsx
// Larvae Survey Game — TV-show style flow.
// 3 rounds with strikes + per-answer timer → Fast Money → dramatic reveal → leaderboard.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Nav from "@/components/Nav";

/* ─── Types ───────────────────────────────────────────────────────── */

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

type LeaderboardEntry = {
  name: string;
  score: number;
  rounds: number;
  fmScore: number;
  date: string;
};

type Phase =
  | "title"
  | "round"
  | "reveal"
  | "fastmoney"
  | "fm-reveal"
  | "results"
  | "leaderboard-submit";

/* ─── Design tokens ───────────────────────────────────────────────── */

const INK = "#1e2a3a";
const CORAL = "#e8604c";
const SHEET = "#eef4f1";
const GOLD = "#d4a017";
const GREEN = "#2d8a56";

/* ─── Game constants ──────────────────────────────────────────────── */

const MAIN_ROUNDS = 3;
const MAX_STRIKES = 3;
const ANSWER_TIMER = 20; // seconds per guess attempt
const FM_QUESTIONS = 5;
const FM_TIMER = 15; // seconds per FM question
const FM_BONUS_THRESHOLD = 100;
const FM_BONUS = 500;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ─── Component ───────────────────────────────────────────────────── */

export default function LarvaeSurveyPage() {
  /* Board data */
  const [boards, setBoards] = useState<BoardStub[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  /* Game state */
  const [phase, setPhase] = useState<Phase>("title");
  const [mainIds, setMainIds] = useState<string[]>([]);
  const [fmIds, setFmIds] = useState<string[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [fmIndex, setFmIndex] = useState(0);

  /* Round state */
  const [activeId, setActiveId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [respondents, setRespondents] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [revealed, setRevealed] = useState<Answer[]>([]);
  const [strikes, setStrikes] = useState(0);
  const [roundScore, setRoundScore] = useState(0);
  const [sessionScore, setSessionScore] = useState(0);

  /* Fast Money */
  const [fmScore, setFmScore] = useState(0);
  const [fmAnswers, setFmAnswers] = useState<
    { question: string; guess: string; points: number; label: string | null; topAnswer: string }[]
  >([]);
  const [fmRevealIndex, setFmRevealIndex] = useState(-1);

  /* UI state */
  const [guess, setGuess] = useState("");
  const [checking, setChecking] = useState(false);
  const [flash, setFlash] = useState<"hit" | "miss" | null>(null);
  const [lastFlipped, setLastFlipped] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [strikeAnim, setStrikeAnim] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [submittedRank, setSubmittedRank] = useState<number | null>(null);

  /* Refs for async callbacks */
  const endingRef = useRef(false);
  const revealedRef = useRef<Answer[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("title");
  const questionRef = useRef("");
  const fmIndexRef = useRef(0);
  const fmIdsRef = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { revealedRef.current = revealed; }, [revealed]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { questionRef.current = question; }, [question]);
  useEffect(() => { fmIndexRef.current = fmIndex; }, [fmIndex]);
  useEffect(() => { fmIdsRef.current = fmIds; }, [fmIds]);

  /* Load boards + leaderboard */
  useEffect(() => {
    Promise.all([
      fetch("/api/larvae-survey").then((r) => r.json()),
      fetch("/api/larvae-survey/leaderboard").then((r) => r.json()).catch(() => ({ leaderboard: [] })),
    ]).then(([bd, lb]) => {
      setBoards(bd.boards || []);
      setLeaderboard(lb.leaderboard || []);
    }).finally(() => setLoading(false));
  }, []);

  /* ─── Board loading ─────────────────────────────────────────────── */

  const loadBoard = useCallback(async (id: string) => {
    const d = await fetch(`/api/larvae-survey?id=${id}`).then((r) => r.json());
    if (d.error) throw new Error(d.error);
    setActiveId(id);
    setQuestion(d.question);
    setRespondents(d.respondents);
    setSlots(d.slots || []);
    setRevealed([]);
    setStrikes(0);
    setRoundScore(0);
    setGuess("");
    setFlash(null);
    setLastFlipped(null);
    endingRef.current = false;
    return d;
  }, []);

  const revealBoard = useCallback(async (id: string) => {
    const d = await fetch("/api/larvae-survey", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).then((r) => r.json());
    if (d.answers) setRevealed(d.answers);
    return d.answers as Answer[] | undefined;
  }, []);

  /* ─── Timer ─────────────────────────────────────────────────────── */

  useEffect(() => {
    if (phase !== "round" && phase !== "fastmoney") return;
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, secondsLeft]);

  // Timer expired
  useEffect(() => {
    if (secondsLeft !== 0) return;
    if (phase === "round" && activeId && !endingRef.current) {
      // Time's up on this answer = strike
      handleStrike();
    }
    if (phase === "fastmoney" && !endingRef.current) {
      void resolveFastMoney(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase]);

  /* ─── Strike handling ───────────────────────────────────────────── */

  const finishMainRound = useCallback(async (id: string) => {
    if (endingRef.current) return;
    endingRef.current = true;
    setChecking(true);
    try {
      await revealBoard(id);
      setSessionScore((s) => s + roundScore);
      setPhase("reveal");
    } finally {
      setChecking(false);
    }
  // roundScore is read inside but we want the latest via closure
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealBoard]);

  function handleStrike() {
    const next = strikes + 1;
    setStrikes(next);
    setStrikeAnim(true);
    setFlash("miss");
    setTimeout(() => { setStrikeAnim(false); setFlash(null); }, 800);
    if (next >= MAX_STRIKES) {
      if (activeId) void finishMainRound(activeId);
    } else {
      setSecondsLeft(ANSWER_TIMER); // reset timer for next guess
      setGuess("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  /* ─── Game start ────────────────────────────────────────────────── */

  async function startGame() {
    setError(null);
    const need = MAIN_ROUNDS + FM_QUESTIONS;
    if (boards.length < need) {
      setError(`Need at least ${need} boards (have ${boards.length}). Run the survey build.`);
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
    setFmRevealIndex(-1);
    setSubmittedRank(null);
    setPlayerName("");
    setChecking(true);
    try {
      await loadBoard(mains[0]);
      setSecondsLeft(ANSWER_TIMER);
      setPhase("round");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load board");
    } finally {
      setChecking(false);
    }
  }

  /* ─── Main round guess ─────────────────────────────────────────── */

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
        setSecondsLeft(ANSWER_TIMER); // reset timer
        if (next.length === slots.length) {
          await finishMainRound(activeId);
        } else {
          setTimeout(() => inputRef.current?.focus(), 100);
        }
      } else {
        // Miss = strike
        setGuess("");
        handleStrike();
      }
    } finally {
      setChecking(false);
      setTimeout(() => setFlash(null), 600);
    }
  }

  /* ─── Advance after reveal ──────────────────────────────────────── */

  async function advanceAfterReveal() {
    const next = roundIndex + 1;
    if (next < MAIN_ROUNDS) {
      setChecking(true);
      try {
        await loadBoard(mainIds[next]);
        setRoundIndex(next);
        setSecondsLeft(ANSWER_TIMER);
        setPhase("round");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load board");
      } finally {
        setChecking(false);
      }
      return;
    }
    // Start Fast Money
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

  /* ─── Fast Money ────────────────────────────────────────────────── */

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

    // Get the #1 answer for the reveal
    let topAnswer = "";
    try {
      if (id) {
        const fullBoard = await fetch("/api/larvae-survey", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id }),
        }).then((r) => r.json());
        if (fullBoard.answers?.[0]) {
          topAnswer = fullBoard.answers[0].label;
        }
      }
    } catch { /* continue */ }

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
    } catch { /* continue */ }

    setFmAnswers((prev) => [
      ...prev,
      { question: q, guess: trimmed || "(timed out)", points, label, topAnswer },
    ]);
    setFmScore((s) => s + points);

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
      // All FM questions done — go to dramatic reveal
      setFmRevealIndex(-1);
      setPhase("fm-reveal");
    }
    setChecking(false);
  }

  async function submitFmGuess() {
    if (!guess.trim() || checking || phase !== "fastmoney") return;
    const g = guess.trim();
    setGuess("");
    await resolveFastMoney(g);
  }

  /* ─── FM Reveal stepping ────────────────────────────────────────── */

  function stepFmReveal() {
    const next = fmRevealIndex + 1;
    if (next >= fmAnswers.length) {
      setPhase("leaderboard-submit");
    } else {
      setFmRevealIndex(next);
    }
  }

  /* ─── Leaderboard submit ────────────────────────────────────────── */

  const fmBonus = fmScore >= FM_BONUS_THRESHOLD ? FM_BONUS : 0;
  const grandTotal = sessionScore + fmScore + fmBonus;

  async function submitScore() {
    const name = playerName.trim() || "Anonymous";
    try {
      const d = await fetch("/api/larvae-survey/leaderboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, score: grandTotal, rounds: sessionScore, fmScore }),
      }).then((r) => r.json());
      setLeaderboard(d.leaderboard || []);
      setSubmittedRank(d.rank);
      setPhase("results");
    } catch {
      setPhase("results");
    }
  }

  function skipLeaderboard() {
    setPhase("results");
  }

  function backToTitle() {
    setPhase("title");
    setActiveId(null);
    setRevealed([]);
    setGuess("");
    endingRef.current = false;
  }

  /* ─── Derived ───────────────────────────────────────────────────── */

  const revealedByRank = new Map(revealed.map((a) => [a.rank, a]));
  const canPlay = boards.length >= MAIN_ROUNDS + FM_QUESTIONS;
  const fmRunningTotal = fmAnswers.slice(0, fmRevealIndex + 1).reduce((s, a) => s + a.points, 0);

  /* ─── Render ────────────────────────────────────────────────────── */

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-2xl">
        <Nav />
        <header className="mb-8">
          <p className="font-mono text-xs tracking-widest uppercase" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Larvae Survey Game</h1>
          {phase === "title" && (
            <p className="mt-2 max-w-xl text-sm opacity-75">
              We surveyed the hive. Guess what they said. Three strikes ends the round,
              then Fast Money — five questions, one guess each. Hit 100+ in Fast Money for a 500-point bonus.
            </p>
          )}
        </header>

        {/* ════════════════ TITLE ════════════════ */}
        {phase === "title" && (
          <>
            <section
              className="rounded-xl border p-6"
              style={{ borderColor: `${INK}22`, background: "#fff" }}
            >
              {loading ? (
                <p className="text-sm opacity-60">loading…</p>
              ) : boards.length === 0 ? (
                <p className="text-sm opacity-60">No boards built yet. Run the survey build endpoint.</p>
              ) : (
                <>
                  <div className="mb-5 space-y-2 font-mono text-[10px] uppercase tracking-widest opacity-55">
                    <p>{MAIN_ROUNDS} survey rounds · {ANSWER_TIMER}s per guess · 3 strikes</p>
                    <p>Fast Money · {FM_QUESTIONS} questions · {FM_TIMER}s each</p>
                    <p>{boards.length} boards ready</p>
                  </div>
                  {error && <p className="mb-3 text-sm" style={{ color: CORAL }}>{error}</p>}
                  {!canPlay && (
                    <p className="mb-3 text-sm opacity-60">
                      Need {MAIN_ROUNDS + FM_QUESTIONS} boards (have {boards.length}).
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

            {/* Leaderboard on title screen */}
            {leaderboard.length > 0 && (
              <section
                className="mt-5 rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: "#fff" }}
              >
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  leaderboard
                </p>
                <div className="mt-3 space-y-2">
                  {leaderboard.slice(0, 10).map((e, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
                        style={{
                          background: i === 0 ? GOLD : i === 1 ? "#8a8a8a" : i === 2 ? "#b87333" : `${INK}15`,
                          color: i < 3 ? "#fff" : `${INK}88`,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.name}</span>
                      <span className="shrink-0 font-mono text-sm font-bold" style={{ color: GOLD }}>
                        {e.score}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* ════════════════ MAIN ROUND ════════════════ */}
        {phase === "round" && activeId && (
          <>
            {/* Strike animation overlay */}
            {strikeAnim && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.3)", pointerEvents: "none" }}
              >
                <span className="text-[120px] font-black" style={{ color: CORAL }}>✕</span>
              </div>
            )}

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
                  <p
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: secondsLeft <= 5 ? CORAL : INK }}
                  >
                    {secondsLeft}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">round</p>
                  <p className="text-2xl font-bold" style={{ color: GOLD }}>{roundScore}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">strikes</p>
                  <p className="text-2xl font-bold tracking-widest" style={{ color: CORAL }}>
                    {"✕".repeat(strikes)}
                    <span className="opacity-20">{"✕".repeat(MAX_STRIKES - strikes)}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">total</p>
                  <p className="text-2xl font-bold">{sessionScore}</p>
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
                      style={{ background: answer ? GOLD : `${INK}18`, color: answer ? "#fff" : `${INK}66` }}
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
                        <span className="flex-1 font-mono text-sm tracking-[0.3em] opacity-25">▒▒▒▒▒▒▒▒</span>
                        <span className="shrink-0 font-mono text-sm opacity-25">?</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <input
                ref={inputRef}
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

        {/* ════════════════ ROUND REVEAL ════════════════ */}
        {phase === "reveal" && (
          <section className="rounded-xl border p-5" style={{ borderColor: `${INK}22`, background: "#fff" }}>
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
              {revealed.slice().sort((a, b) => a.rank - b.rank).map((a) => (
                <div key={a.rank}>
                  <p className="text-sm font-bold">
                    {a.rank}. {a.label}{" "}
                    <span className="font-mono text-xs font-normal opacity-50">{a.points} pts · ×{a.count}</span>
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
              {checking ? "…" : roundIndex + 1 < MAIN_ROUNDS ? `Next: Round ${roundIndex + 2}` : "Fast Money →"}
            </button>
          </section>
        )}

        {/* ════════════════ FAST MONEY ════════════════ */}
        {phase === "fastmoney" && activeId && (
          <>
            <section
              className="mb-5 rounded-xl border p-5"
              style={{
                borderColor: `${GOLD}44`,
                borderWidth: 2,
                background: "#fff",
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                    ⚡ Fast Money · {fmIndex + 1} of {FM_QUESTIONS}
                  </p>
                  <p className="mt-1 text-xl font-bold">{question}</p>
                  <p className="mt-1 text-sm opacity-60">One guess. Go with your gut.</p>
                </div>
                <div className="text-right">
                  <p
                    className="text-3xl font-bold tabular-nums"
                    style={{ color: secondsLeft <= 5 ? CORAL : INK }}
                  >
                    {secondsLeft}
                  </p>
                </div>
              </div>
            </section>

            <div className="flex gap-2">
              <input
                ref={inputRef}
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
                style={{ background: GOLD }}
              >
                {checking ? "…" : "Lock in"}
              </button>
            </div>
          </>
        )}

        {/* ════════════════ FM DRAMATIC REVEAL ════════════════ */}
        {phase === "fm-reveal" && (
          <section className="rounded-xl border p-5" style={{ borderColor: `${GOLD}44`, borderWidth: 2, background: "#fff" }}>
            <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
              ⚡ Fast Money — reveal
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color: GOLD }}>
              {fmRunningTotal}
            </p>
            {fmRevealIndex >= 0 && fmRunningTotal >= FM_BONUS_THRESHOLD && (
              <p className="text-sm font-semibold" style={{ color: GREEN }}>
                Bonus unlocked! +{FM_BONUS}
              </p>
            )}

            <div className="mt-4 space-y-4">
              {fmAnswers.map((a, i) => {
                const isRevealed = i <= fmRevealIndex;
                const isActive = i === fmRevealIndex;
                return (
                  <div
                    key={i}
                    className="rounded-lg border p-3 transition-all duration-300"
                    style={{
                      borderColor: isActive ? GOLD : isRevealed ? `${INK}18` : `${INK}10`,
                      background: isRevealed ? "#fff" : `${INK}05`,
                      opacity: isRevealed ? 1 : 0.4,
                    }}
                  >
                    {isRevealed ? (
                      <>
                        <p className="text-xs opacity-55">{a.question}</p>
                        <div className="mt-2 flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-[10px] uppercase tracking-widest opacity-40">you said</p>
                            <p className="text-sm font-bold">{a.guess}</p>
                          </div>
                          <div className="text-center px-3">
                            <p
                              className="text-lg font-black"
                              style={{ color: a.points > 0 ? GREEN : CORAL }}
                            >
                              {a.points > 0 ? `+${a.points}` : "✕"}
                            </p>
                          </div>
                          <div className="min-w-0 flex-1 text-right">
                            <p className="font-mono text-[10px] uppercase tracking-widest opacity-40">#1 answer</p>
                            <p className="text-sm font-bold" style={{ color: GOLD }}>{a.topAnswer}</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-center font-mono text-sm tracking-widest opacity-30">
                        {i + 1}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={stepFmReveal}
              className="mt-5 w-full rounded-lg px-5 py-3 text-sm font-semibold text-white"
              style={{ background: GOLD }}
            >
              {fmRevealIndex + 1 >= fmAnswers.length ? "See final score →" : "Reveal next"}
            </button>
          </section>
        )}

        {/* ════════════════ LEADERBOARD SUBMIT ════════════════ */}
        {phase === "leaderboard-submit" && (
          <section className="rounded-xl border p-6" style={{ borderColor: `${INK}22`, background: "#fff" }}>
            <p className="font-mono text-xs uppercase tracking-widest opacity-60">game over</p>
            <p className="mt-1 text-4xl font-bold" style={{ color: GOLD }}>{grandTotal}</p>
            <div className="mt-3 space-y-1 font-mono text-xs uppercase tracking-widest opacity-60">
              <p>Survey rounds · {sessionScore}</p>
              <p>Fast Money · {fmScore}</p>
              {fmBonus > 0 && <p>Bonus · {fmBonus}</p>}
            </div>

            <div className="mt-5 border-t pt-5" style={{ borderColor: `${INK}15` }}>
              <p className="text-sm font-semibold">Add your score to the leaderboard?</p>
              <div className="mt-3 flex gap-2">
                <input
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitScore()}
                  maxLength={24}
                  autoFocus
                  placeholder="your name…"
                  className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2"
                  style={{ borderColor: `${INK}25` }}
                />
                <button
                  onClick={submitScore}
                  className="shrink-0 rounded-lg px-5 py-3 text-sm font-semibold text-white"
                  style={{ background: GOLD }}
                >
                  Submit
                </button>
              </div>
              <button
                onClick={skipLeaderboard}
                className="mt-2 w-full text-center text-xs opacity-40 hover:opacity-70"
              >
                skip
              </button>
            </div>
          </section>
        )}

        {/* ════════════════ FINAL RESULTS ════════════════ */}
        {phase === "results" && (
          <section className="rounded-xl border p-6" style={{ borderColor: `${INK}22`, background: "#fff" }}>
            <p className="font-mono text-xs uppercase tracking-widest opacity-60">final score</p>
            <p className="mt-1 text-4xl font-bold" style={{ color: GOLD }}>{grandTotal}</p>
            {submittedRank && (
              <p className="mt-1 text-sm font-semibold" style={{ color: GREEN }}>
                #{submittedRank} on the leaderboard
              </p>
            )}
            <div className="mt-3 space-y-1 font-mono text-xs uppercase tracking-widest opacity-60">
              <p>Survey rounds · {sessionScore}</p>
              <p>Fast Money · {fmScore}</p>
              {fmBonus > 0 && <p>Bonus · {fmBonus}</p>}
            </div>

            {leaderboard.length > 0 && (
              <div className="mt-5 border-t pt-4" style={{ borderColor: `${INK}15` }}>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">leaderboard</p>
                <div className="mt-2 space-y-2">
                  {leaderboard.slice(0, 10).map((e, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
                        style={{
                          background: i === 0 ? GOLD : i === 1 ? "#8a8a8a" : i === 2 ? "#b87333" : `${INK}15`,
                          color: i < 3 ? "#fff" : `${INK}88`,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.name}</span>
                      <span className="shrink-0 font-mono text-sm font-bold" style={{ color: GOLD }}>
                        {e.score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
