"use client";

import { useEffect, useRef, useState } from "react";
import LarvaAvatar from "@/components/LarvaAvatar";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";
import type { LarvatarTraits } from "@/lib/avatar";
import { speakLarva, speakOneLiner, unlockSurveyAudio } from "@/lib/survey-sfx";

type MoralBadge = {
  label: string;
  lawChaos: number;
  goodEvil: number;
};

type Larva = {
  wallet: string;
  ens?: string | null;
  responseCount: number;
  sources: { forum: number; labs: number };
  profile: {
    name: string;
    tagline: string;
    tone: string;
    values: string[];
    quirks: string[];
    summary: string;
    hottestTake?: string;
    hottestTakeSource?: "outlier" | "history";
    catchphrase?: string;
  };
  avatar: LarvatarTraits;
  moral?: MoralBadge | null;
  voiceId?: string;
  voiceLabel?: string;
};

type Answer = {
  wallet: string;
  name: string;
  tone: string;
  hue: number;
  avatar?: Partial<LarvatarTraits>;
  answer: string;
  voiceId?: string;
  voiceLabel?: string;
};

const CHUNK = 9;

export default function LarvaePage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL } = colors;

  const [larvae, setLarvae] = useState<Larva[]>([]);
  const [shown, setShown] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askingWallet, setAskingWallet] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [consensus, setConsensus] = useState("");
  const [askError, setAskError] = useState("");
  const [askMode, setAskMode] = useState<"hive" | "single">("hive");
  const [playingWallet, setPlayingWallet] = useState<string | null>(null);
  const [playingTake, setPlayingTake] = useState<string | null>(null);
  const [retaking, setRetaking] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    fetch("/api/larvae", { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(`load failed (${r.status})`);
        return r.json();
      })
      .then((d) => {
        const list = (d.larvae || []) as Larva[];
        setLarvae(list);
        setShown(Math.min(CHUNK, list.length));
      })
      .catch((e) => {
        if (e?.name === "AbortError") {
          setLoadError("Specimens took too long to load. Refresh?");
        } else {
          setLoadError("Couldn’t load specimens. Refresh?");
        }
      })
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, []);

  useEffect(() => {
    if (shown >= larvae.length) return;
    const id = window.setTimeout(() => {
      setShown((n) => Math.min(n + CHUNK, larvae.length));
    }, 40);
    return () => window.clearTimeout(id);
  }, [shown, larvae.length]);

  async function runAsk(opts: { wallet?: string }) {
    if (!question.trim() || asking) return;
    setAsking(true);
    setAskingWallet(opts.wallet || null);
    setAskError("");
    setAnswers(null);
    setConsensus("");
    try {
      const res = await fetch("/api/larvae/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          ...(opts.wallet
            ? { wallet: opts.wallet }
            : { count: 5 }),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setAskError(d.error || "something went wrong");
      } else {
        setAnswers(d.answers || []);
        setConsensus(d.consensus || "");
        setAskMode(d.mode === "single" ? "single" : "hive");
        // Scroll answers into view after single-larva ask from a card.
        if (opts.wallet) {
          window.setTimeout(() => {
            document.getElementById("ask-results")?.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          }, 50);
        }
      }
    } catch {
      setAskError("network error — try again");
    } finally {
      setAsking(false);
      setAskingWallet(null);
    }
  }

  function playAnswer(a: Answer) {
    unlockSurveyAudio();
    setPlayingWallet(a.wallet);
    // Ask answers use Gemini TTS (not ElevenLabs).
    speakLarva(a.answer);
    window.setTimeout(() => setPlayingWallet(null), 8000);
  }

  function playCatchphrase(l: Larva) {
    if (!l.profile.catchphrase) return;
    unlockSurveyAudio();
    setPlayingTake(l.wallet);
    speakOneLiner(l.profile.catchphrase, l.voiceId);
    window.setTimeout(() => setPlayingTake(null), 12_000);
  }

  async function retakeMoral(wallet: string) {
    if (retaking) return;
    setRetaking(wallet);
    try {
      const res = await fetch("/api/larvae/moral", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet }),
      });
      const d = await res.json();
      if (!res.ok) return;
      const result = d.result as MoralBadge & { label: string };
      setLarvae((list) =>
        list.map((x) =>
          x.wallet === wallet
            ? {
                ...x,
                moral: {
                  label: result.label,
                  lawChaos: result.lawChaos,
                  goodEvil: result.goodEvil,
                },
              }
            : x
        )
      );
    } catch {
      /* ignore */
    } finally {
      setRetaking(null);
    }
  }

  function moralBadgeColor(label: string): string {
    if (label.includes("Good")) return "#2a9d6e";
    if (label.includes("Evil")) return "#c44b4b";
    return "#6b7280";
  }

  const visible = larvae.slice(0, shown);

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-5xl">
        <div
          className="sticky top-0 z-40 -mx-4 mb-2 px-4 pb-2 pt-1 max-md:mb-1 max-md:pb-1 max-md:pt-0"
          style={{ background: SHEET }}
        >
          <Nav />
        </div>
        <header className="mb-10 max-md:mb-6">
          <p className="font-mono text-xs tracking-widest uppercase" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight max-md:text-3xl">Larvatar</h1>
          <p className="mt-2 max-w-xl text-lg font-medium leading-snug opacity-90">
            Your larva would probably hate this website.
          </p>
          <p className="mt-2 max-w-xl text-sm opacity-65">
            Most of them treat dashboards like this as governance theatre. Fair — these cards
            aren’t the larvae. They’re stand-ins built from what each one said on larv.ai forum
            and labs. Proxies of proxies; some things may get lost in translation. Ask the hive,
            open one alone, or poke the rest of the field guide (morals, maps, stand-up, track
            record).
          </p>
        </header>

        <section
          id="ask-results"
          className="mb-12 rounded-xl border p-5"
          style={{ borderColor: `${INK}22`, background: CARD }}
        >
          <p className="font-mono text-xs uppercase tracking-widest opacity-60">ask the hive</p>
          <div className="mt-3 flex gap-2 max-md:flex-col">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runAsk({})}
              maxLength={200}
              placeholder="e.g. should CLAWD burn more or build more?"
              className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2 max-md:min-h-11"
              style={{ borderColor: `${INK}25` }}
            />
            <button
              type="button"
              onClick={() => void runAsk({})}
              disabled={asking || !question.trim()}
              className="shrink-0 rounded-lg px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 max-md:min-h-11 max-md:w-full"
              style={{ background: CORAL }}
            >
              {asking && !askingWallet ? "asking…" : "Ask hive"}
            </button>
          </div>
          <p className="mt-2 text-xs opacity-50">
            Hive = 5 random larvae. Expand a specimen to ask one alone. Tap Play / Voice to hear them.
          </p>

          {askError && (
            <p className="mt-4 text-sm" style={{ color: CORAL }}>
              {askError}
            </p>
          )}

          {answers && (
            <div className="mt-5 space-y-4">
              {askMode === "single" && answers[0] && (
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                  solo · {answers[0].name}
                  {answers[0].voiceLabel ? ` · voice ${answers[0].voiceLabel}` : ""}
                </p>
              )}
              {consensus && (
                <div
                  className="rounded-lg px-4 py-3 text-sm font-medium"
                  style={{ background: `${CORAL}14`, color: INK }}
                >
                  <span
                    className="mr-2 font-mono text-xs uppercase tracking-widest"
                    style={{ color: CORAL }}
                  >
                    consensus
                  </span>
                  {consensus}
                </div>
              )}
              {answers.map((a) => (
                <div key={a.wallet} className="flex items-start gap-3">
                  <div className="shrink-0">
                    <LarvaAvatar
                      hue={a.hue}
                      tone={a.tone}
                      wallet={a.wallet}
                      traits={a.avatar}
                      label={a.name}
                      size={44}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{a.name}</p>
                      {a.voiceLabel && (
                        <span className="font-mono text-[10px] uppercase tracking-widest opacity-40">
                          {a.voiceLabel}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => playAnswer(a)}
                        className="rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest disabled:opacity-40"
                        style={{ borderColor: `${INK}30` }}
                      >
                        {playingWallet === a.wallet ? "playing…" : "Play"}
                      </button>
                    </div>
                    <p className="mt-0.5 text-sm opacity-80">{a.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {loading ? (
          <p className="text-sm opacity-60">loading specimens…</p>
        ) : loadError ? (
          <p className="text-sm" style={{ color: CORAL }}>
            {loadError}
          </p>
        ) : larvae.length === 0 ? (
          <p className="text-sm opacity-60">
            No profiles built yet. Run the build endpoint first.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((l) => {
                const open = expanded === l.wallet;
                return (
                  <div
                    key={l.wallet}
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpanded(open ? null : l.wallet)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpanded(open ? null : l.wallet);
                      }
                    }}
                    className="cursor-pointer rounded-xl border p-5 text-left transition-shadow hover:shadow-md max-md:p-4"
                    style={{
                      borderColor: `${INK}22`,
                      background: CARD,
                      contentVisibility: "auto",
                      containIntrinsicSize: "auto 180px",
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <DeferredAvatar
                        hue={l.avatar.hue}
                        tone={l.profile.tone}
                        wallet={l.wallet}
                        traits={l.avatar}
                        label={l.profile.name}
                        size={72}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-lg font-bold">{l.profile.name}</p>
                          {l.profile.catchphrase && (
                            <button
                              type="button"
                              title="Play catchphrase"
                              onClick={(e) => {
                                e.stopPropagation();
                                playCatchphrase(l);
                              }}
                              className="shrink-0 rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-widest opacity-80 hover:opacity-100"
                              style={{ borderColor: `${INK}35`, background: `${CORAL}14` }}
                            >
                              {playingTake === l.wallet ? "…" : "Voice"}
                            </button>
                          )}
                        </div>
                        <p className="text-xs italic opacity-70">{l.profile.tagline}</p>
                        <p className="mt-1 font-mono text-[10px] opacity-50">
                          {l.ens || `${l.wallet.slice(0, 6)}…${l.wallet.slice(-4)}`} ·{" "}
                          {l.responseCount} responses
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span
                        className="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-white"
                        style={{ background: CORAL }}
                      >
                        {l.profile.tone}
                      </span>
                      {l.moral?.label && (
                        <span
                          className="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-white"
                          title="Moral alignment"
                          style={{ background: moralBadgeColor(l.moral.label) }}
                        >
                          {l.moral.label}
                        </span>
                      )}
                      {l.profile.values.slice(0, open ? 4 : 2).map((v) => (
                        <span
                          key={v}
                          className="rounded-full border px-2 py-0.5 text-[10px]"
                          style={{ borderColor: `${INK}30` }}
                        >
                          {v}
                        </span>
                      ))}
                    </div>

                    {open && (
                      <div className="mt-4 space-y-3 text-sm">
                        {l.profile.hottestTake && (
                          <div>
                            <p className="text-sm leading-snug opacity-85">
                              <span aria-hidden className="mr-1">
                                🔥
                              </span>
                              {l.profile.hottestTake}
                            </p>
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest opacity-40">
                              hottest take
                              {l.profile.hottestTakeSource === "outlier"
                                ? " · outlier test"
                                : l.profile.hottestTakeSource === "history"
                                  ? " · from history"
                                  : ""}
                            </p>
                          </div>
                        )}
                        <p className="opacity-85">{l.profile.summary}</p>
                        {l.profile.quirks.length > 0 && (
                          <p className="text-xs opacity-60">
                            <span className="font-mono uppercase tracking-widest">quirks:</span>{" "}
                            {l.profile.quirks.join(" · ")}
                          </p>
                        )}
                        <p className="font-mono text-[10px] opacity-45">
                          forum {l.sources.forum} · labs {l.sources.labs}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void runAsk({ wallet: l.wallet });
                          }}
                          disabled={asking || !question.trim()}
                          className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                          style={{ background: CORAL }}
                        >
                          {asking && askingWallet === l.wallet
                            ? "asking…"
                            : question.trim()
                              ? `Ask ${l.profile.name}`
                              : "Type a question above first"}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void retakeMoral(l.wallet);
                          }}
                          disabled={retaking === l.wallet}
                          className="w-full rounded-lg border px-4 py-2 text-center font-mono text-[10px] uppercase tracking-widest opacity-60 hover:opacity-100 disabled:opacity-40"
                          style={{ borderColor: `${INK}28` }}
                        >
                          {retaking === l.wallet
                            ? "retesting…"
                            : l.moral
                              ? "Retake moral test"
                              : "Run moral test"}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {shown < larvae.length && (
              <p className="mt-4 font-mono text-[10px] uppercase tracking-widest opacity-40">
                showing {shown} of {larvae.length}…
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** Placeholder until near viewport — keeps first paint light so clicks work. */
function DeferredAvatar({
  hue,
  tone,
  wallet,
  traits,
  label,
  size,
}: {
  hue: number;
  tone: string;
  wallet: string;
  traits: LarvatarTraits;
  label: string;
  size: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setReady(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="shrink-0" style={{ width: size, height: size }}>
      {ready ? (
        <LarvaAvatar
          hue={hue}
          tone={tone}
          wallet={wallet}
          traits={traits}
          label={label}
          size={size}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            background: `hsl(${hue} 55% 48%)`,
            opacity: 0.85,
          }}
        />
      )}
    </div>
  );
}
