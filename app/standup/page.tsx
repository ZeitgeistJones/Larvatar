"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";
import { speakLarva, unlockSurveyAudio } from "@/lib/survey-sfx";

type StandupSet = {
  id: string;
  wallet: string;
  name: string;
  tone: string;
  voiceId: string;
  voiceLabel: string;
  bit: string;
  material: string[];
  scoreSum: number;
  scoreCount: number;
  performedAt: string;
  avg?: number | null;
};

const BIT_SECONDS = 90;

function voterId(): string {
  if (typeof window === "undefined") return "anon";
  const key = "larvae-standup-voter";
  let id = localStorage.getItem(key);
  if (!id) {
    id = `v_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

export default function StandupPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD } = colors;

  const [set, setSet] = useState<StandupSet | null>(null);
  const [history, setHistory] = useState<StandupSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "live" | "encore">("idle");
  const [left, setLeft] = useState(BIT_SECONDS);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [rated, setRated] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const d = await fetch("/api/larvae/standup").then((r) => r.json());
      setHistory(d.sets || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // 90s performance clock
  useEffect(() => {
    if (phase !== "live") return;
    if (left <= 0) {
      setPhase("encore");
      return;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left]);

  async function bookAct() {
    setLoading(true);
    setError("");
    setMyScore(null);
    setRated(false);
    try {
      const res = await fetch("/api/larvae/standup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ random: true }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "couldn’t book the room");
        return;
      }
      setSet(d.set);
      setLeft(BIT_SECONDS);
      setPhase("live");
      void loadHistory();
    } catch {
      setError("network error");
    } finally {
      setLoading(false);
    }
  }

  function playBit() {
    if (!set) return;
    unlockSurveyAudio();
    // Speak first ~500 chars for free-tier hygiene; full bit is on screen.
    const spoken = set.bit.slice(0, 500);
    speakLarva(spoken, set.voiceId);
  }

  async function submitScore(score: number) {
    if (!set || rated) return;
    setMyScore(score);
    try {
      const res = await fetch("/api/larvae/standup", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: set.id, score, voterId: voterId() }),
      });
      const d = await res.json();
      if (res.ok && d.set) {
        setSet({ ...d.set, avg: d.avg });
        setRated(true);
        void loadHistory();
      }
    } catch {
      /* ignore */
    }
  }

  const wordCount = useMemo(
    () => (set ? set.bit.trim().split(/\s+/).length : 0),
    [set]
  );

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-3xl">
        <div
          className="sticky top-0 z-40 -mx-4 mb-2 px-4 pb-2 pt-1"
          style={{ background: SHEET }}
        >
          <Nav />
        </div>

        <header className="mb-8 text-center">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            open mic · hive basement
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight max-md:text-3xl">
            Stand-Up Night
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-sm opacity-75">
            One random larva, ninety seconds, Seinfeld-adjacent observational comedy — in
            character, riffing on real gov & forum bits. You are the audience.
          </p>
        </header>

        {error && (
          <p className="mb-4 text-center text-sm" style={{ color: CORAL }}>
            {error}
          </p>
        )}

        {phase === "idle" && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => void bookAct()}
              disabled={loading}
              className="rounded-xl px-8 py-4 text-lg font-bold text-white disabled:opacity-40"
              style={{ background: CORAL }}
            >
              {loading ? "booking a comic…" : "Next comic up"}
            </button>
          </div>
        )}

        {set && phase !== "idle" && (
          <section
            className="rounded-2xl border p-6 max-md:p-4"
            style={{ borderColor: `${INK}22`, background: CARD }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                  now on stage · {set.tone} · voice {set.voiceLabel}
                </p>
                <h2 className="text-2xl font-bold">{set.name}</h2>
              </div>
              {phase === "live" ? (
                <p
                  className="font-mono text-2xl font-bold tabular-nums"
                  style={{ color: left <= 15 ? CORAL : GOLD }}
                >
                  {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
                </p>
              ) : (
                <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                  set complete
                </p>
              )}
            </div>

            <p className="mt-5 text-base leading-relaxed md:text-lg">{set.bit}</p>
            <p className="mt-3 font-mono text-[10px] opacity-40">
              ~{wordCount} words · aim ~90s
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={playBit}
                className="rounded-lg border px-4 py-2 text-sm"
                style={{ borderColor: `${INK}30` }}
              >
                Play opener (TTS)
              </button>
              {phase === "live" && (
                <button
                  type="button"
                  onClick={() => setPhase("encore")}
                  className="rounded-lg border px-4 py-2 text-sm opacity-70"
                  style={{ borderColor: `${INK}30` }}
                >
                  Skip to rating
                </button>
              )}
            </div>

            {set.material.length > 0 && (
              <details className="mt-5 text-xs opacity-55">
                <summary className="cursor-pointer font-mono uppercase tracking-widest">
                  Material (gov / forum hooks)
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {set.material.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </details>
            )}

            {phase === "encore" && (
              <div className="mt-8 border-t pt-6" style={{ borderColor: `${INK}15` }}>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                  audience score
                </p>
                <p className="mt-1 text-sm opacity-80">How funny was that? (1 = meh · 10 = dying)</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={rated}
                      onClick={() => void submitScore(n)}
                      className="h-10 w-10 rounded-lg border text-sm font-semibold disabled:opacity-50"
                      style={{
                        borderColor: myScore === n ? CORAL : `${INK}25`,
                        background: myScore === n ? `${CORAL}22` : "transparent",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                {rated && (
                  <p className="mt-3 text-sm">
                    You gave {myScore}/10
                    {set.avg != null && (
                      <>
                        {" "}
                        · room avg <strong>{set.avg}</strong> ({set.scoreCount} votes)
                      </>
                    )}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPhase("idle");
                    setSet(null);
                  }}
                  className="mt-5 rounded-lg px-5 py-2.5 text-sm font-semibold text-white"
                  style={{ background: CORAL }}
                >
                  Next comic
                </button>
              </div>
            )}
          </section>
        )}

        {history.length > 0 && (
          <section className="mt-12">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest opacity-50">
              recent sets
            </p>
            <div className="space-y-2">
              {history.slice(0, 12).map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => {
                    setSet(h);
                    setPhase("encore");
                    setLeft(0);
                    setRated(false);
                    setMyScore(null);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm"
                  style={{ borderColor: `${INK}18`, background: CARD }}
                >
                  <span>
                    <strong>{h.name}</strong>
                    <span className="opacity-50"> · {h.tone}</span>
                  </span>
                  <span className="font-mono text-xs opacity-60">
                    {h.avg != null ? `${h.avg}/10` : "unrated"} · {h.scoreCount}v
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
