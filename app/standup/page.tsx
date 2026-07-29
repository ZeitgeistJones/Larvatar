"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LarvaAvatar from "@/components/LarvaAvatar";
import JudgeDesk from "@/components/JudgeDesk";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";
import type { LarvatarTraits } from "@/lib/avatar";
import {
  playTtsClip,
  prefetchGeminiClips,
  revokeTtsClips,
  speakStandup,
  unlockSurveyAudio,
  type PrefetchedTtsClip,
} from "@/lib/survey-sfx";
import { geminiVoiceForWallet, geminiVoicesForWallets } from "@/lib/gemini-voices";

type CrowdReview = {
  wallet: string;
  name: string;
  tone: string;
  score: number;
  reaction: string;
};

type Specimen = {
  wallet: string;
  profile: { name: string; tone: string; quirks: string[] };
  avatar: LarvatarTraits;
  moral?: { label: string; lawChaos: number; goodEvil: number } | null;
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

function walletHue(wallet: string): number {
  let h = 0;
  for (const c of wallet.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export default function StandupPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD } = colors;

  const [set, setSet] = useState<StandupSet | null>(null);
  const [history, setHistory] = useState<StandupSet[]>([]);
  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [loading, setLoading] = useState(false);
  const [jurying, setJurying] = useState(false);
  const [cueing, setCueing] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"idle" | "live" | "encore">("idle");
  const [left, setLeft] = useState(BIT_SECONDS);
  const [juryVisible, setJuryVisible] = useState(0);
  const [jurySpeaking, setJurySpeaking] = useState(false);
  const [talkingWallet, setTalkingWallet] = useState<string | null>(null);
  const [bitTalking, setBitTalking] = useState(false);
  const juryPlayGen = useRef(0);
  const autoHeardId = useRef<string | null>(null);
  const clipBag = useRef<(PrefetchedTtsClip | null)[]>([]);

  const byWallet = useMemo(() => {
    const m = new Map<string, Specimen>();
    for (const s of specimens) m.set(s.wallet.toLowerCase(), s);
    return m;
  }, [specimens]);

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
    fetch("/api/larvae")
      .then((r) => r.json())
      .then((d) => setSpecimens((d.larvae || []) as Specimen[]))
      .catch(() => {});
  }, [loadHistory]);

  useEffect(() => {
    return () => {
      revokeTtsClips(clipBag.current);
      clipBag.current = [];
    };
  }, []);

  const playJury = useCallback(async (reviews: CrowdReview[], setId: string) => {
    if (!reviews.length) return;
    const gen = ++juryPlayGen.current;
    setJuryVisible(0);
    setTalkingWallet(null);
    setCueing(true);
    unlockSurveyAudio();
    const voices = geminiVoicesForWallets(reviews.map((r) => r.wallet));

    const jobs = reviews.map((r) => ({
      text: `${r.name} gives it a ${r.score} out of 10. ${r.reaction}`,
      geminiVoice: voices.get(r.wallet.toLowerCase()) || geminiVoiceForWallet(r.wallet),
      style: "take" as const,
    }));

    revokeTtsClips(clipBag.current);
    const clips = await prefetchGeminiClips(jobs);
    clipBag.current = clips;
    if (juryPlayGen.current !== gen) return;
    setCueing(false);
    setJurySpeaking(true);

    for (let i = 0; i < reviews.length; i++) {
      if (juryPlayGen.current !== gen) return;
      setJuryVisible(i + 1);
      setTalkingWallet(reviews[i].wallet.toLowerCase());
      await playTtsClip(clips[i]);
      if (juryPlayGen.current !== gen) return;
      await new Promise((res) => setTimeout(res, 80));
    }

    if (juryPlayGen.current === gen) {
      setTalkingWallet(null);
      setJurySpeaking(false);
      setJuryVisible(reviews.length);
      autoHeardId.current = setId;
    }
  }, []);

  const runJury = useCallback(
    async (id: string) => {
      setJurying(true);
      setError("");
      setJuryVisible(0);
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
        const next = { ...d.set, avg: d.avg } as StandupSet;
        setSet(next);
        void loadHistory();
      } catch {
        setError("network error getting the room’s take");
      } finally {
        setJurying(false);
      }
    },
    [loadHistory]
  );

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
    if (!set.reviews?.length) {
      if (!jurying) void runJury(set.id);
      return;
    }
    if (autoHeardId.current === set.id || jurySpeaking || cueing) return;
    void playJury(set.reviews, set.id);
  }, [phase, set, jurying, runJury, playJury, jurySpeaking, cueing]);

  async function bookAct() {
    juryPlayGen.current += 1;
    setJurySpeaking(false);
    setCueing(false);
    setJuryVisible(0);
    setTalkingWallet(null);
    setBitTalking(false);
    autoHeardId.current = null;
    revokeTtsClips(clipBag.current);
    clipBag.current = [];
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
    setBitTalking(true);
    speakStandup(set.bit);
    // Approximate bounce duration from word count (~2.5 wps)
    const words = set.bit.trim().split(/\s+/).length;
    const ms = Math.min(90000, Math.max(4000, (words / 2.4) * 1000));
    window.setTimeout(() => setBitTalking(false), ms);
  }

  const wordCount = useMemo(
    () => (set ? set.bit.trim().split(/\s+/).length : 0),
    [set]
  );

  const juryVoices = useMemo(
    () => geminiVoicesForWallets((set?.reviews || []).map((r) => r.wallet)),
    [set?.reviews]
  );

  const comic = set ? byWallet.get(set.wallet.toLowerCase()) : null;

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
            One random larva on stage — then five judges at cute little desks score the bit, each with
            their own Gemini voice.
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
              <div className="flex items-center gap-3">
                <LarvaAvatar
                  hue={comic?.avatar.hue ?? walletHue(set.wallet)}
                  tone={comic?.profile.tone || set.tone}
                  wallet={set.wallet}
                  traits={comic?.avatar}
                  moral={comic?.moral}
                  quirks={comic?.profile.quirks}
                  size={64}
                  label={set.name}
                  talking={bitTalking}
                />
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                    now on stage · {set.tone} · Gemini · {geminiVoiceForWallet(set.wallet)}
                  </p>
                  <h2 className="text-2xl font-bold">{set.name}</h2>
                </div>
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
                  {jurying
                    ? "crowd conferring…"
                    : cueing
                      ? "cueing jury voices…"
                      : jurySpeaking
                        ? "jury speaking…"
                        : "set complete"}
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
              {phase === "encore" && (set.reviews?.length || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    autoHeardId.current = null;
                    void playJury(set.reviews || [], set.id);
                  }}
                  disabled={jurySpeaking || cueing}
                  className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
                  style={{ borderColor: `${INK}30` }}
                >
                  {cueing
                    ? "Cueing voices…"
                    : jurySpeaking
                      ? "Jury speaking…"
                      : "Play jury (TTS)"}
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
                  larva jury · comedy only · judge desks
                </p>
                {jurying && (
                  <p className="mt-2 text-sm opacity-70">
                    Five larvae scoring punchlines — not whether they agree with the bit…
                  </p>
                )}
                {cueing && (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-widest opacity-45">
                    Loading jury audio…
                  </p>
                )}
                {set.avg != null && juryVisible > 0 && (
                  <p className="mt-2 text-lg font-bold" style={{ color: GOLD }}>
                    Room avg {set.avg}/10
                    <span className="ml-2 text-sm font-normal opacity-50">
                      ({set.scoreCount} larvae · funny meter)
                    </span>
                  </p>
                )}
                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  {(set.reviews || []).slice(0, Math.max(juryVisible, 0)).map((r) => {
                    const live = talkingWallet === r.wallet.toLowerCase();
                    const spec = byWallet.get(r.wallet.toLowerCase());
                    const v = juryVoices.get(r.wallet.toLowerCase());
                    return (
                      <JudgeDesk
                        key={r.wallet}
                        name={r.name}
                        subtitle={`${r.score}/10${v ? ` · ${v}` : ""}${live ? " · live" : ""}`}
                        talking={live}
                        ink={INK}
                        gold={GOLD}
                        avatar={
                          <LarvaAvatar
                            hue={spec?.avatar.hue ?? walletHue(r.wallet)}
                            tone={spec?.profile.tone || r.tone}
                            wallet={r.wallet}
                            traits={spec?.avatar}
                            moral={spec?.moral}
                            quirks={spec?.profile.quirks}
                            size={52}
                            label={r.name}
                            talking={live}
                          />
                        }
                      >
                        <span className="italic">“{r.reaction}”</span>
                      </JudgeDesk>
                    );
                  })}
                </div>
                {jurySpeaking && juryVisible < (set.reviews?.length || 0) && (
                  <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest opacity-40">
                    next judge…
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    juryPlayGen.current += 1;
                    setJurySpeaking(false);
                    setCueing(false);
                    setTalkingWallet(null);
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
                    juryPlayGen.current += 1;
                    setJurySpeaking(false);
                    setCueing(false);
                    setTalkingWallet(null);
                    setSet(h);
                    setPhase("encore");
                    setLeft(0);
                    setJuryVisible(h.reviews?.length || 0);
                    autoHeardId.current = h.id;
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
