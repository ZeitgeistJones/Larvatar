// app/larvae-survey/page.tsx
// Larvae Survey Game — TV-show style knockoff flow.
// 3 rounds with strikes + per-answer timer → Swarm Rush → dramatic reveal → leaderboard.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";
import {
  announce,
  getSurveyMuted,
  playSurveyCue,
  setSurveyMuted,
  startBedMusic,
  stopBedMusic,
  unlockSurveyAudio,
} from "@/lib/survey-sfx";

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
  rationale?: string;
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
  | "fm-locked"
  | "results"
  | "leaderboard-submit";

/* ─── Design tokens come from useTheme() ───────────────────────────── */

/* ─── Game constants ──────────────────────────────────────────────── */

const MAIN_ROUNDS = 3;
const MAX_STRIKES = 3;
const ANSWER_TIMER = 20; // seconds per guess attempt
const FM_QUESTIONS = 5; // max Swarm Rush questions (uses however many boards remain)
const FM_TIMER = 15;
const FM_UNLOCK = 200; // points from main rounds to unlock Swarm Rush
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
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, green: GREEN } = colors;

  /* Board data */
  const [boards, setBoards] = useState<BoardStub[]>([]);
  const [brewing, setBrewing] = useState(false);
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
  /** Full board answers (for end-of-round one-by-one flips). */
  const [boardAnswers, setBoardAnswers] = useState<Answer[]>([]);
  /** Ranks still hidden after the round ends — flipped with "Reveal next". */
  const [pendingReveal, setPendingReveal] = useState<number[]>([]);

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
  const [soundMuted, setSoundMuted] = useState(false);

  /* Refs for async callbacks */
  const endingRef = useRef(false);
  const revealedRef = useRef<Answer[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>("title");
  const questionRef = useRef("");
  const fmIndexRef = useRef(0);
  const fmIdsRef = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const bonusPlayedRef = useRef(false);

  useEffect(() => {
    setSoundMuted(getSurveyMuted());
  }, []);

  useEffect(() => { revealedRef.current = revealed; }, [revealed]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { questionRef.current = question; }, [question]);
  useEffect(() => { fmIndexRef.current = fmIndex; }, [fmIndex]);
  useEffect(() => { fmIdsRef.current = fmIds; }, [fmIds]);

  /* Load boards + leaderboard; auto-brew missing boards (no secret URL). */
  useEffect(() => {
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;

    function stopPoll() {
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
    }

    function startPoll() {
      if (pollId || cancelled) return;
      pollId = setInterval(() => {
        fetch("/api/larvae-survey/ensure")
          .then((r) => r.json())
          .then((ens) => {
            if (cancelled) return;
            if (ens.boards) setBoards(ens.boards);
            const still = Boolean(ens.brewing);
            setBrewing(still);
            if (!still) stopPoll();
          })
          .catch(() => {});
      }, 20_000);
    }

    async function refresh() {
      const [bd, lb] = await Promise.all([
        fetch("/api/larvae-survey").then((r) => r.json()),
        fetch("/api/larvae-survey/leaderboard").then((r) => r.json()).catch(() => ({ leaderboard: [] })),
      ]);
      if (cancelled) return;
      setBoards(bd.boards || []);
      setBrewing(Boolean(bd.brewing));
      setLeaderboard(lb.leaderboard || []);
      setLoading(false);

      const count = (bd.boards || []).length;
      const needsBrew = Boolean(bd.brewing) || count < MAIN_ROUNDS + FM_QUESTIONS;
      if (!needsBrew) return;

      try {
        const ens = await fetch("/api/larvae-survey/ensure").then((r) => r.json());
        if (cancelled) return;
        if (ens.boards) setBoards(ens.boards);
        const still = Boolean(ens.brewing);
        setBrewing(still);
        if (still) startPoll();
      } catch {
        startPoll();
      }
    }

    refresh();
    return () => {
      cancelled = true;
      stopPoll();
    };
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
    setBoardAnswers([]);
    setPendingReveal([]);
    setStrikes(0);
    setRoundScore(0);
    setGuess("");
    setFlash(null);
    setLastFlipped(null);
    endingRef.current = false;
    return d;
  }, []);

  const fetchFullBoard = useCallback(async (id: string) => {
    const d = await fetch("/api/larvae-survey", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    }).then((r) => r.json());
    return (d.answers || []) as Answer[];
  }, []);

  /* ─── Timer ─────────────────────────────────────────────────────── */

  useEffect(() => {
    if (phase !== "round" && phase !== "fastmoney") return;
    if (secondsLeft <= 0) return;
    if (secondsLeft <= 5) playSurveyCue("tick");
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
      const answers = await fetchFullBoard(id);
      const known = new Set(revealedRef.current.map((r) => r.rank));
      const pending = answers
        .filter((a) => !known.has(a.rank))
        .sort((a, b) => a.rank - b.rank)
        .map((a) => a.rank);
      setBoardAnswers(answers);
      setPendingReveal(pending);
      // Keep player's hits on the board; flip the rest one-by-one.
      setSessionScore((s) => s + roundScore);
      if (pending.length === 0) playSurveyCue("reveal");
      else announce("Hive says…");
      setPhase("reveal");
    } finally {
      setChecking(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchFullBoard]);

  function stepBoardReveal() {
    if (pendingReveal.length === 0) return;
    const [rank, ...rest] = pendingReveal;
    const answer = boardAnswers.find((a) => a.rank === rank);
    if (answer) {
      setRevealed((prev) => {
        if (prev.some((p) => p.rank === rank)) return prev;
        return [...prev, answer];
      });
      setLastFlipped(rank);
      playSurveyCue("hit");
    }
    setPendingReveal(rest);
    if (rest.length === 0) {
      setTimeout(() => playSurveyCue("reveal"), 200);
    }
  }

  function handleStrike() {
    const next = strikes + 1;
    setStrikes(next);
    setStrikeAnim(true);
    setFlash("miss");
    playSurveyCue(next >= MAX_STRIKES ? "strikeOut" : "strike");
    announce(next >= MAX_STRIKES ? "Three strikes." : "Strike.");
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
    unlockSurveyAudio();
    setError(null);
    if (boards.length < MAIN_ROUNDS) {
      setError(`Hive still brewing — need ${MAIN_ROUNDS} boards (have ${boards.length}). Hang tight.`);
      return;
    }
    const picked = shuffle(boards);
    const mains = picked.slice(0, MAIN_ROUNDS).map((b) => b.id);
    // Swarm Rush uses leftover boards (up to FM_QUESTIONS) — don't block Play for it.
    const fms = picked.slice(MAIN_ROUNDS, MAIN_ROUNDS + FM_QUESTIONS).map((b) => b.id);
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
    bonusPlayedRef.current = false;
    setChecking(true);
    try {
      await loadBoard(mains[0]);
      setSecondsLeft(ANSWER_TIMER);
      playSurveyCue("start");
      startBedMusic();
      announce("Let's play Larvae Survey!");
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
        playSurveyCue("hit");
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
    // Final round done — Swarm Rush only if score + leftover boards allow it.
    if (sessionScore < FM_UNLOCK) {
      announce("Not enough points for Swarm Rush.");
      setPhase("fm-locked");
      return;
    }
    if (fmIds.length === 0) {
      announce("Not enough boards for Swarm Rush.");
      setPhase("fm-locked");
      return;
    }
    setChecking(true);
    try {
      await loadBoard(fmIds[0]);
      setFmIndex(0);
      setSecondsLeft(FM_TIMER);
      playSurveyCue("fastMoney");
      announce("Swarm Rush!");
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
    if (nextIdx < fmIdsRef.current.length) {
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
      // All Swarm Rush questions done — go to dramatic reveal
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
      const a = fmAnswers[next];
      playSurveyCue(a.points > 0 ? "fmHit" : "fmMiss");
      const running = fmAnswers.slice(0, next + 1).reduce((s, x) => s + x.points, 0);
      if (!bonusPlayedRef.current && running >= FM_BONUS_THRESHOLD) {
        bonusPlayedRef.current = true;
        setTimeout(() => playSurveyCue("bonus"), 280);
      }
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
      playSurveyCue("results");
      announce("That's the hive!");
      setPhase("results");
    } catch {
      playSurveyCue("results");
      announce("That's the hive!");
      setPhase("results");
    }
  }

  function skipLeaderboard() {
    playSurveyCue("results");
    announce("That's the hive!");
    setPhase("results");
  }

  function continueFromFmLocked() {
    setPhase("leaderboard-submit");
  }

  function backToTitle() {
    stopBedMusic();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setPhase("title");
    setActiveId(null);
    setRevealed([]);
    setGuess("");
    endingRef.current = false;
  }

  function toggleSound() {
    unlockSurveyAudio();
    const next = !soundMuted;
    setSoundMuted(next);
    setSurveyMuted(next);
    if (!next) {
      playSurveyCue("hit");
      if (phase !== "title") startBedMusic();
    } else {
      stopBedMusic();
    }
  }

  /* ─── Derived ───────────────────────────────────────────────────── */

  const revealedByRank = new Map(revealed.map((a) => [a.rank, a]));
  const canPlay = boards.length >= MAIN_ROUNDS;
  const fmRunningTotal = fmAnswers.slice(0, fmRevealIndex + 1).reduce((s, a) => s + a.points, 0);
  const swarmRushCount = fmIds.length;

  /* ─── Render ────────────────────────────────────────────────────── */

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-2xl">
        <Nav />
        <header className="mb-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs tracking-widest uppercase" style={{ color: CORAL }}>
                larv.ai field guide
              </p>
              <h1 className="mt-1 text-4xl font-bold tracking-tight">Larvae Survey Game</h1>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!soundMuted}
              onClick={toggleSound}
              className="flex shrink-0 items-center gap-2 rounded-md border px-3 py-2"
              style={{ borderColor: `${INK}22`, background: CARD }}
            >
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-55">
                Sound
              </span>
              <span
                className="relative h-5 w-9 rounded-full transition-colors"
                style={{ background: soundMuted ? `${INK}22` : GREEN }}
              >
                <span
                  className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all"
                  style={{ left: soundMuted ? 2 : 18 }}
                />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: soundMuted ? `${INK}66` : GREEN }}>
                {soundMuted ? "Off" : "On"}
              </span>
            </button>
          </div>
          {phase === "title" && (
            <p className="mt-2 max-w-xl text-sm opacity-75">
              We surveyed the hive. Guess what they said. Three strikes ends the round.
              Score {FM_UNLOCK}+ across three rounds to unlock Swarm Rush — up to five lightning
              questions. Hit 100+ in Swarm Rush for a 500-point bonus.
            </p>
          )}
        </header>

        {/* ════════════════ TITLE ════════════════ */}
        {phase === "title" && (
          <>
            <section
              className="rounded-xl border p-6"
              style={{ borderColor: `${INK}22`, background: CARD }}
            >
              {loading ? (
                <p className="text-sm opacity-60">loading…</p>
              ) : (
                <>
                  <div className="mb-5 space-y-2 font-mono text-[10px] uppercase tracking-widest opacity-55">
                    <p>{MAIN_ROUNDS} survey rounds · {ANSWER_TIMER}s per guess · 3 strikes</p>
                    <p>
                      Swarm Rush unlock · {FM_UNLOCK}+ · up to {FM_QUESTIONS} Q · {FM_TIMER}s each
                    </p>
                    <p>{boards.length} boards ready</p>
                    {(brewing || boards.length < MAIN_ROUNDS + FM_QUESTIONS) && (
                      <p className="normal-case tracking-normal opacity-80">
                        {boards.length < MAIN_ROUNDS
                          ? "Hive is brewing boards — Play unlocks at 3. Leave this page open."
                          : "Brewing more boards in the background for a fuller Swarm Rush."}
                      </p>
                    )}
                  </div>
                  {error && <p className="mb-3 text-sm" style={{ color: CORAL }}>{error}</p>}
                  {!canPlay && (
                    <p className="mb-3 text-sm opacity-60">
                      Need {MAIN_ROUNDS} boards to play (have {boards.length}).
                    </p>
                  )}
                  <button
                    onClick={startGame}
                    disabled={checking || !canPlay}
                    className="w-full rounded-lg px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                    style={{ background: CORAL }}
                  >
                    {checking ? "…" : canPlay ? "Play" : brewing ? "Brewing…" : "Play"}
                  </button>
                </>
              )}
            </section>

            {/* Leaderboard on title screen */}
            {leaderboard.length > 0 && (
              <section
                className="mt-5 rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: CARD }}
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
                background: CARD,
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
                      background: answer ? CARD : `${INK}08`,
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
                        <div className="min-w-0 flex-1">
                          <span className="font-bold tracking-wide">{answer.label}</span>
                          {answer.rationale && (
                            <p className="mt-0.5 text-xs leading-snug opacity-55">{answer.rationale}</p>
                          )}
                        </div>
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

        {/* ════════════════ ROUND REVEAL (one-by-one like Family Feud) ════════════════ */}
        {phase === "reveal" && (
          <>
            <section
              className="mb-5 rounded-xl border p-5"
              style={{ borderColor: `${INK}22`, background: CARD }}
            >
              <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                Round {roundIndex + 1} — hive says
              </p>
              <p className="mt-1 text-xl font-bold">{question}</p>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">round</p>
                  <p className="text-2xl font-bold" style={{ color: GOLD }}>+{roundScore}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">total</p>
                  <p className="text-2xl font-bold">{sessionScore}</p>
                </div>
              </div>
            </section>

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
                      background: answer ? CARD : `${INK}08`,
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
                        <div className="min-w-0 flex-1">
                          <span className="font-bold tracking-wide">{answer.label}</span>
                          {answer.rationale && (
                            <p className="mt-0.5 text-xs leading-snug opacity-55">{answer.rationale}</p>
                          )}
                        </div>
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

            {pendingReveal.length === 0 && boardAnswers.length > 0 && (
              <div className="mb-5 space-y-3 rounded-xl border p-4" style={{ borderColor: `${INK}15`, background: CARD }}>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">voices</p>
                {boardAnswers
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
                      {a.rationale && <p className="text-xs opacity-60">{a.rationale}</p>}
                      <p className="text-xs opacity-45">{a.voices.join(" · ")}</p>
                    </div>
                  ))}
              </div>
            )}

            {pendingReveal.length > 0 ? (
              <button
                onClick={stepBoardReveal}
                className="w-full rounded-lg px-5 py-3 text-sm font-semibold text-white"
                style={{ background: GOLD }}
              >
                Reveal #{pendingReveal[0]}
              </button>
            ) : (
              <button
                onClick={advanceAfterReveal}
                disabled={checking}
                className="w-full rounded-lg px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: CORAL }}
              >
                {checking
                  ? "…"
                  : roundIndex + 1 < MAIN_ROUNDS
                    ? `Next: Round ${roundIndex + 2}`
                    : sessionScore >= FM_UNLOCK && swarmRushCount > 0
                      ? "Swarm Rush →"
                      : "Continue →"}
              </button>
            )}
          </>
        )}

        {/* ════════════════ SWARM RUSH LOCKED ════════════════ */}
        {phase === "fm-locked" && (
          <section className="rounded-xl border p-6" style={{ borderColor: `${INK}22`, background: CARD }}>
            <p className="font-mono text-xs uppercase tracking-widest opacity-60">swarm rush locked</p>
            <p className="mt-1 text-4xl font-bold" style={{ color: CORAL }}>{sessionScore}</p>
            <p className="mt-2 text-sm opacity-75">
              {sessionScore < FM_UNLOCK ? (
                <>
                  You needed <strong style={{ color: GOLD }}>{FM_UNLOCK}</strong> from the three survey
                  rounds to unlock Swarm Rush. So close — or not. Either way, the hive remembers.
                </>
              ) : (
                <>
                  You scored enough, but there weren’t enough leftover boards for Swarm Rush.
                  The hive is still brewing — try again in a bit.
                </>
              )}
            </p>
            <button
              onClick={continueFromFmLocked}
              className="mt-5 w-full rounded-lg px-5 py-3 text-sm font-semibold text-white"
              style={{ background: CORAL }}
            >
              Continue to results →
            </button>
          </section>
        )}

        {/* ════════════════ SWARM RUSH ════════════════ */}
        {phase === "fastmoney" && activeId && (
          <>
            <section
              className="mb-5 rounded-xl border p-5"
              style={{
                borderColor: `${GOLD}44`,
                borderWidth: 2,
                background: CARD,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                    ⚡ Swarm Rush · {fmIndex + 1} of {swarmRushCount}
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
          <section className="rounded-xl border p-5" style={{ borderColor: `${GOLD}44`, borderWidth: 2, background: CARD }}>
            <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
              ⚡ Swarm Rush — reveal
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
                      background: isRevealed ? CARD : `${INK}05`,
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
          <section className="rounded-xl border p-6" style={{ borderColor: `${INK}22`, background: CARD }}>
            <p className="font-mono text-xs uppercase tracking-widest opacity-60">game over</p>
            <p className="mt-1 text-4xl font-bold" style={{ color: GOLD }}>{grandTotal}</p>
            <div className="mt-3 space-y-1 font-mono text-xs uppercase tracking-widest opacity-60">
              <p>Survey rounds · {sessionScore}</p>
              <p>Swarm Rush · {fmScore}</p>
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
          <section className="rounded-xl border p-6" style={{ borderColor: `${INK}22`, background: CARD }}>
            <p className="font-mono text-xs uppercase tracking-widest opacity-60">final score</p>
            <p className="mt-1 text-4xl font-bold" style={{ color: GOLD }}>{grandTotal}</p>
            {submittedRank && (
              <p className="mt-1 text-sm font-semibold" style={{ color: GREEN }}>
                #{submittedRank} on the leaderboard
              </p>
            )}
            <div className="mt-3 space-y-1 font-mono text-xs uppercase tracking-widest opacity-60">
              <p>Survey rounds · {sessionScore}</p>
              <p>Swarm Rush · {fmScore}</p>
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
