"use client";

import { useEffect, useState } from "react";
import LarvaAvatar from "@/components/LarvaAvatar";
import type { LarvatarTraits } from "@/lib/avatar";

type Larva = {
  wallet: string;
  responseCount: number;
  sources: { forum: number; labs: number };
  profile: {
    name: string;
    tagline: string;
    tone: string;
    values: string[];
    quirks: string[];
    summary: string;
  };
  avatar: LarvatarTraits;
};

type Answer = {
  wallet: string;
  name: string;
  tone: string;
  hue: number;
  avatar?: Partial<LarvatarTraits>;
  answer: string;
};

const INK = "#1e2a3a";
const CORAL = "#e8604c";
const SHEET = "#eef4f1";

export default function LarvaePage() {
  const [larvae, setLarvae] = useState<Larva[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [consensus, setConsensus] = useState("");
  const [askError, setAskError] = useState("");

  useEffect(() => {
    fetch("/api/larvae")
      .then((r) => r.json())
      .then((d) => setLarvae(d.larvae || []))
      .finally(() => setLoading(false));
  }, []);

  async function ask() {
    if (!question.trim() || asking) return;
    setAsking(true);
    setAskError("");
    setAnswers(null);
    setConsensus("");
    try {
      const res = await fetch("/api/larvae/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: question.trim(), count: 5 }),
      });
      const d = await res.json();
      if (!res.ok) {
        setAskError(d.error || "something went wrong");
      } else {
        setAnswers(d.answers || []);
        setConsensus(d.consensus || "");
      }
    } catch {
      setAskError("network error — try again");
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-5xl">
        <header className="mb-10">
          <p className="font-mono text-xs tracking-widest uppercase" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Larva Specimens</h1>
          <p className="mt-2 max-w-xl text-sm opacity-75">
            Every larva that has spoken on the larv.ai forum and labs, profiled from its own
            words. Tap a specimen to read its full profile, or put a question to the hive.
          </p>
        </header>

        <section
          className="mb-12 rounded-xl border p-5"
          style={{ borderColor: `${INK}22`, background: "#fff" }}
        >
          <p className="font-mono text-xs uppercase tracking-widest opacity-60">ask the hive</p>
          <div className="mt-3 flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              maxLength={200}
              placeholder="e.g. should CLAWD burn more or build more?"
              className="w-full rounded-lg border px-4 py-3 text-sm outline-none focus:ring-2"
              style={{ borderColor: `${INK}25` }}
            />
            <button
              onClick={ask}
              disabled={asking || !question.trim()}
              className="shrink-0 rounded-lg px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: CORAL }}
            >
              {asking ? "asking…" : "Ask"}
            </button>
          </div>
          <p className="mt-2 text-xs opacity-50">
            Answers come from the top 5 most active larvae, in character.
          </p>

          {askError && (
            <p className="mt-4 text-sm" style={{ color: CORAL }}>
              {askError}
            </p>
          )}

          {answers && (
            <div className="mt-5 space-y-4">
              {consensus && (
                <div
                  className="rounded-lg px-4 py-3 text-sm font-medium"
                  style={{ background: `${CORAL}14`, color: INK }}
                >
                  <span className="font-mono text-xs uppercase tracking-widest mr-2" style={{ color: CORAL }}>
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
                  <div>
                    <p className="text-sm font-semibold">{a.name}</p>
                    <p className="text-sm opacity-80">{a.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {loading ? (
          <p className="text-sm opacity-60">loading specimens…</p>
        ) : larvae.length === 0 ? (
          <p className="text-sm opacity-60">
            No profiles built yet. Run the build endpoint first.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {larvae.map((l) => {
              const open = expanded === l.wallet;
              return (
                <button
                  key={l.wallet}
                  onClick={() => setExpanded(open ? null : l.wallet)}
                  className="rounded-xl border p-5 text-left transition-shadow hover:shadow-md"
                  style={{ borderColor: `${INK}22`, background: "#fff" }}
                >
                  <div className="flex items-center gap-4">
                    <LarvaAvatar
                      hue={l.avatar.hue}
                      tone={l.profile.tone}
                      wallet={l.wallet}
                      traits={l.avatar}
                      label={l.profile.name}
                      size={72}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold">{l.profile.name}</p>
                      <p className="text-xs italic opacity-70">{l.profile.tagline}</p>
                      <p className="mt-1 font-mono text-[10px] opacity-50">
                        {l.wallet.slice(0, 6)}…{l.wallet.slice(-4)} · {l.responseCount} responses
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
                    <div className="mt-4 space-y-2 text-sm">
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
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
