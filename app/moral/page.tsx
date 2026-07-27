"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";
import type { MoralLabel, MoralResult } from "@/lib/moral";

type ListPayload = {
  results: MoralResult[];
  grid: MoralLabel[][];
  count: number;
};

export default function MoralPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, sea: SEA } = colors;

  const [results, setResults] = useState<MoralResult[]>([]);
  const [grid, setGrid] = useState<MoralLabel[][]>([
    ["Lawful Good", "Neutral Good", "Chaotic Good"],
    ["Lawful Neutral", "True Neutral", "Chaotic Neutral"],
    ["Lawful Evil", "Neutral Evil", "Chaotic Evil"],
  ]);
  const [active, setActive] = useState<MoralResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = (await fetch("/api/larvae/moral").then((r) => r.json())) as ListPayload;
      setResults(d.results || []);
      if (d.grid?.length) setGrid(d.grid);
    } catch {
      setError("Couldn’t load results.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!active && results[0]) setActive(results[0]);
  }, [results, active]);

  async function runRandom() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/larvae/moral", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ random: true }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "test failed");
        return;
      }
      setActive(d.result as MoralResult);
      const list = (await fetch("/api/larvae/moral").then((r) => r.json())) as ListPayload;
      setResults(list.results || []);
    } catch {
      setError("network error");
    } finally {
      setRunning(false);
    }
  }

  const byLabel = useMemo(() => {
    const m = new Map<string, MoralResult[]>();
    for (const r of results) {
      const list = m.get(r.label) || [];
      list.push(r);
      m.set(r.label, list);
    }
    return m;
  }, [results]);

  function cellColor(label: MoralLabel) {
    if (label.includes("Good")) return `${SEA}22`;
    if (label.includes("Evil")) return `${CORAL}22`;
    return `${INK}08`;
  }

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-5xl">
        <div
          className="sticky top-0 z-40 -mx-4 mb-2 px-4 pb-2 pt-1"
          style={{ background: SHEET }}
        >
          <Nav />
        </div>

        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            in character
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight max-md:text-3xl">
            Moral Alignment Test
          </h1>
          <p className="mt-2 max-w-2xl text-sm opacity-75">
            Six dilemmas. Each larva answers as itself — values, tone, quirks — then lands on the
            classic nine-box compass. Separate from Track Record (that’s swarm agreement, not morals).
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runRandom()}
              disabled={running}
              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: CORAL }}
            >
              {running ? "testing a larva…" : "Test a random larva"}
            </button>
            <Link
              href="/larvae"
              className="rounded-lg border px-4 py-2.5 text-sm opacity-70"
              style={{ borderColor: `${INK}25` }}
            >
              Pick from specimens →
            </Link>
          </div>
        </header>

        {error && (
          <p className="mb-4 text-sm" style={{ color: CORAL }}>
            {error}
          </p>
        )}

        {/* 3×3 grid */}
        <section className="mb-10">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest opacity-50">
            hive compass · {results.length} tested
          </p>
          <div className="grid grid-cols-3 gap-2">
            {grid.flat().map((label) => {
              const cell = byLabel.get(label) || [];
              const selected = active?.label === label;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => cell[0] && setActive(cell[0])}
                  className="rounded-xl border p-3 text-left transition-shadow hover:shadow-md min-h-[88px]"
                  style={{
                    borderColor: selected ? CORAL : `${INK}18`,
                    background: cellColor(label),
                  }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-widest opacity-60">
                    {label}
                  </p>
                  <p className="mt-1 text-lg font-bold" style={{ color: selected ? CORAL : INK }}>
                    {cell.length}
                  </p>
                  {cell[0] && (
                    <p className="mt-1 truncate text-xs opacity-60">{cell[0].name}</p>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-widest opacity-40">
            <span>← lawful</span>
            <span>chaotic →</span>
          </div>
        </section>

        {/* Active result */}
        {loading && !active ? (
          <p className="text-sm opacity-60">loading…</p>
        ) : active ? (
          <section
            className="rounded-xl border p-5"
            style={{ borderColor: `${INK}22`, background: CARD }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                  {active.tone} · tested {new Date(active.testedAt).toLocaleDateString()}
                </p>
                <h2 className="text-2xl font-bold">{active.name}</h2>
              </div>
              <p
                className="rounded-full px-3 py-1 font-mono text-xs uppercase tracking-widest text-white"
                style={{ background: GOLD }}
              >
                {active.label}
              </p>
            </div>
            <p className="mt-2 font-mono text-xs opacity-50">
              law↔chaos {active.lawChaos >= 0 ? `+${active.lawChaos}` : active.lawChaos} · good↔evil{" "}
              {active.goodEvil >= 0 ? `+${active.goodEvil}` : active.goodEvil}
              {" "}(−2 lawful/good … +2 chaotic/evil)
            </p>

            <div className="mt-5 space-y-4">
              {active.answers.map((a) => (
                <div key={a.id} className="border-t pt-3" style={{ borderColor: `${INK}12` }}>
                  <p className="text-xs font-medium opacity-55">{a.prompt}</p>
                  <p className="mt-1.5 text-sm leading-snug">“{a.answer}”</p>
                </div>
              ))}
            </div>

            {results.length > 1 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {results.slice(0, 24).map((r) => (
                  <button
                    key={r.wallet}
                    type="button"
                    onClick={() => setActive(r)}
                    className="rounded-full border px-3 py-1 text-xs"
                    style={{
                      borderColor: active.wallet === r.wallet ? CORAL : `${INK}22`,
                      background: active.wallet === r.wallet ? `${CORAL}14` : "transparent",
                    }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </section>
        ) : (
          <p className="text-sm opacity-60">
            Nobody’s taken the test yet. Hit “Test a random larva” — they answer in character.
          </p>
        )}
      </div>
    </main>
  );
}
