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

const FALLBACK_LABELS = ["opens", "responds", "closes", "closes"];

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
  const [visibleCount, setVisibleCount] = useState(0);
  const [juryVisible, setJuryVisible] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [talkingWallet, setTalkingWallet] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "cueing" | "bout" | "jury" | "done">("idle");
  const playGen = useRef(0);
  const clipBag = useRef<(PrefetchedTtsClip | null)[]>([]);

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
      revokeTtsClips(clipBag.current);
      clipBag.current = [];
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

  async function playTranscript(data: DebateResult) {
    const gen = ++playGen.current;
    setVisibleCount(0);
    setJuryVisible(0);
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
    revokeTtsClips(clipBag.current);
    const clips = await prefetchGeminiClips([...turnJobs, ...juryJobs]);
    clipBag.current = clips;
    if (playGen.current !== gen) return;
    setCueing(false);

    setSpeaking(true);
    setPhase("bout");

    for (let i = 0; i < data.turns.length; i++) {
      if (playGen.current !== gen) return;
      setVisibleCount(i + 1);
      setTalkingWallet(data.turns[i].wallet.toLowerCase());
      await playTtsClip(clips[i]);
      if (playGen.current !== gen) return;
      await new Promise((r) => setTimeout(r, 90));
    }

    setTalkingWallet(null);

    if (data.jury.length > 0 && data.verdict) {
      if (playGen.current !== gen) return;
      setPhase("jury");
      await new Promise((r) => setTimeout(r, 180));
      for (let i = 0; i < data.jury.length; i++) {
        if (playGen.current !== gen) return;
        setJuryVisible(i + 1);
        setTalkingWallet(data.jury[i].wallet.toLowerCase());
        await playTtsClip(clips[data.turns.length + i]);
        if (playGen.current !== gen) return;
        await new Promise((r) => setTimeout(r, 80));
      }
    }

    if (playGen.current === gen) {
      setTalkingWallet(null);
      setSpeaking(false);
      setPhase("done");
      setJuryVisible(data.jury.length);
    }
  }

  async function runDebate() {
    setError("");
    playGen.current += 1;
    revokeTtsClips(clipBag.current);
    clipBag.current = [];
    setResult(null);
    setVisibleCount(0);
    setJuryVisible(0);
    setSpeaking(false);
    setCueing(false);
    setTalkingWallet(null);
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
      setSpeaking(false);
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

  const showJuryBox =
    !!result?.verdict &&
    visibleCount >= (result.turns.length || 0) &&
    (phase === "jury" || phase === "done");
  const busyFloor = busy || speaking || cueing;

  const juryShown =
    result &&
    (phase === "done"
      ? result.jury.length
      : phase === "jury"
        ? Math.max(juryVisible, 0)
        : 0);

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-3xl">
        <Nav />

        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            games
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight max-md:text-3xl">Debate</h1>
          <p className="mt-2 max-w-xl text-sm opacity-65">
            Two larvae, two rounds each — voices cue first, then a quick back-and-forth. Optional peer
            jury at their cute little desks.
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
                    talking={talkingWallet === sa.wallet.toLowerCase()}
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
                    talking={talkingWallet === sb.wallet.toLowerCase()}
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

        {result && (
          <section
            className="mb-10 rounded-xl border p-5"
            style={{ borderColor: `${INK}22`, background: CARD }}
          >
            <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">transcript</p>
            <p className="mt-1 text-sm font-medium opacity-80">{result.question}</p>
            {cueing && (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-widest opacity-45">
                Loading audio for a snappy exchange…
              </p>
            )}

            <div className="mt-5 space-y-4">
              {result.turns.slice(0, visibleCount).map((t, i) => {
                const side = t.wallet.toLowerCase() === result.a.wallet.toLowerCase() ? "A" : "B";
                const label = t.label || FALLBACK_LABELS[i] || "says";
                const live = speaking && phase === "bout" && i === visibleCount - 1;
                const spec = byWallet.get(t.wallet.toLowerCase());
                return (
                  <div
                    key={`${t.wallet}-${i}`}
                    className="flex gap-3"
                    style={{ opacity: live ? 1 : 0.92 }}
                  >
                    <div className="shrink-0">
                      <LarvaAvatar
                        hue={spec?.avatar.hue ?? t.hue ?? walletHue(t.wallet)}
                        tone={spec?.profile.tone || t.tone}
                        wallet={t.wallet}
                        traits={spec?.avatar}
                        moral={spec?.moral}
                        quirks={spec?.profile.quirks}
                        size={40}
                        label={t.name}
                        talking={talkingWallet === t.wallet.toLowerCase()}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">
                        {t.name}{" "}
                        <span className="font-mono text-[10px] font-normal uppercase tracking-widest opacity-40">
                          {side} · {label}
                          {live ? " · speaking" : ""}
                        </span>
                      </p>
                      <p className="mt-0.5 text-sm opacity-80">{t.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {showJuryBox && result.verdict && (
              <div
                className="mt-6 rounded-lg border px-4 py-4"
                style={{ borderColor: `${GOLD}40`, background: `${GOLD}10` }}
              >
                <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: GOLD }}>
                  jury bench
                </p>
                {(phase === "done" ||
                  (phase === "jury" && juryVisible >= result.jury.length)) && (
                  <p className="mt-1 text-sm font-semibold">{result.verdict.summary}</p>
                )}

                <div className="mt-4 flex flex-wrap justify-center gap-3">
                  {result.jury.slice(0, juryShown || 0).map((j) => {
                    const live = talkingWallet === j.wallet.toLowerCase();
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
                        subtitle={v ? `${v}${live ? " · live" : ""}` : live ? "speaking" : undefined}
                        talking={live}
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
                            talking={live}
                          />
                        }
                      >
                        <span>
                          →{" "}
                          {j.pick === "a"
                            ? result.a.name
                            : j.pick === "b"
                              ? result.b.name
                              : "tie"}
                        </span>
                        {j.note ? <span className="mt-1 block opacity-90">“{j.note}”</span> : null}
                      </JudgeDesk>
                    );
                  })}
                </div>
                {phase === "jury" && juryVisible < result.jury.length && (
                  <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest opacity-40">
                    next juror approaching the bench…
                  </p>
                )}
              </div>
            )}

            <p className="mt-4 text-xs opacity-50">
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
