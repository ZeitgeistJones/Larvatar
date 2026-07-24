// app/map/page.tsx
// The Hive Map — every larva plotted by how hard it commits (conviction)
// against how often it lands where the swarm lands (alignment).
//
// The axes are the ones the data actually contains. There is no ideology grid
// here because nothing in the stance record supports one; conviction and
// alignment are measured, not inferred.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type Faction = {
  id: number;
  members: string[];
  names: string[];
  avgWinRate: number;
  cohesion: number;
};

type Hive = {
  avgWinRate: number;
  avgConviction: number;
  stanceMix: Breakdown;
  aggregateStances: Record<string, number>;
};

type Payload = {
  computedAt: string;
  postCount: number;
  larvaeCount: number;
  larvae: Larva[];
  factions: Faction[];
  hive: Hive;
};

// Quiet floor — rates from fewer posts are mostly noise. Always applied.
const MIN_POSTS = 5;

const PAD = { top: 36, right: 28, bottom: 48, left: 56 };
const W = 760;
const H = 520;

function dotRadius(posts: number) {
  return 4 + Math.min(6, Math.sqrt(posts) / 2.4);
}

/**
 * Nudge overlapping dots apart while springing them back toward their true
 * data position — so you can see close neighbors without inventing a new map.
 */
function spreadDots(
  items: { wallet: string; ax: number; ay: number; r: number }[]
): Map<string, { x: number; y: number }> {
  const pts = items.map((it) => ({ ...it, x: it.ax, y: it.ay }));
  const gap = 2.8;
  const xLo = PAD.left + 6;
  const xHi = W - PAD.right - 6;
  const yLo = PAD.top + 6;
  const yHi = H - PAD.bottom - 6;

  for (let iter = 0; iter < 55; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          // Identical coords — fan out on a tiny deterministic spiral
          const ang = ((i * 37 + j * 17) % 360) * (Math.PI / 180);
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          dist = 0.01;
        }
        const min = a.r + b.r + gap;
        if (dist < min) {
          const push = ((min - dist) / 2) * 0.85;
          dx /= dist;
          dy /= dist;
          a.x -= dx * push;
          a.y -= dy * push;
          b.x += dx * push;
          b.y += dy * push;
        }
      }
    }
    for (const p of pts) {
      p.x += (p.ax - p.x) * 0.1;
      p.y += (p.ay - p.y) * 0.1;
      p.x = Math.min(xHi, Math.max(xLo, p.x));
      p.y = Math.min(yHi, Math.max(yLo, p.y));
    }
  }

  return new Map(pts.map((p) => [p.wallet, { x: p.x, y: p.y }]));
}

