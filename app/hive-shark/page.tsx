"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";
import {
  playSurveyCue,
  unlockSurveyAudio,
  getSurveyMuted,
  setSurveyMuted,
} from "@/lib/survey-sfx";

type PublicMatch = {
  id: string;
  opponent: { wallet: string; name: string; tone: string };
  phase: string;
  surveyIndex: number;
  surveysTarget: number;
  rowsCleared: { human: number; larva: number };
  control: "human" | "larva" | null;
  guesser: "human" | "larva";
  survey: {
    question: string;
    label: string;
    guess: number | null;
    call: "over" | "under" | null;
    larvaJab: string;
    trueN: number | null;
    revealed: boolean;
  } | null;
  crypto: {
    isFinal: boolean;
    step: number;
    targetSteps: number;
    faceUp: {
      id: string;
      symbol: string;
      name: string;
      marketCapLabel: string;
      rank: number;
    } | null;
    next: { id: string; symbol: string; name: string } | null;
    controller: "human" | "larva" | null;
  } | null;
  lastJab: string;
  winner: "human" | "larva" | null;
};

type Specimen = {
  wallet: string;
  profile: { name: string; tone: string };
};

export default function HiveSharkPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, sea: SEA } = colors;

  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [filter, setFilter] = useState("");
  const [pick, setPick] = useState("");
  const [match, setMatch] = useState<PublicMatch | null>(null);
  const [guessInput, setGuessInput] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);
  const [muted, setMuted] = useState(false);
  const [capLeft, setCapLeft] = useState(5);
  const capTickRef = useRef(false);

  useEffect(() => {
    setMuted(getSurveyMuted());
    fetch("/api/larvae")
      .then((r) => r.json())
      .then((d) => setSpecimens((d.larvae || []) as Specimen[]))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return specimens.slice(0, 80);
    return specimens
      .filter(
        (s) =>
          s.profile.name.toLowerCase().includes(q) ||
          s.wallet.toLowerCase().includes(q) ||
          s.profile.tone.toLowerCase().includes(q)
      )
      .slice(0, 80);
  }, [specimens, filter]);

  const armAudio = () => {
    unlockSurveyAudio();
  };

  const start = async (wallet?: string) => {
    armAudio();
    setBusy(true);
    setError("");
    setFlash(null);
    try {
      const res = await fetch("/api/larvae/card-sharks/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(wallet ? { wallet } : {}),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "start failed");
      setMatch(d.match);
      playSurveyCue("start");
    } catch (e) {
      setError(e instanceof Error ? e.message : "start failed");
    } finally {
      setBusy(false);
    }
  };

  const post = useCallback(async (url: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "request failed");
      if (d.match) setMatch(d.match);
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const onGuess = async () => {
    if (!match) return;
    armAudio();
    const d = await post("/api/larvae/card-sharks/survey/guess", {
      matchId: match.id,
      guess: Number(guessInput),
    });
    if (d) playSurveyCue("tick");
  };

  const onCall = async (call: "over" | "under") => {
    if (!match) return;
    armAudio();
    const d = await post("/api/larvae/card-sharks/survey/call", {
      matchId: match.id,
      call,
    });
    if (d) playSurveyCue("tick");
  };

  const onReveal = async () => {
    if (!match) return;
    armAudio();
    const d = await post("/api/larvae/card-sharks/survey/reveal", {
      matchId: match.id,
    });
    if (!d) return;
    playSurveyCue("reveal");
    setFlash({
      text: d.exact
        ? `Exact! ${d.trueN} — guesser keeps control.`
        : `Hive said ${d.trueN}. ${d.control === "human" ? "You" : match.opponent.name} take control.`,
      ok: true,
    });
  };

  const onCrypto = useCallback(
    async (pick?: "higher" | "lower") => {
      if (!match || busy) return;
      armAudio();
      capTickRef.current = true; // pause timer while request runs
      const d = await post("/api/larvae/card-sharks/crypto/step", {
        matchId: match.id,
        ...(pick ? { pick } : {}),
      });
      capTickRef.current = false;
      if (!d) return;
      if (d.correct) {
        playSurveyCue(d.clearedRow ? "bonus" : "hit");
        setFlash({
          text: d.clearedRow
            ? d.match.phase === "done"
              ? "Final cleared!"
              : "Row cleared!"
            : `${d.revealed.name} (${d.revealed.marketCapLabel}) — ${d.pickUsed} hits.`,
          ok: true,
        });
      } else {
        playSurveyCue(d.busted && d.match.phase === "done" ? "strikeOut" : "strike");
        setFlash({
          text: `Bust — ${d.revealed.name} is ${d.revealed.marketCapLabel}.`,
          ok: false,
        });
      }
      if (d.match.phase === "done") playSurveyCue("results");
    },
    [match, busy, post]
  );

  // 5s clock on each market-cap step
  useEffect(() => {
    const live =
      match &&
      match.crypto?.next &&
      (match.phase === "crypto" || match.phase === "final") &&
      !busy;
    if (!live) {
      setCapLeft(5);
      return;
    }
    setCapLeft(5);
    const id = window.setInterval(() => {
      if (capTickRef.current) return;
      setCapLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [
    match?.id,
    match?.phase,
    match?.crypto?.step,
    match?.crypto?.next?.id,
    busy,
  ]);

  useEffect(() => {
    if (capLeft !== 0 || busy || !match?.crypto?.next) return;
    if (match.phase !== "crypto" && match.phase !== "final") return;
    playSurveyCue("tick");
    setFlash({ text: "Time's up — forced call!", ok: false });
    if (match.crypto.controller === "human") {
      void onCrypto(Math.random() < 0.5 ? "higher" : "lower");
    } else {
      void onCrypto();
    }
  }, [capLeft, busy, match, onCrypto]);

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="page-shell">
        <Nav />

        <header className="mb-8 text-center max-md:mb-5">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            larv.ai game show
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight max-md:text-3xl">
            Hive Shark
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-sm opacity-70">
            Spicy hive polls — out of 100, how many say yes? Guess, then over/under. Winner climbs
            crypto caps (5s per call). Final is the long run. Opponent is a larva.
          </p>
        </header>

        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              setSurveyMuted(next);
            }}
            className="rounded border px-3 py-1 font-mono text-[10px] uppercase tracking-widest opacity-60"
            style={{ borderColor: `${INK}30` }}
          >
            {muted ? "Sound off" : "Sound on"}
          </button>
        </div>

        {error && (
          <p className="mb-4 text-sm" style={{ color: CORAL }}>
            {error}
          </p>
        )}

        {!match && (
          <section
            className="rounded-xl border p-5"
            style={{ borderColor: `${INK}22`, background: CARD }}
          >
            <p className="font-mono text-xs uppercase tracking-widest opacity-50">
              pick your opponent
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void start()}
                className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: CORAL }}
              >
                {busy ? "seating…" : "Random larva"}
              </button>
            </div>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search specimens…"
              className="mt-4 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: `${INK}25` }}
            />
            <div className="mt-3 max-h-56 overflow-y-auto">
              <select
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: `${INK}25`, background: SHEET }}
              >
                <option value="">Select a larva…</option>
                {filtered.map((s) => (
                  <option key={s.wallet} value={s.wallet}>
                    {s.profile.name} · {s.profile.tone}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={busy || !pick}
              onClick={() => void start(pick)}
              className="mt-3 w-full rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
              style={{ borderColor: `${INK}30` }}
            >
              Duel selected
            </button>
          </section>
        )}

        {match && (
          <div className="space-y-5">
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
              style={{ borderColor: `${INK}22`, background: CARD }}
            >
              <div>
                <p className="text-sm font-semibold">You vs {match.opponent.name}</p>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                  {match.opponent.tone} · survey {Math.min(match.surveyIndex + 1, match.surveysTarget)}/
                  {match.surveysTarget} · rows you {match.rowsCleared.human} · them{" "}
                  {match.rowsCleared.larva}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMatch(null);
                  setFlash(null);
                }}
                className="font-mono text-[10px] uppercase tracking-widest opacity-50 hover:opacity-80"
              >
                New match
              </button>
            </div>

            {match.lastJab && (
              <p className="text-center text-sm italic opacity-75">“{match.lastJab}”</p>
            )}

            {flash && (
              <p
                className="rounded-lg px-4 py-3 text-center text-sm font-medium"
                style={{
                  background: flash.ok ? `${SEA}22` : `${CORAL}18`,
                  color: INK,
                }}
              >
                {flash.text}
              </p>
            )}

            {match.phase === "done" && (
              <div
                className="rounded-xl border p-6 text-center"
                style={{ borderColor: `${GOLD}55`, background: CARD }}
              >
                <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                  match over
                </p>
                <p className="mt-2 text-2xl font-bold">
                  {match.winner === "human" ? "You win" : `${match.opponent.name} wins`}
                </p>
                <button
                  type="button"
                  onClick={() => void start(match.opponent.wallet)}
                  className="mt-4 rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
                  style={{ background: CORAL }}
                >
                  Rematch
                </button>
              </div>
            )}

            {match.survey &&
              (match.phase === "survey_guess" ||
                match.phase === "survey_call" ||
                match.phase === "ready_reveal") && (
                <section
                  className="rounded-xl border p-5"
                  style={{ borderColor: `${INK}22`, background: CARD }}
                >
                  <p className="font-mono text-xs uppercase tracking-widest opacity-50">
                    hive poll · out of 100
                  </p>
                  <p className="mt-2 text-lg font-semibold leading-snug">
                    Out of 100 larvae, how many say yes to{" "}
                    <span style={{ color: CORAL }}>{match.survey.label}</span>?
                  </p>
                  <p className="mt-1 text-sm opacity-60">{match.survey.question}</p>

                  {match.phase === "survey_guess" && match.guesser === "human" && (
                    <div className="mt-5 flex flex-wrap items-end gap-3">
                      <label className="block">
                        <span className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                          your guess
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={guessInput}
                          onChange={(e) => setGuessInput(e.target.value)}
                          className="mt-1 block w-28 rounded-lg border px-3 py-2 text-lg font-bold outline-none"
                          style={{ borderColor: `${INK}25` }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onGuess()}
                        className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                        style={{ background: CORAL }}
                      >
                        Lock guess
                      </button>
                    </div>
                  )}

                  {match.phase === "survey_call" && match.guesser === "larva" && (
                    <div className="mt-5 space-y-3">
                      <p className="text-sm">
                        <span className="font-semibold">{match.opponent.name}</span> guesses{" "}
                        <span className="text-xl font-bold">{match.survey.guess}</span>
                      </p>
                      <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                        your call
                      </p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onCall("over")}
                          className="flex-1 rounded-lg px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                          style={{ background: SEA }}
                        >
                          Over
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onCall("under")}
                          className="flex-1 rounded-lg px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                          style={{ background: CORAL }}
                        >
                          Under
                        </button>
                      </div>
                    </div>
                  )}

                  {match.phase === "ready_reveal" && (
                    <div className="mt-5 space-y-3">
                      <p className="text-sm opacity-80">
                        Guess <strong>{match.survey.guess}</strong> · call{" "}
                        <strong>{match.survey.call}</strong>
                        {match.survey.larvaJab ? (
                          <span className="italic opacity-70"> — “{match.survey.larvaJab}”</span>
                        ) : null}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onReveal()}
                        className="w-full rounded-lg px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                        style={{ background: GOLD, color: "#1a1a1a" }}
                      >
                        Reveal the hive
                      </button>
                    </div>
                  )}
                </section>
              )}

            {match.crypto && (match.phase === "crypto" || match.phase === "final") && (
              <section
                className="rounded-xl border p-5"
                style={{
                  borderColor: match.crypto.isFinal ? `${GOLD}66` : `${INK}22`,
                  background: CARD,
                }}
              >
                <p
                  className="font-mono text-xs uppercase tracking-widest"
                  style={{ color: match.crypto.isFinal ? GOLD : undefined, opacity: match.crypto.isFinal ? 1 : 0.5 }}
                >
                  {match.crypto.isFinal ? "final round" : "crypto ladder"} ·{" "}
                  {match.crypto.step}/{match.crypto.targetSteps} ·{" "}
                  {match.crypto.controller === "human" ? "your control" : `${match.opponent.name}'s control`}
                </p>

                {match.crypto.next && (
                  <p
                    className="mt-3 text-center text-3xl font-bold tabular-nums"
                    style={{ color: capLeft <= 2 ? CORAL : GOLD }}
                  >
                    {capLeft}
                    <span className="ml-2 font-mono text-xs uppercase tracking-widest opacity-50">
                      sec
                    </span>
                  </p>
                )}

                {match.crypto.faceUp && (
                  <div className="mt-4 rounded-lg border px-4 py-3" style={{ borderColor: `${INK}20` }}>
                    <p className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                      face up
                    </p>
                    <p className="text-xl font-bold">
                      {match.crypto.faceUp.name}{" "}
                      <span className="text-sm font-normal opacity-50">
                        {match.crypto.faceUp.symbol}
                      </span>
                    </p>
                    <p className="text-sm opacity-70">
                      {match.crypto.faceUp.marketCapLabel} · rank #{match.crypto.faceUp.rank}
                    </p>
                  </div>
                )}

                {match.crypto.next && (
                  <div className="mt-3 rounded-lg border px-4 py-3" style={{ borderColor: `${CORAL}44` }}>
                    <p className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                      next — no cap shown
                    </p>
                    <p className="text-xl font-bold">
                      {match.crypto.next.name}{" "}
                      <span className="text-sm font-normal opacity-50">
                        {match.crypto.next.symbol}
                      </span>
                    </p>
                  </div>
                )}

                {match.crypto.controller === "human" ? (
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      disabled={busy || !match.crypto.next}
                      onClick={() => void onCrypto("higher")}
                      className="flex-1 rounded-lg px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                      style={{ background: SEA }}
                    >
                      Higher cap
                    </button>
                    <button
                      type="button"
                      disabled={busy || !match.crypto.next}
                      onClick={() => void onCrypto("lower")}
                      className="flex-1 rounded-lg px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                      style={{ background: CORAL }}
                    >
                      Lower cap
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy || !match.crypto.next}
                    onClick={() => void onCrypto()}
                    className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
                    style={{ background: CORAL }}
                  >
                    {busy ? `${match.opponent.name} thinking…` : `Let ${match.opponent.name} play`}
                  </button>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
