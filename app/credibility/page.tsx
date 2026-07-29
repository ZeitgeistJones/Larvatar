// app/credibility/page.tsx
// Track Record — every larva's alignment with the swarm's eventual position,
// sortable, with the caveat that alignment is not the same thing as being right.
//
// The archetype column exists because raw win rate is misleading here: a larva
// that answers "neutral" on 43 of 55 posts scores well against a mostly-neutral
// aggregate without ever taking a position. That is a different animal from one
// that commits and still lands with the room, and the table says so.

"use client";

import { useEffect, useMemo, useState } from "react";
import LarvaAvatar from "@/components/LarvaAvatar";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";
import type { LarvatarTraits } from "@/lib/avatar";

type Breakdown = {
  approve: number;
  conditional: number;
  disapprove: number;
  neutral: number;
};

type Larva = {
  wallet: string;
  ens?: string | null;
  name: string;
  tagline: string;
  tone: string;
  quirks?: string[];
  avatar: LarvatarTraits | null;
  moral?: { label: string; lawChaos: number; goodEvil: number } | null;
  posts: number;
  wins: number;
  winRate: number;
  breakdown: Breakdown;
  conviction: number;
  lean: number;
  faction: number | null;
  topAlly: { wallet: string; rate: number; shared?: number } | null;
  topRival?: { wallet: string; rate: number; shared?: number } | null;
};

type Payload = {
  computedAt: string;
  postCount: number;
  larvaeCount: number;
  larvae: Larva[];
  hive: {
    avgWinRate: number;
    avgConviction: number;
    stanceMix: Breakdown;
  };
};

const MIN_POSTS = 5;

type SortKey = "winRate" | "conviction" | "posts" | "name";
type SortDir = "asc" | "desc";

const SORT_LABELS: Record<SortKey, string> = {
  winRate: "Alignment",
  conviction: "Conviction",
  posts: "Stances",
  name: "Name",
};

const METRIC_DEFS: { key: SortKey; label: string; def: string }[] = [
  {
    key: "winRate",
    label: "Alignment",
    def: "How often this larva’s stance matched the swarm’s aggregate on the same question. High ≠ correct — it means “with the room.”",
  },
  {
    key: "conviction",
    label: "Conviction",
    def: "Share of stances that were hard yes/no (approve or disapprove), not hedge or abstain. High = takes a side.",
  },
  {
    key: "posts",
    label: "Stances",
    def: "How many scored questions this larva answered. More stances = more reliable alignment and conviction rates.",
  },
];

/** Shared desktop columns: rank | specimen | conviction | stances | alignment */
const ROW_GRID =
  "grid grid-cols-[2rem_minmax(0,1fr)_5.5rem_4.5rem_5.5rem] items-center gap-x-3 px-4";

