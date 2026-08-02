"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import LarvaAvatar from "@/components/LarvaAvatar";
import JudgeDesk from "@/components/JudgeDesk";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";
import type { LarvatarTraits } from "@/lib/avatar";
import {
  playTtsClip,
  prefetchGeminiClips,
  revokeTtsClips,
  stopTts,
  unlockSurveyAudio,
  type PrefetchedTtsClip,
} from "@/lib/survey-sfx";
import { geminiVoicesForWallets } from "@/lib/gemini-voices";

type Specimen = {
  wallet: string;
  profile: { name: string; tone: string; quirks: string[] };
  avatar: LarvatarTraits;
  moral?: { label: string; lawChaos: number; goodEvil: number } | null;
  topRival?: { wallet: string; rate: number } | null;
};

type Turn = {
  wallet: string;
  name: string;
  tone: string;
  hue: number;
  text: string;
  label?: string;
};

type DebateResult = {
  question: string;
  a: { wallet: string; name: string };
  b: { wallet: string; name: string };
  turns: Turn[];
  jury: { wallet: string; name: string; pick: "a" | "b" | "tie"; note: string }[];
  verdict: { winner: "a" | "b" | "tie"; summary: string } | null;
};

function walletHue(wallet: string): number {
  let h = 0;
  for (const c of wallet.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export default function DebateClient() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD } = colors;
  const params = useSearchParams();

  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [loadError, setLoadError] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [question, setQuestion] = useState("");
  const [jury, setJury] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cueing, setCueing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DebateResult | null>(null);
  /** Index of turn currently on stage (−1 = none). */
  const [stageTurn, setStageTurn] = useState(-1);
  /** Text visible only after audio starts. */
  const [textOn, setTextOn] = useState(false);
  const [juryVisible, setJuryVisible] = useState(0);
  const [juryTextOn, setJuryTextOn] = useState(false);
  const [talkingWallet, setTalkingWallet] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "cueing" | "bout" | "jury" | "done">("idle");
  const playGen = useRef(0);
  const clipBuf = useRef<PrefetchedTtsClip[]>([]);

  useEffect(() => {
    fetch("/api/larvae")
      .then(async (r) => {
        if (!r.ok) throw new Error(`load failed (${r.status})`);
        return r.json();
      })
      .then((d) => {
        const list = (d.larvae || []) as Specimen[];
        setSpecimens(list);
        const qa = String(params.get("a") || "").toLowerCase();
        const qb = String(params.get("b") || "").toLowerCase();
        if (qa && list.some((s) => s.wallet.toLowerCase() === qa)) setA(qa);
        if (qb && list.some((s) => s.wallet.toLowerCase() === qb)) setB(qb);
        if (qa && !qb) {
          const host = list.find((s) => s.wallet.toLowerCase() === qa);
          const rival = host?.topRival?.wallet?.toLowerCase();
          if (rival && list.some((s) => s.wallet.toLowerCase() === rival)) setB(rival);
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "failed to load"));
  }, [params]);

  useEffect(() => {
    return () => {
      stopTts();
      revokeTtsClips(clipBuf.current);
      clipBuf.current = [];
    };
  }, []);

  const byWallet = useMemo(() => {
    const m = new Map<string, Specimen>();
    for (const s of specimens) m.set(s.wallet.toLowerCase(), s);
    return m;
  }, [specimens]);

  const sa = byWallet.get(a);
  const sb = byWallet.get(b);

  const cornerVoices = useMemo(
    () => geminiVoicesForWallets([a, b].filter(Boolean)),
    [a, b]
  );
  const voiceA = a ? cornerVoices.get(a) || "Aoede" : "Aoede";
  const voiceB = b ? cornerVoices.get(b) || "Charon" : "Charon";

  function abortPlayback() {
    playGen.current += 1;
    stopTts();
    revokeTtsClips(clipBuf.current);
    clipBuf.current = [];
    setCueing(false);
    setTalkingWallet(null);
    setTextOn(false);
    setJuryTextOn(false);
  }

  async function playTranscript(data: DebateResult) {
    const gen = ++playGen.current;
    setStageTurn(-1);
    setJuryVisible(0);
    setTextOn(false);
    setJuryTextOn(false);
    setTalkingWallet(null);
    unlockSurveyAudio();

    const voices = geminiVoicesForWallets([
      data.a.wallet,
      data.b.wallet,
      ...data.jury.map((j) => j.wallet),
    ]);

    const turnJobs = data.turns.map((turn) => ({
      text: turn.text,
      geminiVoice:
        voices.get(turn.wallet.toLowerCase()) ||
        (turn.wallet.toLowerCase() === data.a.wallet.toLowerCase() ? "Aoede" : "Charon"),
      style: "larva" as const,
    }));

    const juryJobs = data.jury.map((j) => {
      const pickName =
        j.pick === "a" ? data.a.name : j.pick === "b" ? data.b.name : "a tie";
      const line = j.note
        ? `${j.name} votes ${pickName}. ${j.note}`
        : `${j.name} votes ${pickName}.`;
      return {
        text: line,
        geminiVoice: voices.get(j.wallet.toLowerCase()) || "Kore",
        style: "take" as const,
      };
    });

    setPhase("cueing");
    setCueing(true);
    revokeTtsClips(clipBuf.current);
    const clips = await prefetchGeminiClips([...turnJobs, ...juryJobs]);
    if (playGen.current !== gen) {
      revokeTtsClips(clips);
      return;
    }
    clipBuf.current = clips;
    setCueing(false);
    setPhase("bout");

    for (let i = 0; i < data.turns.length; i++) {
      if (playGen.current !== gen) return;
      setStageTurn(i);
      setTextOn(false);
      setTalkingWallet(null);
      await new Promise((r) => setTimeout(r, 60));

      await playTtsClip(clips[i], {
        onPlaying: () => {
          if (playGen.current !== gen) return;
          setTextOn(true);
          setTalkingWallet(data.turns[i].wallet.toLowerCase());
        },
      });
      if (playGen.current !== gen) return;
      setTalkingWallet(null);
      setTextOn(false);
      await new Promise((r) => setTimeout(r, 80));
    }

    setStageTurn(-1);

    if (data.jury.length > 0 && data.verdict) {
      if (playGen.current !== gen) return;
      setPhase("jury");
      await new Promise((r) => setTimeout(r, 120));
      for (let i = 0; i < data.jury.length; i++) {
        if (playGen.current !== gen) return;
        setJuryVisible(i + 1);
        setJuryTextOn(false);
        setTalkingWallet(null);
        await playTtsClip(clips[data.turns.length + i], {
          onPlaying: () => {
            if (playGen.current !== gen) return;
            setJuryTextOn(true);
            setTalkingWallet(data.jury[i].wallet.toLowerCase());
          },
        });
        if (playGen.current !== gen) return;
        setTalkingWallet(null);
        await new Promise((r) => setTimeout(r, 70));
      }
    }

    if (playGen.current === gen) {
      setTalkingWallet(null);
      setJuryTextOn(true);
      setPhase("done");
      setJuryVisible(data.jury.length);
    }
  }

  async function runDebate() {
    setError("");
    abortPlayback();
    setResult(null);
    setStageTurn(-1);
    setJuryVisible(0);
    setPhase("idle");
    if (!a || !b || a === b) {
      setError("Pick two different larvae.");
      return;
    }
    if (!question.trim()) {
      setError("Need a debate topic.");
      return;
    }
    unlockSurveyAudio();
    setBusy(true);
    try {
      const res = await fetch("/api/larvae/debate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ a, b, question: question.trim(), jury }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `failed (${res.status})`);
      const debate = data as DebateResult;
      setResult(debate);
      setBusy(false);
      await playTranscript(debate);
    } catch (e) {
      setError(e instanceof Error ? e.message : "debate failed");
      setBusy(false);
      setCueing(false);
      setTalkingWallet(null);
      setPhase("idle");
    }
  }

  function swap() {
    setA(b);
    setB(a);
  }

  function pickRivalForA() {
    const rival = sa?.topRival?.wallet?.toLowerCase();
    if (rival && byWallet.has(rival)) setB(rival);
  }

  const live = phase === "bout" || phase === "jury" || phase === "cueing";
  const busyFloor = busy || live;
  const activeTurn = result && stageTurn >= 0 ? result.turns[stageTurn] : null;
  const sideA =
    !!activeTurn &&
    activeTurn.wallet.toLowerCase() === result!.a.wallet.toLowerCase();
  const activeSpec = activeTurn
    ? byWallet.get(activeTurn.wallet.toLowerCase())
    : null;

  const showJuryBox =
    !!result?.verdict &&
    (result.jury?.length || 0) > 0 &&
    (phase === "jury" || phase === "done");

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="page-shell">
        <Nav />

        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            games
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight max-md:text-3xl">Debate</h1>
          <p className="mt-2 max-w-xl text-sm opacity-65">
            Two larvae, two rounds each. Voices cue first, then a half-screen stage — one speaker at
            a time, text synced to their voice.
          </p>
        </header>

        {loadError ? (
          <p className="text-sm" style={{ color: CORAL }}>
            {loadError}
          </p>
        ) : (
          <section
            className="mb-8 rounded-xl border p-5"
            style={{ borderColor: `${INK}22`, background: CARD }}
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
              <label className="block text-sm">
                <span className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                  Corner A
                </span>
                <select
                  value={a}
                  onChange={(e) => setA(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: `${INK}25`, background: SHEET }}
                >
                  <option value="">Select…</option>
                  {specimens.map((s) => (
                    <option key={s.wallet} value={s.wallet.toLowerCase()}>
                      {s.profile.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={swap}
                className="rounded-lg border px-3 py-2.5 font-mono text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 max-sm:w-full"
                style={{ borderColor: `${INK}28` }}
              >
                Swap
              </button>

              <label className="block text-sm">
                <span className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                  Corner B
                </span>
                <select
                  value={b}
                  onChange={(e) => setB(e.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
                  style={{ borderColor: `${INK}25`, background: SHEET }}
                >
                  <option value="">Select…</option>
                  {specimens.map((s) => (
                    <option key={s.wallet} value={s.wallet.toLowerCase()}>
                      {s.profile.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {sa?.topRival && (
              <button
                type="button"
                onClick={pickRivalForA}
                className="mt-3 font-mono text-[10px] uppercase tracking-widest opacity-55 hover:opacity-100"
                style={{ color: CORAL }}
              >
                Use {sa.profile.name}&apos;s usual rival →
              </button>
            )}

            {!live && (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {sa && (
                  <div className="flex items-center gap-2">
                    <LarvaAvatar
                      hue={sa.avatar.hue}
                      tone={sa.profile.tone}
                      wallet={sa.wallet}
                      traits={sa.avatar}
                      moral={sa.moral}
                      quirks={sa.profile.quirks}
                      size={48}
                      label={sa.profile.name}
                      talking={false}
                    />
                    <div>
                      <span className="text-sm font-semibold">{sa.profile.name}</span>
                      <p className="font-mono text-[9px] uppercase tracking-widest opacity-40">
                        voice · {voiceA}
                      </p>
                    </div>
                  </div>
                )}
                {sa && sb && <span className="font-mono text-xs opacity-40">vs</span>}
                {sb && (
                  <div className="flex items-center gap-2">
                    <LarvaAvatar
                      hue={sb.avatar.hue}
                      tone={sb.profile.tone}
                      wallet={sb.wallet}
                      traits={sb.avatar}
                      moral={sb.moral}
                      quirks={sb.profile.quirks}
                      size={48}
                      label={sb.profile.name}
                      talking={false}
                    />
                    <div>
                      <span className="text-sm font-semibold">{sb.profile.name}</span>
                      <p className="font-mono text-[9px] uppercase tracking-widest opacity-40">
                        voice · {voiceB}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <label className="mt-5 block text-sm">
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                Topic
              </span>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={200}
                placeholder="e.g. should CLAWD burn more or build more?"
                className="mt-1 w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2"
                style={{ borderColor: `${INK}25` }}
                onKeyDown={(e) => e.key === "Enter" && !busyFloor && void runDebate()}
              />
            </label>

            <label className="mt-3 flex items-center gap-2 text-xs opacity-70">
              <input
                type="checkbox"
                checked={jury}
                onChange={(e) => setJury(e.target.checked)}
              />
              Peer jury (3 random larvae at their desks)
            </label>

            <button
              type="button"
              onClick={() => void runDebate()}
              disabled={busyFloor}
              className="mt-4 w-full rounded-lg px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: CORAL }}
            >
              {busy
                ? "Writing the bout…"
                : cueing
                  ? "Cueing voices…"
                  : phase === "bout"
                    ? "Live on the floor…"
                    : phase === "jury"
                      ? "Jury speaking…"
                      : "Start debate"}
            </button>

            {error && (
              <p className="mt-3 text-sm" style={{ color: CORAL }}>
                {error}
              </p>
            )}
          </section>
        )}

        {result && (phase === "cueing" || phase === "bout" || phase === "jury" || phase === "done") && (
          <section
            className="mb-10 overflow-hidden rounded-xl border"
            style={{ borderColor: `${INK}22`, background: CARD }}
          >
            <div className="border-b px-5 py-3" style={{ borderColor: `${INK}12` }}>
              <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                {cueing ? "cueing" : phase === "bout" ? "floor" : phase === "jury" ? "jury" : "bout complete"}
              </p>
              <p className="mt-0.5 text-sm font-medium opacity-80">{result.question}</p>
            </div>

            {cueing && (
              <p className="px-5 py-8 text-center font-mono text-[10px] uppercase tracking-widest opacity-45">
                Loading audio for a snappy exchange…
              </p>
            )}

            {/* Half-screen speaker stage */}
            {phase === "bout" && activeTurn && (
              <div
                className="relative flex min-h-[50vh] items-center gap-4 px-4 py-6 max-md:flex-col max-md:min-h-[42vh]"
                style={{
                  flexDirection: sideA ? "row" : "row-reverse",
                }}
              >
                <div
                  className="flex shrink-0 flex-col items-center justify-center"
                  style={{ width: "42%", minWidth: 140 }}
                >
                  <LarvaAvatar
                    hue={activeSpec?.avatar.hue ?? activeTurn.hue ?? walletHue(activeTurn.wallet)}
                    tone={activeSpec?.profile.tone || activeTurn.tone}
                    wallet={activeTurn.wallet}
                    traits={activeSpec?.avatar}
                    moral={activeSpec?.moral}
                    quirks={activeSpec?.profile.quirks}
                    size={140}
                    label={activeTurn.name}
                    talking={talkingWallet === activeTurn.wallet.toLowerCase()}
                  />
                  <p className="mt-3 text-center text-lg font-bold">{activeTurn.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-40">
                    {sideA ? "Corner A" : "Corner B"} · {activeTurn.label || "speaks"}
                  </p>
                </div>
                <div
                  className="min-w-0 flex-1"
                  style={{
                    textAlign: sideA ? "left" : "right",
                    opacity: textOn ? 1 : 0,
                    transition: "opacity 120ms ease",
                  }}
                >
                  {textOn && (
                    <p className="text-base leading-relaxed md:text-lg md:leading-relaxed">
                      “{activeTurn.text}”
                    </p>
                  )}
                </div>
              </div>
            )}

            {phase === "done" && (
              <div className="space-y-3 px-5 py-5">
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                  full transcript
                </p>
                {result.turns.map((t, i) => {
                  const side =
                    t.wallet.toLowerCase() === result.a.wallet.toLowerCase() ? "A" : "B";
                  return (
                    <div key={`${t.wallet}-${i}`} className="text-sm">
                      <p className="font-semibold">
                        {t.name}{" "}
                        <span className="font-mono text-[10px] font-normal uppercase tracking-widest opacity-40">
                          {side} · {t.label || "says"}
                        </span>
                      </p>
                      <p className="mt-0.5 opacity-80">{t.text}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {showJuryBox && result.verdict && (
              <div
                className="border-t px-4 py-4"
                style={{ borderColor: `${GOLD}40`, background: `${GOLD}10` }}
              >
                <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: GOLD }}>
                  jury bench
                </p>
                {phase === "done" && (
                  <p className="mt-1 text-sm font-semibold">{result.verdict.summary}</p>
                )}

                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  {result.jury.slice(0, Math.max(juryVisible, 0)).map((j, i) => {
                    const liveJudge =
                      talkingWallet === j.wallet.toLowerCase() &&
                      (phase === "jury" || phase === "done");
                    const showNote =
                      phase === "done" ||
                      (juryTextOn && i === juryVisible - 1) ||
                      i < juryVisible - 1;
                    const spec = byWallet.get(j.wallet.toLowerCase());
                    const voices = geminiVoicesForWallets([
                      result.a.wallet,
                      result.b.wallet,
                      ...result.jury.map((x) => x.wallet),
                    ]);
                    const v = voices.get(j.wallet.toLowerCase());
                    return (
                      <JudgeDesk
                        key={j.wallet}
                        name={j.name}
                        subtitle={
                          v
                            ? `${v}${liveJudge ? " · live" : ""}`
                            : liveJudge
                              ? "speaking"
                              : undefined
                        }
                        talking={liveJudge}
                        ink={INK}
                        gold={GOLD}
                        avatar={
                          <LarvaAvatar
                            hue={spec?.avatar.hue ?? walletHue(j.wallet)}
                            tone={spec?.profile.tone || "earnest"}
                            wallet={j.wallet}
                            traits={spec?.avatar}
                            moral={spec?.moral}
                            quirks={spec?.profile.quirks}
                            size={52}
                            label={j.name}
                            talking={liveJudge}
                          />
                        }
                      >
                        {showNote ? (
                          <>
                            <span>
                              →{" "}
                              {j.pick === "a"
                                ? result.a.name
                                : j.pick === "b"
                                  ? result.b.name
                                  : "tie"}
                            </span>
                            {j.note ? (
                              <span className="mt-1 block opacity-90">“{j.note}”</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="opacity-40">…</span>
                        )}
                      </JudgeDesk>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="border-t px-5 py-3 text-xs opacity-50" style={{ borderColor: `${INK}12` }}>
              <Link href="/larvae" className="underline-offset-2 hover:underline">
                Back to specimens
              </Link>
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
