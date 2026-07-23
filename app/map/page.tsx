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

const INK = "#1e2a3a";
const CORAL = "#e8604c";
const SHEET = "#eef4f1";
const GOLD = "#d4a017";
const SEA = "#3d8b8b";

// Minimum posts for a larva to be plotted — below this the rates are noise.
const MIN_POSTS = 5;

const PAD = { top: 36, right: 28, bottom: 48, left: 56 };
const W = 760;
const H = 520;

export default function MapPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Larva | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showClusters, setShowClusters] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

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
    return data.larvae.filter((l) => showAll || l.posts >= MIN_POSTS);
  }, [data, showAll]);

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

  /** Star edges: hub → other plotted members. Never a complete clique. */
  const clusterLinks = useMemo(() => {
    if (!data) return [] as { a: Larva; b: Larva; color: string; strong: boolean }[];
    const links: { a: Larva; b: Larva; color: string; strong: boolean }[] = [];

    const starFrom = (hub: Larva, members: string[], color: string, strong: boolean) => {
      for (const w of members) {
        if (w === hub.wallet) continue;
        const other = byWallet.get(w);
        if (!other) continue;
        links.push({ a: hub, b: other, color, strong });
      }
    };

    // Selection always reveals that larva's cluster (even if toggle is off).
    if (selected?.faction !== null && selected?.faction !== undefined) {
      const f = data.factions.find((x) => x.id === selected.faction);
      if (f) starFrom(selected, f.members, factionColor(f.id), true);
    } else if (showClusters) {
      // Toggle on, nothing selected: one hub per faction (most posts), not every edge.
      for (const f of data.factions) {
        const members = f.members
          .map((w) => byWallet.get(w))
          .filter(Boolean) as Larva[];
        if (members.length < 2) continue;
        const hub = [...members].sort((a, b) => b.posts - a.posts)[0];
        starFrom(hub, f.members, factionColor(f.id), false);
      }
    }

    return links;
  }, [data, selected, showClusters, byWallet]);

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

  const avgX = data?.hive.avgConviction ?? 0.5;
  const avgY = data?.hive.avgWinRate ?? 0.5;

  // Quadrant label positions (centers of each hive-average quadrant)
  const qLabels = data
    ? [
        {
          key: "quiet",
          label: "Quiet followers",
          hint: "hedge · with swarm",
          x: (scales.xMin + avgX) / 2,
          y: (avgY + scales.yMax) / 2,
        },
        {
          key: "bell",
          label: "Bellwethers",
          hint: "commit · with swarm",
          x: (avgX + scales.xMax) / 2,
          y: (avgY + scales.yMax) / 2,
        },
        {
          key: "hedge",
          label: "Hedgers",
          hint: "hedge · off swarm",
          x: (scales.xMin + avgX) / 2,
          y: (scales.yMin + avgY) / 2,
        },
        {
          key: "diss",
          label: "Dissidents",
          hint: "commit · off swarm",
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
            {/* ── Plot first — the visual is the hero ── */}
            <section
              className="mb-6 rounded-xl border p-4"
              style={{ borderColor: `${INK}22`, background: "#fff" }}
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                    where each larva sits
                  </p>
                  <p className="mt-1 max-w-xl text-sm opacity-70">
                    Left → more hedging · Right → more hard yes/no · Up → matches the swarm more often
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setShowClusters((s) => !s)}
                    className="rounded-md border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-70"
                    style={{
                      borderColor: showClusters ? SEA : `${INK}25`,
                      background: showClusters ? `${SEA}12` : "transparent",
                      color: showClusters ? SEA : INK,
                    }}
                  >
                    {showClusters ? "clusters on" : "show clusters"}
                  </button>
                  <button
                    onClick={() => setShowAll((s) => !s)}
                    className="rounded-md border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition-opacity hover:opacity-70"
                    style={{ borderColor: `${INK}25` }}
                  >
                    {showAll ? `showing all ${data.larvaeCount}` : `${MIN_POSTS}+ posts only`}
                  </button>
                </div>
              </div>

              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 540 }}>
                {/* Soft quadrant wash */}
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

                {/* Quadrant captions */}
                {qLabels.map((q) => (
                  <g key={q.key} opacity={selected ? 0.25 : 0.55} style={{ pointerEvents: "none" }}>
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
                      fontSize="9"
                      fill={INK}
                      fillOpacity={0.55}
                      fontFamily="ui-monospace, monospace"
                    >
                      {q.hint}
                    </text>
                  </g>
                ))}

                {/* Hive-average crosshairs */}
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

                {/* Axes */}
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

                {/* Cluster links — star only, never a complete graph */}
                {clusterLinks.map(({ a, b, color, strong }) => (
                  <line
                    key={`${a.wallet}-${b.wallet}`}
                    x1={px(a.conviction)}
                    y1={py(a.winRate)}
                    x2={px(b.conviction)}
                    y2={py(b.winRate)}
                    stroke={color}
                    strokeOpacity={strong ? 0.45 : 0.28}
                    strokeWidth={strong ? 1.75 : 1.25}
                  />
                ))}

                {/* Dots */}
                {plotted.map((l) => {
                  const isSel = selected?.wallet === l.wallet;
                  const isHov = hovered === l.wallet;
                  const inFocus = !focusSet || focusSet.has(l.wallet);
                  const r = 4 + Math.min(6, Math.sqrt(l.posts) / 2.4);
                  const showLabel = isHov || isSel;
                  return (
                    <g key={l.wallet}>
                      <circle
                        cx={px(l.conviction)}
                        cy={py(l.winRate)}
                        r={isSel || isHov ? r + 3 : r}
                        fill={
                          l.avatar
                            ? `hsl(${l.avatar.hue} 62% 58%)`
                            : `${INK}66`
                        }
                        stroke={
                          isSel
                            ? INK
                            : l.faction !== null
                              ? factionColor(l.faction)
                              : "#fff"
                        }
                        strokeWidth={isSel ? 2.5 : l.faction !== null ? 1.75 : 1}
                        opacity={selected ? (inFocus ? 0.95 : 0.12) : 0.88}
                        style={{ cursor: "pointer", transition: "opacity 140ms ease" }}
                        onMouseEnter={() => setHovered(l.wallet)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => pick(l)}
                      />
                      {showLabel && (
                        <g style={{ pointerEvents: "none" }}>
                          <text
                            x={px(l.conviction)}
                            y={py(l.winRate) - r - 18}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="700"
                            fill={INK}
                          >
                            {l.name}
                          </text>
                          <text
                            x={px(l.conviction)}
                            y={py(l.winRate) - r - 5}
                            textAnchor="middle"
                            fontSize="9"
                            fill={INK}
                            fillOpacity={0.6}
                            fontFamily="ui-monospace, monospace"
                          >
                            {Math.round(l.winRate * 100)}% align · {Math.round(l.conviction * 100)}% conv
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
                {(showClusters || (selected != null && selected.faction !== null)) && (
                  <span>colored ring / link = agreement cluster</span>
                )}
              </div>
              <p className="mt-2 text-xs opacity-50">
                Click a larva to see its place in the swarm
                {selected ? " — links show who it clusters with." : "."}
              </p>
            </section>

            {/* ── Selected larva ── */}
            <div ref={detailRef}>
              {selected && (
                <section
                  className="mb-6 rounded-xl border p-5"
                  style={{ borderColor: `${INK}22`, background: "#fff" }}
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
                        {selected.wallet.slice(0, 10)}…{selected.wallet.slice(-6)}
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
                      label="conviction"
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
                          selected.topAlly.wallet.slice(0, 8)}
                      </strong>{" "}
                      {Math.round(selected.topAlly.rate * 100)}% of the time — its closest
                      neighbour in the swarm.
                    </p>
                  )}
                </section>
              )}
            </div>

            {/* ── Hive summary ── */}
            <section
              className="mb-6 grid grid-cols-2 gap-4 rounded-xl border p-5 sm:grid-cols-4"
              style={{ borderColor: `${INK}22`, background: "#fff" }}
            >
              <Stat label="larvae" value={String(data.larvaeCount)} />
              <Stat label="posts analyzed" value={String(data.postCount)} />
              <Stat
                label="avg alignment"
                value={`${Math.round(data.hive.avgWinRate * 100)}%`}
              />
              <Stat
                label="avg conviction"
                value={`${Math.round(data.hive.avgConviction * 100)}%`}
              />
            </section>

            {/* ── The finding ── */}
            <section
              className="mb-6 rounded-xl border p-5"
              style={{ borderColor: `${GOLD}55`, background: "#fff" }}
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

            {/* ── Factions ── */}
            {data.factions.length > 0 && (
              <section
                className="rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: "#fff" }}
              >
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  clusters
                </p>
                <p className="mt-1 mb-4 text-sm opacity-70">
                  Groups that agree with each other above 70% across at least five shared
                  posts. Small and loosely bound — worth watching, not worth alarm. Turn on
                  “show clusters” above, or click a member, to see them on the map.
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
                          Cluster {f.id + 1} · {f.members.length} members
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

function factionColor(id: number | null) {
  return id === null ? INK : id === 0 ? CORAL : id === 1 ? SEA : GOLD;
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
  const t = total || 1;
  const seg = [
    { key: "approve", n: breakdown.approve, color: "#2d8a56", label: "approve" },
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