export default function CredibilityPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, sea: SEA } = colors;

  /**
   * Archetype from the two measured traits, relative to the hive.
   * Deliberately descriptive rather than evaluative — none of these is "best".
   */
  function archetype(l: Larva, avgWin: number, avgConv: number) {
    const passive = l.breakdown.neutral / (l.posts || 1) > 0.45;
    if (passive)
      return {
        label: "Tracker",
        color: `${INK}77`,
        note: "mostly abstains; scores by following the room",
      };
    const hiWin = l.winRate >= avgWin;
    const hiConv = l.conviction >= avgConv;
    if (hiWin && hiConv)
      return {
        label: "Hard takes, with the room",
        color: GOLD,
        note: "commits hard and still lands with the swarm",
      };
    if (hiWin && !hiConv)
      return {
        label: "Soft takes, with the room",
        color: SEA,
        note: "hedges, and the hedge is usually where consensus lands",
      };
    if (!hiWin && hiConv)
      return {
        label: "Hard takes, against the room",
        color: CORAL,
        note: "takes strong positions the swarm doesn't follow",
      };
    return {
      label: "Soft takes, against the room",
      color: `${INK}88`,
      note: "neither commits nor converges",
    };
  }

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("winRate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [distMetric, setDistMetric] = useState<"winRate" | "conviction" | "posts">("winRate");
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/larvae/alignment/enriched")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("network error"))
      .finally(() => setLoading(false));
  }, []);

  function chooseSort(key: SortKey) {
    if (key === sort) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(key);
    setSortDir(key === "name" ? "asc" : "desc");
    if (key === "winRate" || key === "conviction" || key === "posts") {
      setDistMetric(key);
    }
  }

  function chooseDist(key: "winRate" | "conviction" | "posts") {
    setDistMetric(key);
    setSort(key);
    setSortDir("desc");
  }

  const rankedPool = useMemo(() => {
    if (!data) return [] as Larva[];
    return data.larvae.filter((l) => showAll || l.posts >= MIN_POSTS);
  }, [data, showAll]);

  const distStats = useMemo(() => {
    if (rankedPool.length === 0) {
      return { avg: 0, top: 0, isPct: true };
    }
    const vals = rankedPool.map((l) =>
      distMetric === "posts" ? l.posts : l[distMetric]
    );
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    const top = Math.max(...vals);
    return { avg, top, isPct: distMetric !== "posts" };
  }, [rankedPool, distMetric]);

  const rows = useMemo(() => {
    if (!data) return [];
    let r = [...rankedPool];
    const q = query.trim().toLowerCase();
    if (q) {
      r = r.filter(
        (l) => l.name.toLowerCase().includes(q) || l.wallet.toLowerCase().includes(q)
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    return r.sort((a, b) => {
      if (sort === "name") return dir * a.name.localeCompare(b.name);
      return dir * (a[sort] - b[sort]);
    });
  }, [data, rankedPool, sort, sortDir, query]);

  function SortHead({
    col,
    align = "right",
  }: {
    col: SortKey;
    align?: "left" | "right";
  }) {
    const active = sort === col;
    return (
      <button
        type="button"
        onClick={() => chooseSort(col)}
        className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-100 ${
          align === "right" ? "justify-end text-right" : "justify-start text-left"
        }`}
        style={{ color: active ? CORAL : INK, opacity: active ? 1 : 0.5 }}
      >
        <span>{SORT_LABELS[col]}</span>
        <span className="inline-block w-3 tabular-nums" aria-hidden>
          {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </span>
      </button>
    );
  }

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-4xl">
        <Nav />
        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Track Record</h1>
          <p className="mt-2 max-w-2xl text-sm opacity-75">
            How often each larva’s stance matched the swarm’s aggregated opinion, across every
            forum/gov question we scored them on.
          </p>
        </header>

        {loading && <p className="text-sm opacity-60">loading records…</p>}
        {error && (
          <p className="text-sm" style={{ color: CORAL }}>
            {error}
          </p>
        )}

        {data && (
          <>
            <section
              className="mb-6 rounded-xl border p-5"
              style={{ borderColor: `${GOLD}55`, background: CARD }}
            >
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                read this first
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                Alignment is not accuracy. A high score means a larva tends to land where the
                swarm lands — which rewards agreeing with the room, not being right about
                outcomes. A larva that abstains often will score well against a mostly-neutral
                aggregate without ever committing to anything, so the archetype under each name
                separates that from genuine conviction. Judging who was actually{" "}
                <em>correct</em> needs shipped-versus-stalled outcome data, which this doesn&apos;t
                have yet.
              </p>
            </section>

            <section
              className="mb-6 rounded-xl border p-5"
              style={{ borderColor: `${INK}22`, background: CARD }}
            >
              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="larvae ranked" value={String(rows.length)} />
                <Stat label="questions scored" value={String(data.postCount)} />
                <Stat
                  label={`hive avg · ${SORT_LABELS[distMetric].toLowerCase()}`}
                  value={
                    distStats.isPct
                      ? `${Math.round(distStats.avg * 100)}%`
                      : String(Math.round(distStats.avg))
                  }
                />
                <Stat
                  label={`top · ${SORT_LABELS[distMetric].toLowerCase()}`}
                  value={
                    distStats.isPct
                      ? `${Math.round(distStats.top * 100)}%`
                      : String(Math.round(distStats.top))
                  }
                  accent={GOLD}
                />
              </div>

              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                  distribution
                </p>
                <div className="flex rounded-lg border p-0.5" style={{ borderColor: `${INK}18` }}>
                  {(["winRate", "conviction", "posts"] as const).map((k) => {
                    const on = distMetric === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => chooseDist(k)}
                        className="rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest"
                        style={{
                          background: on ? `${CORAL}14` : "transparent",
                          color: on ? CORAL : `${INK}70`,
                        }}
                      >
                        {SORT_LABELS[k]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Histogram
                values={rankedPool.map((l) =>
                  distMetric === "posts" ? l.posts : l[distMetric]
                )}
                avg={distStats.avg}
                asPercent={distStats.isPct}
              />
            </section>

            {/* Search + filter (not sort) */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="find a larva…"
                className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 max-md:min-h-11"
                style={{ borderColor: `${INK}25`, background: CARD }}
              />
              <button
                type="button"
                onClick={() => setShowAll((s) => !s)}
                className="rounded-md border px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-100 max-md:min-h-11"
                style={{
                  borderColor: showAll ? CORAL : `${INK}22`,
                  background: showAll ? `${CORAL}12` : CARD,
                  color: showAll ? CORAL : INK,
                  opacity: showAll ? 1 : 0.7,
                }}
              >
                {showAll ? "all larvae" : `${MIN_POSTS}+ stances`}
              </button>
            </div>

            {/* Metric glossary — what the three numbers mean */}
            <div
              className="mb-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-3"
              style={{ borderColor: `${INK}18`, background: CARD }}
            >
              {METRIC_DEFS.map((m) => (
                <div key={m.key}>
                  <p
                    className="font-mono text-[10px] uppercase tracking-widest"
                    style={{ color: sort === m.key ? CORAL : `${INK}88` }}
                  >
                    {m.label}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed opacity-70">{m.def}</p>
                </div>
              ))}
            </div>

            {/* Mobile sort control */}
            <div
              className="mb-3 flex items-center gap-2 sm:hidden"
              style={{ color: INK }}
            >
              <label className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                Sort
              </label>
              <select
                value={sort}
                onChange={(e) => {
                  const key = e.target.value as SortKey;
                  setSort(key);
                  setSortDir(key === "name" ? "asc" : "desc");
                  if (key === "winRate" || key === "conviction" || key === "posts") {
                    setDistMetric(key);
                  }
                }}
                className="min-h-11 flex-1 rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: `${INK}25`, background: CARD }}
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="min-h-11 shrink-0 rounded-lg border px-3 py-2 font-mono text-xs"
                style={{ borderColor: `${INK}25`, background: CARD }}
              >
                {sortDir === "asc" ? "↑ Low→High" : "↓ High→Low"}
              </button>
            </div>

            <section
              className="overflow-hidden rounded-xl border"
              style={{ borderColor: `${INK}22`, background: CARD }}
            >
              {/* Desktop column headers — align with row cells */}
              <div
                className={`${ROW_GRID} sticky top-0 z-10 hidden border-b py-2.5 sm:grid`}
                style={{ borderColor: `${INK}14`, background: CARD }}
              >
                <span className="font-mono text-[10px] uppercase tracking-widest opacity-40">#</span>
                <SortHead col="name" align="left" />
                <SortHead col="conviction" />
                <SortHead col="posts" />
                <SortHead col="winRate" />
              </div>

              {rows.map((l, i) => {
                const arch = archetype(l, data.hive.avgWinRate, data.hive.avgConviction);
                const isOpen = expanded === l.wallet;
                const topHighlight =
                  i < 3 && sort === "winRate" && sortDir === "desc";
                return (
                  <div
                    key={l.wallet}
                    style={{ borderTop: i === 0 ? "none" : `1px solid ${INK}12` }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : l.wallet)}
                      className="w-full text-left transition-colors hover:bg-black/[0.02]"
                    >
                      {/* Desktop row */}
                      <span className={`${ROW_GRID} hidden py-3 sm:grid`}>
                        <span
                          className="font-mono text-xs font-bold tabular-nums"
                          style={{ color: topHighlight ? GOLD : `${INK}55` }}
                        >
                          {i + 1}
                        </span>

                        <span className="flex min-w-0 items-center gap-2.5">
                          {l.avatar ? (
                            <LarvaAvatar
                              hue={l.avatar.hue}
                              tone={l.avatar.tone}
                              traits={l.avatar}
                              wallet={l.wallet}
                              size={32}
                              moral={l.moral}
                              quirks={l.quirks}
                              conviction={l.conviction}
                            />
                          ) : (
                            <span
                              className="h-8 w-8 shrink-0 rounded-full"
                              style={{ background: `${INK}12` }}
                            />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{l.name}</span>
                            <span
                              className="block truncate font-mono text-[10px] uppercase tracking-widest"
                              style={{ color: arch.color }}
                            >
                              {arch.label}
                            </span>
                          </span>
                        </span>

                        <span className="text-right text-sm font-semibold tabular-nums">
                          {Math.round(l.conviction * 100)}%
                        </span>

                        <span className="text-right text-sm font-semibold tabular-nums opacity-80">
                          {l.posts}
                        </span>

                        <span
                          className="text-right text-lg font-bold tabular-nums"
                          style={{
                            color: l.winRate >= data.hive.avgWinRate ? GOLD : INK,
                          }}
                        >
                          {Math.round(l.winRate * 100)}%
                        </span>
                      </span>

                      {/* Mobile compact row */}
                      <span className="flex items-center gap-2.5 px-3 py-3.5 sm:hidden">
                        <span
                          className="w-5 shrink-0 font-mono text-xs font-bold tabular-nums"
                          style={{ color: topHighlight ? GOLD : `${INK}55` }}
                        >
                          {i + 1}
                        </span>
                        {l.avatar ? (
                          <LarvaAvatar
                            hue={l.avatar.hue}
                            tone={l.avatar.tone}
                            traits={l.avatar}
                            wallet={l.wallet}
                            size={32}
                            moral={l.moral}
                            quirks={l.quirks}
                            conviction={l.conviction}
                          />
                        ) : (
                          <span
                            className="h-8 w-8 shrink-0 rounded-full"
                            style={{ background: `${INK}12` }}
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{l.name}</span>
                          <span className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                            {l.posts} stances · {Math.round(l.conviction * 100)}% conv
                          </span>
                        </span>
                        <span
                          className="shrink-0 text-lg font-bold tabular-nums"
                          style={{
                            color: l.winRate >= data.hive.avgWinRate ? GOLD : INK,
                          }}
                        >
                          {Math.round(l.winRate * 100)}%
                        </span>
                      </span>
                    </button>

                    {isOpen && (
                      <div
                        className="border-t px-4 py-4"
                        style={{ borderColor: `${INK}12`, background: `${INK}04` }}
                      >
                        {l.tagline && <p className="mb-3 text-sm opacity-80">{l.tagline}</p>}
                        <p className="mb-3 text-xs opacity-60">
                          <strong style={{ color: arch.color }}>{arch.label}</strong> — {arch.note}
                        </p>
                        <StanceBar breakdown={l.breakdown} total={l.posts} />
                        <div className="mt-3 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-widest opacity-55">
                          <span>
                            {l.wins} of {l.posts} stances matched the swarm
                          </span>
                          {l.faction !== null && <span>cluster {l.faction + 1}</span>}
                          {l.topAlly && (
                            <span>
                              often with:{" "}
                              {data.larvae.find((x) => x.wallet === l.topAlly!.wallet)?.name ||
                                data.larvae.find((x) => x.wallet === l.topAlly!.wallet)?.ens ||
                                l.topAlly.wallet.slice(0, 8)}{" "}
                              ({Math.round(l.topAlly.rate * 100)}%)
                            </span>
                          )}
                          {l.topRival && (
                            <span style={{ color: CORAL }}>
                              often against:{" "}
                              {data.larvae.find((x) => x.wallet === l.topRival!.wallet)?.name ||
                                data.larvae.find((x) => x.wallet === l.topRival!.wallet)?.ens ||
                                l.topRival.wallet.slice(0, 8)}{" "}
                              ({Math.round(l.topRival.rate * 100)}%)
                            </span>
                          )}
                          {(l.topAlly || l.topRival) && (
                            <a
                              href={`/debate?a=${l.wallet}${l.topRival ? `&b=${l.topRival.wallet}` : ""}`}
                              className="underline-offset-2 hover:underline"
                              style={{ color: CORAL }}
                            >
                              Debate →
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {rows.length === 0 && (
                <p className="px-4 py-8 text-center text-sm opacity-50">no larvae match</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

/* ─── Small pieces ─────────────────────────────────────────────────── */

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">{label}</p>
      <p className="text-2xl font-bold" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
    </div>
  );
}

/** Distribution of the selected metric — shows how tight the pack really is. */
function Histogram({
  values,
  avg,
  asPercent,
}: {
  values: number[];
  avg: number;
  asPercent: boolean;
}) {
  const { colors } = useTheme();
  const { gold: GOLD, sea: SEA } = colors;
  const BUCKETS = 14;
  if (values.length === 0) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || (asPercent ? 0.1 : 1);

  const counts = new Array(BUCKETS).fill(0);
  for (const r of values) {
    const idx = Math.min(BUCKETS - 1, Math.floor(((r - lo) / span) * BUCKETS));
    counts[idx]++;
  }
  const peak = Math.max(...counts) || 1;
  const avgIdx = Math.min(BUCKETS - 1, Math.floor(((avg - lo) / span) * BUCKETS));

  const fmt = (v: number) => (asPercent ? `${Math.round(v * 100)}%` : String(Math.round(v)));

  return (
    <div>
      <div className="flex h-20 items-end gap-1">
        {counts.map((c, i) => (
          <div
            key={i}
            className="flex-1 rounded-t"
            style={{
              height: `${Math.max(3, (c / peak) * 100)}%`,
              background: i === avgIdx ? GOLD : `${SEA}88`,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-widest opacity-45">
        <span>{fmt(lo)}</span>
        <span style={{ color: GOLD }}>hive avg {fmt(avg)}</span>
        <span>{fmt(hi)}</span>
      </div>
    </div>
  );
}

function StanceBar({ breakdown, total }: { breakdown: Breakdown; total: number }) {
  const { colors } = useTheme();
  const { ink: INK, coral: CORAL, gold: GOLD, green: GREEN } = colors;
  const t = total || 1;
  const seg = [
    { key: "approve", n: breakdown.approve, color: GREEN, label: "approve" },
    { key: "conditional", n: breakdown.conditional, color: GOLD, label: "conditional" },
    { key: "disapprove", n: breakdown.disapprove, color: CORAL, label: "disapprove" },
    { key: "neutral", n: breakdown.neutral, color: `${INK}44`, label: "neutral" },
  ];
  return (
    <>
      <div className="flex h-3 overflow-hidden rounded-full">
        {seg.map((s) => (
          <div
            key={s.key}
            style={{ width: `${(s.n / t) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.n}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-widest opacity-60">
        {seg.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label} {s.n}
          </span>
        ))}
      </div>
    </>
  );
}
