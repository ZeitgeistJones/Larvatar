"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";
import {
  type MoralLabel,
  type MoralResult,
} from "@/lib/moral";
import { moralMapCoords, moralMargin } from "@/lib/moral-map";

type ListPayload = {
  results: MoralResult[];
  grid: MoralLabel[][];
  count: number;
};

type Specimen = {
  wallet: string;
  profile: { name: string; tone: string };
};

function walletHue(wallet: string): number {
  let h = 0;
  for (const c of wallet.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const PAD = { top: 36, right: 28, bottom: 48, left: 56 };
const W = 760;
const H = 520;

function spreadDots(
  items: { wallet: string; ax: number; ay: number; r: number }[]
): Map<string, { x: number; y: number }> {
  const pts = items.map((it) => ({ ...it, x: it.ax, y: it.ay }));
  const gap = 2.4;
  const xLo = PAD.left + 6;
  const xHi = W - PAD.right - 6;
  const yLo = PAD.top + 6;
  const yHi = H - PAD.bottom - 6;

  for (let iter = 0; iter < 45; iter++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
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
      p.x += (p.ax - p.x) * 0.12;
      p.y += (p.ay - p.y) * 0.12;
      p.x = Math.min(xHi, Math.max(xLo, p.x));
      p.y = Math.min(yHi, Math.max(yLo, p.y));
    }
  }
  return new Map(pts.map((p) => [p.wallet, { x: p.x, y: p.y }]));
}

function MoralScatter({
  results,
  active,
  onSelect,
  filterLabel,
}: {
  results: MoralResult[];
  active: MoralResult | null;
  onSelect: (r: MoralResult) => void;
  filterLabel: MoralLabel | null;
}) {
  const { colors } = useTheme();
  const { ink: INK, coral: CORAL, gold: GOLD, sea: SEA } = colors;
  const [hovered, setHovered] = useState<string | null>(null);

  const plotted = useMemo(() => {
    return results.map((r) => {
      const { x, y } = moralMapCoords(r);
      return { ...r, mx: x, my: y, margin: moralMargin(r) };
    });
  }, [results]);

  const closest = useMemo(() => {
    if (plotted.length === 0) return null;
    return [...plotted].sort(
      (a, b) => Math.hypot(a.mx, a.my) - Math.hypot(b.mx, b.my)
    )[0];
  }, [plotted]);

  const deepest = useMemo(() => {
    if (plotted.length === 0) return null;
    return [...plotted].sort((a, b) => b.margin - a.margin)[0];
  }, [plotted]);

  const scales = useMemo(() => {
    if (plotted.length === 0) return { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
    const xs = plotted.map((p) => p.mx);
    const ys = plotted.map((p) => p.my);
    const pad = (lo: number, hi: number) => {
      const span = Math.max(hi - lo, 0.35);
      return [lo - span * 0.12, hi + span * 0.12];
    };
    let [xMin, xMax] = pad(Math.min(...xs), Math.max(...xs));
    let [yMin, yMax] = pad(Math.min(...ys), Math.max(...ys));
    xMin = Math.min(xMin, -0.05);
    xMax = Math.max(xMax, 0.05);
    yMin = Math.min(yMin, -0.05);
    yMax = Math.max(yMax, 0.05);
    return { xMin, xMax, yMin, yMax };
  }, [plotted]);

  const px = (v: number) =>
    PAD.left +
    ((v - scales.xMin) / (scales.xMax - scales.xMin || 1)) * (W - PAD.left - PAD.right);
  const py = (v: number) =>
    H -
    PAD.bottom -
    ((v - scales.yMin) / (scales.yMax - scales.yMin || 1)) * (H - PAD.top - PAD.bottom);

  const positions = useMemo(() => {
    return spreadDots(
      plotted.map((p) => ({
        wallet: p.wallet,
        ax: px(p.mx),
        ay: py(p.my),
        r: 5 + Math.min(4, p.margin / 6),
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotted, scales.xMin, scales.xMax, scales.yMin, scales.yMax]);

  if (plotted.length === 0) {
    return (
      <section className="mb-8">
        <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
          moral map · variation
        </p>
        <p className="mt-2 text-sm opacity-60">No larvae in this quadrant yet.</p>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
            moral map · variation
            {filterLabel ? ` · ${filterLabel}` : ""}
          </p>
          <p className="mt-1 max-w-xl text-sm opacity-70">
            {filterLabel
              ? `Showing only ${filterLabel} — click the compass again (or Clear) to see everyone.`
              : "Every larva as a dot. Click a compass quadrant to isolate one alignment."}
          </p>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-widest opacity-55">
          {closest && (
            <p>
              closest to center ·{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                style={{ color: GOLD }}
                onClick={() => onSelect(closest)}
              >
                {closest.name}
              </button>
            </p>
          )}
          {deepest && deepest.wallet !== closest?.wallet && (
            <p className="mt-0.5">
              strongest margin ·{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                style={{ color: CORAL }}
                onClick={() => onSelect(deepest)}
              >
                {deepest.name}
              </button>
            </p>
          )}
        </div>
      </div>

      <div
        className="overflow-hidden rounded-xl border"
        style={{ borderColor: `${INK}18`, background: `${INK}04` }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 540 }}>
          {[
            { x0: -1, x1: -1 / 3, y0: -1, y1: -1 / 3, c: SEA },
            { x0: -1 / 3, x1: 1 / 3, y0: -1, y1: -1 / 3, c: SEA },
            { x0: 1 / 3, x1: 1, y0: -1, y1: -1 / 3, c: SEA },
            { x0: -1, x1: -1 / 3, y0: -1 / 3, y1: 1 / 3, c: INK },
            { x0: -1 / 3, x1: 1 / 3, y0: -1 / 3, y1: 1 / 3, c: GOLD },
            { x0: 1 / 3, x1: 1, y0: -1 / 3, y1: 1 / 3, c: INK },
            { x0: -1, x1: -1 / 3, y0: 1 / 3, y1: 1, c: CORAL },
            { x0: -1 / 3, x1: 1 / 3, y0: 1 / 3, y1: 1, c: CORAL },
            { x0: 1 / 3, x1: 1, y0: 1 / 3, y1: 1, c: CORAL },
          ].map((b, i) => {
            const x = px(Math.max(scales.xMin, b.x0));
            const x2 = px(Math.min(scales.xMax, b.x1));
            const y = py(Math.min(scales.yMax, b.y1));
            const y2 = py(Math.max(scales.yMin, b.y0));
            if (x2 <= x || y2 <= y) return null;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={x2 - x}
                height={y2 - y}
                fill={b.c}
                opacity={0.04}
              />
            );
          })}

          <line
            x1={px(0)}
            y1={PAD.top}
            x2={px(0)}
            y2={H - PAD.bottom}
            stroke={INK}
            strokeOpacity={0.22}
            strokeDasharray="4 4"
          />
          <line
            x1={PAD.left}
            y1={py(0)}
            x2={W - PAD.right}
            y2={py(0)}
            stroke={INK}
            strokeOpacity={0.22}
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
            CHAOTIC →
          </text>
          <text
            x={PAD.left + 4}
            y={H - 12}
            fontSize="10"
            fill={INK}
            fillOpacity={0.4}
            fontFamily="ui-monospace, monospace"
          >
            ← LAWFUL
          </text>
          <text
            x={14}
            y={(PAD.top + H - PAD.bottom) / 2}
            transform={`rotate(-90 14 ${(PAD.top + H - PAD.bottom) / 2})`}
            textAnchor="middle"
            fontSize="11"
            fill={INK}
            fillOpacity={0.55}
            fontFamily="ui-monospace, monospace"
            letterSpacing="1"
          >
            EVIL →
          </text>
          <text
            x={PAD.left + 8}
            y={PAD.top + 14}
            fontSize="10"
            fill={INK}
            fillOpacity={0.4}
            fontFamily="ui-monospace, monospace"
          >
            GOOD
          </text>

          {[...plotted]
            .sort((a, b) => a.margin - b.margin)
            .map((p) => {
              const pos = positions.get(p.wallet) || { x: px(p.mx), y: py(p.my) };
              const isSel = active?.wallet === p.wallet;
              const isHov = hovered === p.wallet;
              const r = 5 + Math.min(4, p.margin / 6);
              const hue = walletHue(p.wallet);
              return (
                <g key={p.wallet}>
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={isSel || isHov ? r + 2.5 : r}
                    fill={`hsl(${hue} 58% 55%)`}
                    fillOpacity={isSel || isHov ? 1 : 0.78}
                    stroke={isSel ? CORAL : isHov ? GOLD : "transparent"}
                    strokeWidth={isSel || isHov ? 2 : 0}
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelect(p)}
                    onMouseEnter={() => setHovered(p.wallet)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <title>
                      {p.name} · {p.label} · margin {p.margin}
                    </title>
                  </circle>
                  {(isSel || isHov) && (
                    <text
                      x={pos.x}
                      y={pos.y - r - 6}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="600"
                      fill={INK}
                      style={{ pointerEvents: "none" }}
                    >
                      {p.name}
                    </text>
                  )}
                </g>
              );
            })}
        </svg>
        <div
          className="flex flex-wrap justify-between gap-2 border-t px-3 py-2 font-mono text-[10px] uppercase tracking-widest opacity-45"
          style={{ borderColor: `${INK}12` }}
        >
          <span>dot size ≈ how clear the alignment win was</span>
          <span>crosshair = true neutral</span>
          <span>nearby dots nudged apart</span>
        </div>
      </div>
    </section>
  );
}

export default function MoralClient() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, sea: SEA } = colors;
  const search = useSearchParams();

  const [results, setResults] = useState<MoralResult[]>([]);
  const [grid, setGrid] = useState<MoralLabel[][]>([
    ["Lawful Good", "Neutral Good", "Chaotic Good"],
    ["Lawful Neutral", "True Neutral", "Chaotic Neutral"],
    ["Lawful Evil", "Neutral Evil", "Chaotic Evil"],
  ]);
  const [active, setActive] = useState<MoralResult | null>(null);
  const [filterLabel, setFilterLabel] = useState<MoralLabel | null>(null);
  /** Peek another option’s wording without leaving this larva — `{ qId, choice }`. */
  const [peek, setPeek] = useState<{ qId: string; choice: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [specimens, setSpecimens] = useState<Specimen[]>([]);
  const [pick, setPick] = useState("");
  const [filter, setFilter] = useState("");
  const autoWallet = search.get("wallet")?.trim().toLowerCase() || "";
  const autoRan = useRef(false);

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
    fetch("/api/larvae")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.larvae || []) as Specimen[];
        setSpecimens(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!active && results[0]) setActive(results[0]);
  }, [results, active]);

  const runTest = useCallback(async (wallet?: string) => {
    setRunning(true);
    setError("");
    try {
      const body = wallet ? { wallet } : {};
      const res = await fetch("/api/larvae/moral", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
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
  }, []);

  useEffect(() => {
    if (autoRan.current) return;
    if (!autoWallet || !/^0x[a-f0-9]{40}$/.test(autoWallet)) return;
    autoRan.current = true;
    setPick(autoWallet);
    void runTest(autoWallet);
  }, [autoWallet, runTest]);

  const specimenOptions = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return specimens.slice(0, 120);
    return specimens
      .filter(
        (s) =>
          s.profile.name.toLowerCase().includes(q) ||
          s.wallet.toLowerCase().includes(q) ||
          s.profile.tone.toLowerCase().includes(q)
      )
      .slice(0, 120);
  }, [specimens, filter]);

  const byLabel = useMemo(() => {
    const m = new Map<string, MoralResult[]>();
    for (const r of results) {
      const list = m.get(r.label) || [];
      list.push(r);
      m.set(r.label, list);
    }
    for (const [, list] of m) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return m;
  }, [results]);

  const quadrantLarvae = useMemo(() => {
    if (!filterLabel) return results;
    return byLabel.get(filterLabel) || [];
  }, [results, filterLabel, byLabel]);

  /** Hive-wide choice tallies per question id → [c1,c2,c3,c4]. */
  const answerTallies = useMemo(() => {
    const map = new Map<string, [number, number, number, number]>();
    for (const r of results) {
      for (const a of r.answers || []) {
        const c = Math.round(Number(a.choice));
        if (c < 1 || c > 4) continue;
        let row = map.get(a.id);
        if (!row) {
          row = [0, 0, 0, 0];
          map.set(a.id, row);
        }
        row[c - 1] += 1;
      }
    }
    return map;
  }, [results]);

  /** First-seen wording for each question×choice (from whoever picked it). */
  const choiceWording = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of results) {
      for (const a of r.answers || []) {
        const c = Math.round(Number(a.choice));
        if (c < 1 || c > 4 || !a.answer) continue;
        const key = `${a.id}:${c}`;
        if (!m.has(key)) m.set(key, a.answer);
      }
    }
    return m;
  }, [results]);

  // Drop peek when switching larvae
  useEffect(() => {
    setPeek(null);
  }, [active?.wallet]);

  function selectQuadrant(label: MoralLabel) {
    const cell = byLabel.get(label) || [];
    if (cell.length === 0) return;
    if (filterLabel === label) {
      setFilterLabel(null);
      return;
    }
    setFilterLabel(label);
    setActive(cell[0]);
  }

  function cellColor(label: MoralLabel) {
    if (label.includes("Good")) return `${SEA}22`;
    if (label.includes("Evil")) return `${CORAL}22`;
    return `${INK}08`;
  }

  const pickedName =
    specimens.find((s) => s.wallet.toLowerCase() === pick.toLowerCase())?.profile.name ||
    null;

  const activeMargin = active ? moralMargin(active) : 0;

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
            Thirty-six classic EasyDamus questions. Each larva picks in character — values, tone,
            quirks — then the real answer key lands them on the nine-box compass. Separate from Track
            Record (that’s swarm agreement, not morals).{" "}
            <a
              href="https://easydamus.com/alignmenttest.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 opacity-90 hover:opacity-100"
            >
              Based on the EasyDamus Alignment Test
            </a>
            .
          </p>

          <div
            className="mt-5 rounded-xl border p-4"
            style={{ borderColor: `${INK}18`, background: CARD }}
          >
            <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
              pick a larva
            </p>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by name, tone, or wallet…"
              className="mt-2 w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: `${INK}25`, background: SHEET }}
            />
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="mt-2 w-full rounded-lg border px-3 py-2.5 text-sm outline-none"
              style={{ borderColor: `${INK}25`, background: SHEET }}
            >
              <option value="">Select a specimen…</option>
              {specimenOptions.map((s) => (
                <option key={s.wallet} value={s.wallet}>
                  {s.profile.name} · {s.profile.tone}
                </option>
              ))}
            </select>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runTest(pick)}
                disabled={running || !pick}
                className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: CORAL }}
              >
                {running && pick
                  ? `testing ${pickedName || "larva"}…`
                  : pickedName
                    ? `Test ${pickedName}`
                    : "Test selected larva"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPick("");
                  void runTest();
                }}
                disabled={running}
                className="rounded-lg border px-4 py-2.5 text-sm disabled:opacity-40"
                style={{ borderColor: `${INK}25` }}
              >
                {running && !pick ? "testing…" : "Random larva"}
              </button>
            </div>
          </div>
        </header>

        {error && (
          <p className="mb-4 text-sm" style={{ color: CORAL }}>
            {error}
          </p>
        )}

        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
              hive compass · {results.length} tested
              {filterLabel ? ` · viewing ${quadrantLarvae.length}` : ""}
            </p>
            {filterLabel && (
              <button
                type="button"
                onClick={() => setFilterLabel(null)}
                className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest"
                style={{ borderColor: CORAL, color: CORAL, background: `${CORAL}10` }}
              >
                Clear filter · show all
              </button>
            )}
          </div>
          <p className="mb-3 text-xs opacity-60">
            Click a quadrant to isolate it on the map and roster. Click again to clear.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {grid.flat().map((label) => {
              const cell = byLabel.get(label) || [];
              const selected = filterLabel === label;
              const empty = cell.length === 0;
              return (
                <button
                  key={label}
                  type="button"
                  disabled={empty}
                  onClick={() => selectQuadrant(label)}
                  className="min-h-[88px] rounded-xl border p-3 text-left transition-shadow hover:shadow-md disabled:cursor-default disabled:opacity-40 disabled:hover:shadow-none"
                  style={{
                    borderColor: selected ? CORAL : `${INK}18`,
                    background: cellColor(label),
                    boxShadow: selected ? `inset 0 0 0 1px ${CORAL}` : undefined,
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

        {/* Roster right under compass — only the selected quadrant */}
        {filterLabel && quadrantLarvae.length > 0 && (
          <section
            className="mb-6 rounded-xl border p-4"
            style={{ borderColor: `${CORAL}55`, background: CARD }}
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: CORAL }}>
                {filterLabel} · {quadrantLarvae.length} larva
                {quadrantLarvae.length === 1 ? "" : "e"}
              </p>
              <p className="text-xs opacity-55">Tap a name · map below is filtered to these</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {quadrantLarvae.map((r) => (
                <button
                  key={r.wallet}
                  type="button"
                  onClick={() => setActive(r)}
                  className="rounded-full border px-3 py-1.5 text-xs"
                  style={{
                    borderColor: active?.wallet === r.wallet ? CORAL : `${INK}22`,
                    background: active?.wallet === r.wallet ? `${CORAL}14` : "transparent",
                    color: active?.wallet === r.wallet ? CORAL : INK,
                  }}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {!loading && results.length > 0 && (
          <MoralScatter
            results={quadrantLarvae}
            active={active}
            onSelect={setActive}
            filterLabel={filterLabel}
          />
        )}

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
                  {active.tone} · tested {new Date(active.testedAt).toLocaleDateString()} ·{" "}
                  {active.answers.length} answers
                  {active.scores ? ` · margin ${activeMargin}` : ""}
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
              {active.goodEvil >= 0 ? `+${active.goodEvil}` : active.goodEvil} (−2 lawful/good … +2
              chaotic/evil)
            </p>

            <div className="mt-5 space-y-4">
              {active.answers.map((a) => {
                const tallies = answerTallies.get(a.id) || [0, 0, 0, 0];
                const total = tallies.reduce((s, n) => s + n, 0);
                const chosen = Math.round(Number(a.choice));
                const chosenN =
                  chosen >= 1 && chosen <= 4 ? tallies[chosen - 1] : 0;
                const pct =
                  total > 0 ? Math.round((chosenN / total) * 100) : 0;
                const peeking =
                  peek?.qId === a.id && peek.choice >= 1 && peek.choice <= 4
                    ? peek.choice
                    : null;
                const peekText = peeking
                  ? choiceWording.get(`${a.id}:${peeking}`)
                  : null;
                return (
                  <div key={a.id} className="border-t pt-3" style={{ borderColor: `${INK}12` }}>
                    <p className="text-xs font-medium opacity-55">{a.prompt}</p>
                    <p className="mt-1.5 text-sm leading-snug">“{a.answer}”</p>
                    {total > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                          {chosenN} of {total} chose this · {pct}%
                          <span className="normal-case tracking-normal opacity-70">
                            {" "}
                            · tap A–D to read that option
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {tallies.map((n, i) => {
                            const letter = "ABCD"[i];
                            const opt = i + 1;
                            const isChosen = opt === chosen;
                            const isPeek = peeking === opt;
                            const share = total > 0 ? Math.round((n / total) * 100) : 0;
                            const wording =
                              choiceWording.get(`${a.id}:${opt}`) ||
                              `Option ${letter} (no larva picked this)`;
                            return (
                              <button
                                key={letter}
                                type="button"
                                title={wording}
                                onClick={() =>
                                  setPeek((prev) =>
                                    prev?.qId === a.id && prev.choice === opt
                                      ? null
                                      : { qId: a.id, choice: opt }
                                  )
                                }
                                className="inline-flex items-baseline gap-1.5 rounded-md border px-2 py-1 text-left"
                                style={{
                                  borderColor: isPeek
                                    ? GOLD
                                    : isChosen
                                      ? CORAL
                                      : `${INK}18`,
                                  background: isPeek
                                    ? `${GOLD}14`
                                    : isChosen
                                      ? `${CORAL}12`
                                      : "transparent",
                                }}
                              >
                                <span
                                  className="font-mono text-[9px] font-bold uppercase tracking-widest"
                                  style={{
                                    color: isPeek
                                      ? GOLD
                                      : isChosen
                                        ? CORAL
                                        : `${INK}55`,
                                  }}
                                >
                                  {letter}
                                </span>
                                <span
                                  className="text-xs font-semibold tabular-nums"
                                  style={{
                                    color: isPeek
                                      ? GOLD
                                      : isChosen
                                        ? CORAL
                                        : INK,
                                  }}
                                >
                                  {n}
                                </span>
                                <span
                                  className="font-mono text-[10px] tabular-nums"
                                  style={{
                                    color: isPeek
                                      ? GOLD
                                      : isChosen
                                        ? CORAL
                                        : `${INK}66`,
                                  }}
                                >
                                  {share}%
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {peeking && (
                          <p className="text-xs leading-snug opacity-75">
                            <span
                              className="mr-1.5 font-mono text-[10px] font-bold uppercase tracking-widest"
                              style={{ color: GOLD }}
                            >
                              {"ABCD"[peeking - 1]}
                            </span>
                            {peekText ? (
                              <>“{peekText}”</>
                            ) : (
                              <span className="opacity-60">Nobody picked this option.</span>
                            )}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <p className="text-sm opacity-60">
            Nobody’s taken the test yet. Pick a larva above or hit Random.
          </p>
        )}
      </div>
    </main>
  );
}
