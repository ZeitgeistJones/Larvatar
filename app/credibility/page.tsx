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
import type { LarvatarTraits } from "@/lib/avatar";

type Breakdown = {
  approve: number;
  conditional: number;
  disapprove: number;
  neutral: number;
};

type Larva = {
  wallet: string;
  name: string;
  tagline: string;
  tone: string;
  avatar: LarvatarTraits | null;
  posts: number;
  wins: number;
  winRate: number;
  breakdown: Breakdown;
  conviction: number;
  lean: number;
  faction: number | null;
  topAlly: { wallet: string; rate: number } | null;
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

const INK = "#1e2a3a";
const CORAL = "#e8604c";
const SHEET = "#eef4f1";
const GOLD = "#d4a017";
const GREEN = "#2d8a56";
const SEA = "#3d8b8b";

const MIN_POSTS = 5;

type SortKey = "winRate" | "conviction" | "posts" | "name";

/**
 * Archetype from the two measured traits, relative to the hive.
 * Deliberately descriptive rather than evaluative — none of these is "best".
 */
function archetype(l: Larva, avgWin: number, avgConv: number) {
  const passive = l.breakdown.neutral / (l.posts || 1) > 0.45;
  if (passive) return { label: "Tracker", color: `${INK}77`, note: "mostly abstains; scores by following the room" };
  const hiWin = l.winRate >= avgWin;
  const hiConv = l.conviction >= avgConv;
  if (hiWin && hiConv) return { label: "Bellwether", color: GOLD, note: "commits hard and still lands with the swarm" };
  if (hiWin && !hiConv) return { label: "Diplomat", color: SEA, note: "hedges, and the hedge is usually where consensus lands" };
  if (!hiWin && hiConv) return { label: "Dissenter", color: CORAL, note: "takes strong positions the swarm doesn't follow" };
  return { label: "Drifter", color: `${INK}88`, note: "neither commits nor converges" };
}

export default function CredibilityPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("winRate");
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

  const rows = useMemo(() => {
    if (!data) return [];
    let r = data.larvae.filter((l) => showAll || l.posts >= MIN_POSTS);
    const q = query.trim().toLowerCase();
    if (q) {
      r = r.filter(
        (l) => l.name.toLowerCase().includes(q) || l.wallet.toLowerCase().includes(q)
      );
    }
    return [...r].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      return b[sort] - a[sort];
    });
  }, [data, sort, showAll, query]);

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
            How often each larva's position matched the swarm's aggregated opinion, across
            every post it answered.
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
            {/* ── The caveat, stated up front ── */}
            <section
              className="mb-6 rounded-xl border p-5"
              style={{ borderColor: `${GOLD}55`, background: "#fff" }}
            >
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                read this first
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                Alignment is not accuracy. A high score means a larva tends to land where the
                swarm lands — which rewards agreeing with the room, not being right about
                outcomes. A larva that abstains often will score well against a mostly-neutral
                aggregate without ever committing to anything, so the archetype column
                separates that from genuine conviction. Judging who was actually{" "}
                <em>correct</em> needs shipped-versus-stalled outcome data, which this doesn't
                have yet.
              </p>
            </section>

            {/* ── Distribution ── */}
            <section
              className="mb-6 rounded-xl border p-5"
              style={{ borderColor: `${INK}22`, background: "#fff" }}
            >
              <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="larvae ranked" value={String(rows.length)} />
                <Stat label="posts" value={String(data.postCount)} />
                <Stat
                  label="hive average"
                  value={`${Math.round(data.hive.avgWinRate * 100)}%`}
                />
                <Stat
                  label="top score"
                  value={`${Math.round(Math.max(...data.larvae.map((l) => l.winRate)) * 100)}%`}
                  accent={GOLD}
                />
              </div>
              <Histogram larvae={data.larvae.filter((l) => l.posts >= MIN_POSTS)} avg={data.hive.avgWinRate} />
            </section>

            {/* ── Controls ── */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="find a larva…"
                className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                style={{ borderColor: `${INK}25`, background: "#fff" }}
              />
              {(["winRate", "conviction", "posts", "name"] as SortKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setSort(k)}
                  className="rounded-md border px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-opacity"
                  style={{
                    borderColor: sort === k ? CORAL : `${INK}22`,
                    background: sort === k ? `${CORAL}12` : "#fff",
                    color: sort === k ? CORAL : INK,
                    opacity: sort === k ? 1 : 0.65,
                  }}
                >
                  {k === "winRate" ? "alignment" : k}
                </button>
              ))}
              <button
                onClick={() => setShowAll((s) => !s)}
                className="rounded-md border px-3 py-2 font-mono text-[10px] uppercase tracking-widest opacity-65 transition-opacity hover:opacity-100"
                style={{ borderColor: `${INK}22`, background: "#fff" }}
              >
                {showAll ? "all" : `${MIN_POSTS}+ posts`}
              </button>
            </div>

            {/* ── Table ── */}
            <section
              className="overflow-hidden rounded-xl border"
              style={{ borderColor: `${INK}22`, background: "#fff" }}
            >
              {rows.map((l, i) => {
                const arch = archetype(l, data.hive.avgWinRate, data.hive.avgConviction);
                const isOpen = expanded === l.wallet;
                return (
                  <div key={l.wallet} style={{ borderTop: i === 0 ? "none" : `1px solid ${INK}12` }}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : l.wallet)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-black/[0.02]"
                    >
                      <span
                        className="w-6 shrink-0 font-mono text-xs font-bold tabular-nums"
                        style={{ color: i < 3 && sort === "winRate" ? GOLD : `${INK}55` }}
                      >
                        {i + 1}
                      </span>

                      {l.avatar ? (
                        <span className="shrink-0">
                          <LarvaAvatar
                            hue={l.avatar.hue}
                            tone={l.avatar.tone}
                            traits={l.avatar}
                            size={32}
                          />
                        </span>
                      ) : (
                        <span
                          className="h-8 w-8 shrink-0 rounded-full"
                          style={{ background: `${INK}12` }}
                        />
                      )}

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{l.name}</span>
                        <span
                          className="font-mono text-[10px] uppercase tracking-widest"
                          style={{ color: arch.color }}
                        >
                          {arch.label}
                        </span>
                      </span>

                      <span className="hidden shrink-0 text-right sm:block">
                        <span className="block font-mono text-[10px] uppercase tracking-widest opacity-45">
                          conviction
                        </span>
                        <span className="block text-sm font-semibold tabular-nums">
                          {Math.round(l.conviction * 100)}%
                        </span>
                      </span>

                      <span className="w-16 shrink-0 text-right">
                        <span className="block font-mono text-[10px] uppercase tracking-widest opacity-45">
                          {l.posts} posts
                        </span>
                        <span
                          className="block text-lg font-bold tabular-nums"
                          style={{
                            color: l.winRate >= data.hive.avgWinRate ? GOLD : INK,
                          }}
                        >
                          {Math.round(l.winRate * 100)}%
                        </span>
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-t px-4 py-4" style={{ borderColor: `${INK}12`, background: `${INK}04` }}>
                        {l.tagline && <p className="mb-3 text-sm opacity-80">{l.tagline}</p>}
                        <p className="mb-3 text-xs opacity-60">
                          <strong style={{ color: arch.color }}>{arch.label}</strong> — {arch.note}
                        </p>
                        <StanceBar breakdown={l.breakdown} total={l.posts} />
                        <div className="mt-3 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-widest opacity-55">
                          <span>{l.wins} of {l.posts} matched</span>
                          {l.faction !== null && <span>cluster {l.faction + 1}</span>}
                          {l.topAlly && (
                            <span>
                              closest:{" "}
                              {data.larvae.find((x) => x.wallet === l.topAlly!.wallet)?.name ||
                                l.topAlly.wallet.slice(0, 8)}{" "}
                              ({Math.round(l.topAlly.rate * 100)}%)
                            </span>
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

/** Distribution of alignment scores — shows how tight the pack really is. */
function Histogram({ larvae, avg }: { larvae: { winRate: number }[]; avg: number }) {
  const BUCKETS = 14;
  const rates = larvae.map((l) => l.winRate);
  if (rates.length === 0) return null;
  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  const span = hi - lo || 0.1;

  const counts = new Array(BUCKETS).fill(0);
  for (const r of rates) {
    const idx = Math.min(BUCKETS - 1, Math.floor(((r - lo) / span) * BUCKETS));
    counts[idx]++;
  }
  const peak = Math.max(...counts) || 1;
  const avgIdx = Math.min(BUCKETS - 1, Math.floor(((avg - lo) / span) * BUCKETS));

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
            title={`${c} larvae`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] uppercase tracking-widest opacity-45">
        <span>{Math.round(lo * 100)}%</span>
        <span style={{ color: GOLD }}>hive avg {Math.round(avg * 100)}%</span>
        <span>{Math.round(hi * 100)}%</span>
      </div>
    </div>
  );
}

function StanceBar({ breakdown, total }: { breakdown: Breakdown; total: number }) {
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
