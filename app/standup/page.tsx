"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";
import { speakStandup, unlockSurveyAudio } from "@/lib/survey-sfx";

type CrowdReview = {
  wallet: string;
  name: string;
  tone: string;
  score: number;
  reaction: string;
};

type StandupSet = {
  id: string;
  wallet: string;
  name: string;
  tone: string;
  voiceId: string;
  voiceLabel: string;
  bit: string;
  material: string[];
  reviews?: CrowdReview[];
  scoreSum: number;
  scoreCount: number;
  performedAt: string;
  avg?: number | null;
};

const BIT_SECONDS = 90;

export default function StandupPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD } = colors;

  const [set, setSet] = useState<StandupSet | null>(null);
  const [history, setHistory] = useState<StandupSet[]>([]);
  const [loading, setLoading] = useState(false);
  const [jurying, setJurying] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "live" | "encore">("idle");
  const [left, setLeft] = useState(BIT_SECONDS);

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

  const runJury = useCallback(async (id: string) => {
    setJurying(true);
    setError("");
    try {
      const res = await fetch("/api/larvae/standup", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "crowd went silent");
        return;
      }
      setSet({ ...d.set, avg: d.avg });
      void loadHistory();
    } catch {
      setError("network error getting the room’s take");
    } finally {
      setJurying(false);
    }
  }, [loadHistory]);

  // 90s performance clock → then larva jury
  useEffect(() => {
    if (phase !== "live") return;
    if (left <= 0) {
      setPhase("encore");
      return;
    }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left]);

  useEffect(() => {
    if (phase !== "encore" || !set?.id) return;
    if (set.reviews && set.reviews.length > 0) return;
    if (jurying) return;
    void runJury(set.id);
  }, [phase, set, jurying, runJury]);

  async function bookAct() {
    setLoading(true);
    setError("");
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
    // Full bit via Gemini TTS (not ElevenLabs).
    speakStandup(set.bit);
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
            One random larva, ninety seconds of Seinfeld-adjacent observational comedy — then{" "}
            <strong>five other larvae</strong> score how funny it was, in character.
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
                  now on stage · {set.tone} · Gemini voice
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
                  {jurying ? "crowd conferring…" : "set complete"}
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
                Play full bit (TTS)
              </button>
              {phase === "live" && (
                <button
                  type="button"
                  onClick={() => setPhase("encore")}
                  className="rounded-lg border px-4 py-2 text-sm opacity-70"
                  style={{ borderColor: `${INK}30` }}
                >
                  Cut to crowd reaction
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
                  larva jury · comedy only
                </p>
                {jurying && (
                  <p className="mt-2 text-sm opacity-70">
                    Five larvae scoring punchlines — not whether they agree with the bit…
                  </p>
                )}
                {set.avg != null && (
                  <p className="mt-2 text-lg font-bold" style={{ color: GOLD }}>
                    Room avg {set.avg}/10
                    <span className="ml-2 text-sm font-normal opacity-50">
                      ({set.scoreCount} larvae · funny meter)
                    </span>
                  </p>
                )}
                <div className="mt-4 space-y-3">
                  {(set.reviews || []).map((r) => (
                    <div
                      key={r.wallet}
                      className="rounded-lg border px-3 py-2"
                      style={{ borderColor: `${INK}15` }}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold">
                          {r.name}{" "}
                          <span className="font-mono text-[10px] font-normal uppercase tracking-widest opacity-45">
                            {r.tone} voice
                          </span>
                        </p>
                        <p className="font-mono text-sm font-bold" style={{ color: CORAL }}>
                          {r.score}/10 funny
                        </p>
                      </div>
                      <p className="mt-1 text-sm opacity-80">“{r.reaction}”</p>
                    </div>
                  ))}
                </div>
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
                    if (!h.reviews?.length) void runJury(h.id);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm"
                  style={{ borderColor: `${INK}18`, background: CARD }}
                >
                  <span>
                    <strong>{h.name}</strong>
                    <span className="opacity-50"> · {h.tone}</span>
                  </span>
                  <span className="font-mono text-xs opacity-60">
                    {h.avg != null ? `${h.avg}/10` : "pending jury"} · {h.scoreCount}v
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