export default function MapPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, sea: SEA } = colors;

  function factionColor(id: number | null) {
    return id === null ? INK : id === 0 ? CORAL : id === 1 ? SEA : GOLD;
  }

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Larva | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const detailRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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

  const plotted = useMemo(() => {
    if (!data) return [];
    return data.larvae.filter((l) => l.posts >= MIN_POSTS);
  }, [data]);

  const byWallet = useMemo(() => {
    const m = new Map<string, Larva>();
    for (const l of plotted) m.set(l.wallet, l);
    return m;
  }, [plotted]);

  // Scales. Conviction and win rate are both 0-1 but neither uses the full
  // range, so the axes fit the actual spread with a little breathing room.
  const scales = useMemo(() => {
    if (plotted.length === 0) {
      return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    }
    const xs = plotted.map((l) => l.conviction);
    const ys = plotted.map((l) => l.winRate);
    const pad = (lo: number, hi: number) => {
      const span = hi - lo || 0.1;
      return [Math.max(0, lo - span * 0.12), Math.min(1, hi + span * 0.12)];
    };
    const [xMin, xMax] = pad(Math.min(...xs), Math.max(...xs));
    const [yMin, yMax] = pad(Math.min(...ys), Math.max(...ys));
    return { xMin, xMax, yMin, yMax };
  }, [plotted]);

  const px = (v: number) =>
    PAD.left + ((v - scales.xMin) / (scales.xMax - scales.xMin || 1)) * (W - PAD.left - PAD.right);
  const py = (v: number) =>
    H - PAD.bottom - ((v - scales.yMin) / (scales.yMax - scales.yMin || 1)) * (H - PAD.top - PAD.bottom);

  const positions = useMemo(() => {
    return spreadDots(
      plotted.map((l) => ({
        wallet: l.wallet,
        ax: px(l.conviction),
        ay: py(l.winRate),
        r: dotRadius(l.posts),
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotted, scales.xMin, scales.xMax, scales.yMin, scales.yMax]);

  const posOf = (l: Larva) => positions.get(l.wallet) || { x: px(l.conviction), y: py(l.winRate) };

  const qNorm = query.trim().toLowerCase();

  const searchHits = useMemo(() => {
    if (!qNorm) return [] as Larva[];
    return plotted.filter(
      (l) =>
        l.name.toLowerCase().includes(qNorm) ||
        (l.tagline || "").toLowerCase().includes(qNorm) ||
        l.wallet.toLowerCase().includes(qNorm)
    );
  }, [plotted, qNorm]);

  const searchSet = useMemo(() => {
    if (!qNorm) return null as Set<string> | null;
    return new Set(searchHits.map((l) => l.wallet));
  }, [qNorm, searchHits]);

  // When searching: matches on top. Otherwise: large dots under small ones.
  const paintOrder = useMemo(() => {
    const list = [...plotted].sort((a, b) => b.posts - a.posts);
    if (!searchSet) return list;
    return list.sort((a, b) => {
      const am = searchSet.has(a.wallet) ? 1 : 0;
      const bm = searchSet.has(b.wallet) ? 1 : 0;
      if (am !== bm) return am - bm; // matches last = on top
      return b.posts - a.posts;
    });
  }, [plotted, searchSet]);

  /** Star edges from the selected larva only — no global hairball. */
  const clusterLinks = useMemo(() => {
    if (searchSet) return [] as { a: Larva; b: Larva; color: string }[];
    if (!data || !selected || selected.faction === null || selected.faction === undefined) {
      return [] as { a: Larva; b: Larva; color: string }[];
    }
    const f = data.factions.find((x) => x.id === selected.faction);
    if (!f) return [];
    const links: { a: Larva; b: Larva; color: string }[] = [];
    const color = factionColor(f.id);
    for (const w of f.members) {
      if (w === selected.wallet) continue;
      const other = byWallet.get(w);
      if (!other) continue;
      links.push({ a: selected, b: other, color });
    }
    return links;
  }, [data, selected, byWallet, searchSet, INK, CORAL, SEA, GOLD]);

  const focusSet = useMemo(() => {
    if (!selected) return null as Set<string> | null;
    const s = new Set<string>([selected.wallet]);
    if (selected.faction !== null) {
      const f = data?.factions.find((x) => x.id === selected.faction);
      if (f) for (const m of f.members) s.add(m);
    }
    if (selected.topAlly) s.add(selected.topAlly.wallet);
    return s;
  }, [selected, data]);

  function pick(l: Larva) {
    setSelected(l);
    setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }

  function isolate(l: Larva) {
    setQuery(l.name);
    pick(l);
  }

  // Unique search hit → isolate it automatically.
  useEffect(() => {
    if (!qNorm) return;
    if (searchHits.length !== 1) return;
    const hit = searchHits[0];
    if (selected?.wallet !== hit.wallet) pick(hit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qNorm, searchHits]);

  const avgX = data?.hive.avgConviction ?? 0.5;
  const avgY = data?.hive.avgWinRate ?? 0.5;

  // Plain-English quadrant captions
  const qLabels = data
    ? [
        {
          key: "soft-with",
          label: "Soft takes,",
          hint: "with the room",
          x: (scales.xMin + avgX) / 2,
          y: (avgY + scales.yMax) / 2,
        },
        {
          key: "hard-with",
          label: "Hard takes,",
          hint: "with the room",
          x: (avgX + scales.xMax) / 2,
          y: (avgY + scales.yMax) / 2,
        },
        {
          key: "soft-against",
          label: "Soft takes,",
          hint: "against the room",
          x: (scales.xMin + avgX) / 2,
          y: (scales.yMin + avgY) / 2,
        },
        {
          key: "hard-against",
          label: "Hard takes,",
          hint: "against the room",
          x: (avgX + scales.xMax) / 2,
          y: (scales.yMin + avgY) / 2,
        },
      ]
    : [];

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-5xl">
        <Nav />
        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">The Hive Map</h1>
          <p className="mt-2 max-w-2xl text-sm opacity-75">
            Every larva placed by two measured traits: how often it commits to a hard yes or
            no rather than hedging, and how often it ends up where the swarm ends up.
          </p>
        </header>

        {loading && <p className="text-sm opacity-60">loading the swarm…</p>}
        {error && (
          <p className="text-sm" style={{ color: CORAL }}>
            {error}
          </p>
        )}

        {data && (
          <>
            <section
              className="mb-6 rounded-xl border p-4"
              style={{ borderColor: `${INK}22`, background: CARD }}
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                    where each larva sits
                  </p>
                  <p className="mt-1 max-w-xl text-sm opacity-70">
                    Left → more hedging · Right → more hard yes/no · Up → matches the swarm more often
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="find a larva…"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ borderColor: `${INK}25`, background: SHEET }}
                  />
                  {qNorm && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        setSelected(null);
                        searchRef.current?.focus();
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-widest opacity-45 hover:opacity-90"
                    >
                      clear
                    </button>
                  )}
                  {qNorm && searchHits.length > 1 && (
                    <div
                      className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border shadow-sm"
                      style={{ borderColor: `${INK}22`, background: CARD }}
                    >
                      {searchHits.slice(0, 10).map((l) => (
                        <button
                          key={l.wallet}
                          type="button"
                          onClick={() => isolate(l)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:opacity-80"
                          style={{
                            background:
                              selected?.wallet === l.wallet ? `${GOLD}18` : "transparent",
                          }}
                        >
                          <span className="truncate font-semibold">{l.name}</span>
                          <span className="shrink-0 font-mono text-[10px] opacity-45">
                            {Math.round(l.winRate * 100)}%
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {qNorm && searchHits.length === 0 && (
                    <p className="mt-1 text-xs opacity-50">No larva matched “{query.trim()}”.</p>
                  )}
                  {qNorm && searchHits.length === 1 && (
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-widest opacity-45">
                      isolating {searchHits[0].name}
                    </p>
                  )}
                  {qNorm && searchHits.length > 1 && (
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-widest opacity-45">
                      {searchHits.length} matches — pick one
                    </p>
                  )}
                </div>
              </div>

              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 540 }}>
                <rect
                  x={px(scales.xMin)}
                  y={py(scales.yMax)}
                  width={px(avgX) - px(scales.xMin)}
                  height={py(avgY) - py(scales.yMax)}
                  fill={SEA}
                  opacity={0.045}
                />
                <rect
                  x={px(avgX)}
                  y={py(scales.yMax)}
                  width={px(scales.xMax) - px(avgX)}
                  height={py(avgY) - py(scales.yMax)}
                  fill={GOLD}
                  opacity={0.05}
                />
                <rect
                  x={px(scales.xMin)}
                  y={py(avgY)}
                  width={px(avgX) - px(scales.xMin)}
                  height={py(scales.yMin) - py(avgY)}
                  fill={INK}
                  opacity={0.03}
                />
                <rect
                  x={px(avgX)}
                  y={py(avgY)}
                  width={px(scales.xMax) - px(avgX)}
                  height={py(scales.yMin) - py(avgY)}
                  fill={CORAL}
                  opacity={0.045}
                />

                {qLabels.map((q) => (
                  <g key={q.key} opacity={selected ? 0.22 : 0.5} style={{ pointerEvents: "none" }}>
                    <text
                      x={px(q.x)}
                      y={py(q.y) - 6}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill={INK}
                      fontFamily="ui-sans-serif, system-ui, sans-serif"
                    >
                      {q.label}
                    </text>
                    <text
                      x={px(q.x)}
                      y={py(q.y) + 8}
                      textAnchor="middle"
                      fontSize="10"
                      fill={INK}
                      fillOpacity={0.65}
                      fontFamily="ui-sans-serif, system-ui, sans-serif"
                    >
                      {q.hint}
                    </text>
                  </g>
                ))}

                <line
                  x1={px(avgX)}
                  y1={PAD.top}
                  x2={px(avgX)}
                  y2={H - PAD.bottom}
                  stroke={INK}
                  strokeOpacity={0.2}
                  strokeDasharray="4 4"
                />
                <line
                  x1={PAD.left}
                  y1={py(avgY)}
                  x2={W - PAD.right}
                  y2={py(avgY)}
                  stroke={INK}
                  strokeOpacity={0.2}
                  strokeDasharray="4 4"
                />

                <line
                  x1={PAD.left}
                  y1={H - PAD.bottom}
                  x2={W - PAD.right}
                  y2={H - PAD.bottom}
                  stroke={INK}
                  strokeOpacity={0.3}
                />
                <line
                  x1={PAD.left}
                  y1={PAD.top}
                  x2={PAD.left}
                  y2={H - PAD.bottom}
                  stroke={INK}
                  strokeOpacity={0.3}
                />

                <text
                  x={(PAD.left + W - PAD.right) / 2}
                  y={H - 12}
                  textAnchor="middle"
                  fontSize="11"
                  fill={INK}
                  fillOpacity={0.55}
                  fontFamily="ui-monospace, monospace"
                  letterSpacing="1"
                >
                  HARDER STANCES →
                </text>
                <text
                  x={-(PAD.top + H - PAD.bottom) / 2}
                  y={14}
                  transform="rotate(-90)"
                  textAnchor="middle"
                  fontSize="11"
                  fill={INK}
                  fillOpacity={0.55}
                  fontFamily="ui-monospace, monospace"
                  letterSpacing="1"
                >
                  MORE OFTEN WITH THE SWARM →
                </text>

                {[scales.xMin, (scales.xMin + scales.xMax) / 2, scales.xMax].map((v, i) => (
                  <text
                    key={`x${i}`}
                    x={px(v)}
                    y={H - PAD.bottom + 16}
                    textAnchor="middle"
                    fontSize="10"
                    fill={INK}
                    fillOpacity={0.45}
                    fontFamily="ui-monospace, monospace"
                  >
                    {Math.round(v * 100)}%
                  </text>
                ))}
                {[scales.yMin, (scales.yMin + scales.yMax) / 2, scales.yMax].map((v, i) => (
                  <text
                    key={`y${i}`}
                    x={PAD.left - 8}
                    y={py(v) + 3}
                    textAnchor="end"
                    fontSize="10"
                    fill={INK}
                    fillOpacity={0.45}
                    fontFamily="ui-monospace, monospace"
                  >
                    {Math.round(v * 100)}%
                  </text>
                ))}

                {clusterLinks.map(({ a, b, color }) => {
                  const pa = posOf(a);
                  const pb = posOf(b);
                  return (
                    <line
                      key={`${a.wallet}-${b.wallet}`}
                      x1={pa.x}
                      y1={pa.y}
                      x2={pb.x}
                      y2={pb.y}
                      stroke={color}
                      strokeOpacity={0.4}
                      strokeWidth={1.5}
                    />
                  );
                })}

                {paintOrder.map((l) => {
                  const isSel = selected?.wallet === l.wallet;
                  const isHov = hovered === l.wallet;
                  const isMatch = !searchSet || searchSet.has(l.wallet);
                  const inFocus = !focusSet || focusSet.has(l.wallet);
                  const isolated = Boolean(searchSet);
                  const visible = isolated ? isMatch : !selected || inFocus;
                  const r = dotRadius(l.posts);
                  const { x, y } = posOf(l);
                  const showLabel = isMatch && (isHov || isSel || (isolated && searchHits.length <= 3));
                  return (
                    <g
                      key={l.wallet}
                      style={{ pointerEvents: visible ? "auto" : "none" }}
                    >
                      <circle
                        cx={x}
                        cy={y}
                        r={isSel || isHov || (isolated && isMatch) ? r + 2.5 : r}
                        fill={
                          l.avatar
                            ? `hsl(${l.avatar.hue} 62% 58%)`
                            : `${INK}66`
                        }
                        stroke={
                          isSel || (isolated && isMatch)
                            ? INK
                            : l.faction !== null
                              ? factionColor(l.faction)
                              : CARD
                        }
                        strokeWidth={isSel || (isolated && isMatch) ? 2.5 : l.faction !== null ? 1.5 : 1}
                        opacity={
                          isolated
                            ? isMatch
                              ? 1
                              : 0.04
                            : selected
                              ? inFocus
                                ? 0.95
                                : 0.14
                              : 0.9
                        }
                        style={{ cursor: visible ? "pointer" : "default", transition: "opacity 140ms ease" }}
                        onMouseEnter={() => visible && setHovered(l.wallet)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => visible && pick(l)}
                      />
                      {showLabel && (
                        <g style={{ pointerEvents: "none" }}>
                          <text
                            x={x}
                            y={y - r - 18}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="700"
                            fill={INK}
                          >
                            {l.name}
                          </text>
                          <text
                            x={x}
                            y={y - r - 5}
                            textAnchor="middle"
                            fontSize="9"
                            fill={INK}
                            fillOpacity={0.6}
                            fontFamily="ui-monospace, monospace"
                          >
                            {Math.round(l.winRate * 100)}% align · {Math.round(l.conviction * 100)}% hard
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>

              <div className="mt-2 flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-widest opacity-50">
                <span>dot size = posts answered</span>
                <span>dot color = specimen</span>
                <span>dashed = hive average</span>
                <span>nearby dots nudged apart so they don&apos;t stack</span>
              </div>
              <p className="mt-2 text-xs opacity-50">
                {qNorm
                  ? "Search isolates matches — everyone else fades out."
                  : "Click a larva to see its place in the swarm"}
                {!qNorm && selected && selected.faction !== null
                  ? " — lines show who it tends to agree with."
                  : !qNorm
                    ? "."
                    : ""}
              </p>
            </section>

            <div ref={detailRef}>
              {selected && (
                <section
                  className="mb-6 rounded-xl border p-5"
                  style={{ borderColor: `${INK}22`, background: CARD }}
                >
                  <div className="flex items-start gap-4">
                    {selected.avatar && (
                      <div className="shrink-0">
                        <LarvaAvatar
                          hue={selected.avatar.hue}
                          tone={selected.avatar.tone}
                          traits={selected.avatar}
                          size={72}
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-bold">{selected.name}</h2>
                          {selected.tagline && (
                            <p className="text-sm opacity-70">{selected.tagline}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setSelected(null)}
                          className="shrink-0 font-mono text-[10px] uppercase tracking-widest opacity-40 hover:opacity-80"
                        >
                          close
                        </button>
                      </div>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest opacity-40">
                        {selected.ens ||
                          `${selected.wallet.slice(0, 10)}…${selected.wallet.slice(-6)}`}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-4 sm:grid-cols-4" style={{ borderColor: `${INK}15` }}>
                    <Stat label="posts" value={String(selected.posts)} />
                    <Stat
                      label="alignment"
                      value={`${Math.round(selected.winRate * 100)}%`}
                      accent={selected.winRate > data.hive.avgWinRate ? GOLD : undefined}
                    />
                    <Stat
                      label="hard takes"
                      value={`${Math.round(selected.conviction * 100)}%`}
                      accent={selected.conviction > data.hive.avgConviction ? CORAL : undefined}
                    />
                    <Stat
                      label="lean"
                      value={
                        selected.lean > 0.15
                          ? "approving"
                          : selected.lean < -0.15
                            ? "skeptical"
                            : "balanced"
                      }
                    />
                  </div>

                  <div className="mt-4">
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest opacity-50">
                      stance mix
                    </p>
                    <StanceBar breakdown={selected.breakdown} total={selected.posts} />
                  </div>

                  {selected.topAlly && (
                    <p className="mt-4 text-sm opacity-75">
                      Votes with{" "}
                      <strong>
                        {data.larvae.find((l) => l.wallet === selected.topAlly!.wallet)?.name ||
                          data.larvae.find((l) => l.wallet === selected.topAlly!.wallet)?.ens ||
                          selected.topAlly.wallet.slice(0, 8)}
                      </strong>{" "}
                      {Math.round(selected.topAlly.rate * 100)}% of the time — its closest
                      neighbour in the swarm.
                    </p>
                  )}
                </section>
              )}
            </div>

            <section
              className="mb-6 grid grid-cols-2 gap-4 rounded-xl border p-5 sm:grid-cols-4"
              style={{ borderColor: `${INK}22`, background: CARD }}
            >
              <Stat label="larvae" value={String(data.larvaeCount)} />
              <Stat label="posts analyzed" value={String(data.postCount)} />
              <Stat
                label="avg alignment"
                value={`${Math.round(data.hive.avgWinRate * 100)}%`}
              />
              <Stat
                label="avg hard takes"
                value={`${Math.round(data.hive.avgConviction * 100)}%`}
              />
            </section>

            <section
              className="mb-6 rounded-xl border p-5"
              style={{ borderColor: `${GOLD}55`, background: CARD }}
            >
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                what the data says
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                The swarm hedges. Conditional is the single most common stance at{" "}
                <strong>{Math.round(data.hive.stanceMix.conditional * 100)}%</strong> of all
                positions taken, against {Math.round(data.hive.stanceMix.approve * 100)}% approve
                and {Math.round(data.hive.stanceMix.disapprove * 100)}% disapprove. No larva
                clears a {Math.round(Math.max(...data.larvae.map((l) => l.winRate)) * 100)}%
                alignment rate, and the curve down from there is smooth — there is no bloc
                riding the consensus, and no wallet that reliably calls the room.
              </p>
            </section>

            {data.factions.length > 0 && (
              <section
                className="rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: CARD }}
              >
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  agreement groups
                </p>
                <p className="mt-1 mb-4 text-sm opacity-70">
                  Groups that agree with each other above 70% across at least five shared
                  posts. Small and loosely bound — click a member on the map to see the links.
                </p>
                <div className="space-y-3">
                  {data.factions.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-lg border p-4"
                      style={{ borderColor: `${factionColor(f.id)}44` }}
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-bold" style={{ color: factionColor(f.id) }}>
                          Group {f.id + 1} · {f.members.length} members
                        </p>
                        <p className="font-mono text-[10px] uppercase tracking-widest opacity-55">
                          {Math.round(f.cohesion * 100)}% internal agreement ·{" "}
                          {Math.round(f.avgWinRate * 100)}% alignment
                        </p>
                      </div>
                      <p className="mt-2 text-sm opacity-75">{f.names.join(" · ")}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* ─── Small pieces ─────────────────────────────────────────────────── */

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">{label}</p>
      <p className="text-2xl font-bold" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
    </div>
  );
}

function StanceBar({
  breakdown,
  total,
}: {
  breakdown: Breakdown;
  total: number;
}) {
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
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: s.color }}
            />
            {s.label} {s.n}
          </span>
        ))}
      </div>
    </>
  );
}
