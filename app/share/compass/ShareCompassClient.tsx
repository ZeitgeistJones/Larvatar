"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";
import { type MoralLabel, type MoralResult } from "@/lib/moral";

const GRID: MoralLabel[][] = [
  ["Lawful Good", "Neutral Good", "Chaotic Good"],
  ["Lawful Neutral", "True Neutral", "Chaotic Neutral"],
  ["Lawful Evil", "Neutral Evil", "Chaotic Evil"],
];

export default function ShareCompassClient() {
  const { colors, dark } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, sea: SEA } = colors;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [results, setResults] = useState<MoralResult[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  const counts = useCallback(() => {
    const m = new Map<MoralLabel, number>();
    for (const r of results) m.set(r.label, (m.get(r.label) || 0) + 1);
    return m;
  }, [results]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || results.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = 1080;
    const H = 1080;
    canvas.width = W;
    canvas.height = H;

    const by = counts();
    const total = results.length || 1;
    const pct = (n: number) => Math.round((n / total) * 100);
    const n = (l: MoralLabel) => by.get(l) || 0;

    // Background
    ctx.fillStyle = dark ? "#12171d" : "#e8eef2";
    ctx.fillRect(0, 0, W, H);

    // Eyebrow
    ctx.fillStyle = CORAL;
    ctx.font = "600 22px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.letterSpacing = "4px";
    ctx.fillText("LARV.AI FIELD GUIDE", 72, 90);

    // Title
    ctx.fillStyle = INK;
    ctx.font = "800 72px system-ui, Segoe UI, sans-serif";
    ctx.letterSpacing = "0px";
    ctx.fillText("Hive Compass", 72, 175);

    ctx.fillStyle = dark ? "rgba(255,255,255,0.55)" : "rgba(20,30,40,0.55)";
    ctx.font = "500 26px system-ui, Segoe UI, sans-serif";
    ctx.fillText(`${total} larvae tested · EasyDamus alignment`, 72, 220);

    // Grid
    const originX = 72;
    const originY = 270;
    const gap = 16;
    const cellW = (W - 144 - gap * 2) / 3;
    const cellH = 150;

    const rowTint = (row: number) => {
      if (row === 0) return dark ? `${SEA}33` : `${SEA}28`;
      if (row === 2) return dark ? `${CORAL}33` : `${CORAL}22`;
      return dark ? "rgba(255,255,255,0.06)" : "rgba(20,30,40,0.05)";
    };

    GRID.forEach((row, ri) => {
      row.forEach((label, ci) => {
        const x = originX + ci * (cellW + gap);
        const y = originY + ri * (cellH + gap);
        const c = n(label);
        const p = pct(c);

        // card
        ctx.fillStyle = rowTint(ri);
        roundRect(ctx, x, y, cellW, cellH, 18);
        ctx.fill();
        ctx.strokeStyle = dark ? "rgba(255,255,255,0.1)" : "rgba(20,30,40,0.12)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = dark ? "rgba(255,255,255,0.5)" : "rgba(20,30,40,0.5)";
        ctx.font = "600 16px ui-monospace, Menlo, monospace";
        ctx.fillText(label.toUpperCase(), x + 20, y + 36);

        ctx.fillStyle = c === 0 ? (dark ? "rgba(255,255,255,0.25)" : "rgba(20,30,40,0.28)") : INK;
        ctx.font = "800 48px system-ui, Segoe UI, sans-serif";
        ctx.fillText(String(c), x + 20, y + 95);

        ctx.fillStyle = dark ? "rgba(255,255,255,0.45)" : "rgba(20,30,40,0.45)";
        ctx.font = "600 22px system-ui, Segoe UI, sans-serif";
        ctx.fillText(`${p}%`, x + 20 + ctx.measureText(String(c)).width + 14, y + 95);
      });
    });

    // Axis bars
    const barY0 = originY + 3 * (cellH + gap) + 36;
    const law = [
      { label: "Lawful", count: n("Lawful Good") + n("Lawful Neutral") + n("Lawful Evil"), color: GOLD },
      {
        label: "Neutral",
        count: n("Neutral Good") + n("True Neutral") + n("Neutral Evil"),
        color: dark ? "rgba(255,255,255,0.35)" : "rgba(20,30,40,0.35)",
      },
      {
        label: "Chaotic",
        count: n("Chaotic Good") + n("Chaotic Neutral") + n("Chaotic Evil"),
        color: CORAL,
      },
    ];
    const good = [
      { label: "Good", count: n("Lawful Good") + n("Neutral Good") + n("Chaotic Good"), color: SEA },
      {
        label: "Neutral",
        count: n("Lawful Neutral") + n("True Neutral") + n("Chaotic Neutral"),
        color: dark ? "rgba(255,255,255,0.35)" : "rgba(20,30,40,0.35)",
      },
      { label: "Evil", count: n("Lawful Evil") + n("Neutral Evil") + n("Chaotic Evil"), color: CORAL },
    ];

    drawBar(ctx, "LAW ↔ CHAOS", law, 72, barY0, W - 144, total, INK, dark);
    drawBar(ctx, "GOOD ↔ EVIL", good, 72, barY0 + 110, W - 144, total, INK, dark);

    const tn = n("True Neutral");
    ctx.fillStyle = dark ? "rgba(255,255,255,0.45)" : "rgba(20,30,40,0.45)";
    ctx.font = "600 18px ui-monospace, Menlo, monospace";
    ctx.fillText(`TRUE NEUTRAL (BOTH AXES)  ·  ${tn}  ·  ${pct(tn)}%`, 72, barY0 + 230);

    // Footer
    ctx.fillStyle = dark ? "rgba(255,255,255,0.4)" : "rgba(20,30,40,0.4)";
    ctx.font = "600 18px ui-monospace, Menlo, monospace";
    ctx.fillText("larvatar.vercel.app", 72, H - 56);
    const right = "proxies of proxies";
    ctx.fillText(right, W - 72 - ctx.measureText(right).width, H - 56);

    setReady(true);
  }, [CORAL, GOLD, INK, SEA, counts, dark, results]);

  useEffect(() => {
    fetch("/api/larvae/moral")
      .then(async (r) => {
        if (!r.ok) throw new Error(`load failed (${r.status})`);
        return r.json();
      })
      .then((d) => setResults(d.results || []))
      .catch((e) => setError(e instanceof Error ? e.message : "failed"));
  }, []);

  useEffect(() => {
    draw();
  }, [draw]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `larvatar-hive-compass-${results.length}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-3xl">
        <Nav />
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            share
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Hive Compass card</h1>
          <p className="mt-2 text-sm opacity-65">
            Live counts from the moral build. Download a square PNG for posts / Discord.
          </p>
        </header>

        {error && (
          <p className="mb-4 text-sm" style={{ color: CORAL }}>
            {error}
          </p>
        )}

        <div
          className="mb-4 overflow-hidden rounded-xl border"
          style={{ borderColor: `${INK}18`, background: CARD }}
        >
          <canvas ref={canvasRef} className="block h-auto w-full" style={{ aspectRatio: "1 / 1" }} />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={download}
            disabled={!ready}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: CORAL }}
          >
            Download PNG
          </button>
          <Link
            href="/moral"
            className="rounded-lg border px-4 py-2.5 text-sm opacity-70 hover:opacity-100"
            style={{ borderColor: `${INK}28` }}
          >
            Back to Moral Test
          </Link>
          <a
            href="/share/hive-compass.png"
            download
            className="rounded-lg border px-4 py-2.5 text-sm opacity-70 hover:opacity-100"
            style={{ borderColor: `${INK}28` }}
          >
            Static poster PNG
          </a>
        </div>
      </div>
    </main>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBar(
  ctx: CanvasRenderingContext2D,
  title: string,
  segs: { label: string; count: number; color: string }[],
  x: number,
  y: number,
  w: number,
  total: number,
  ink: string,
  dark: boolean
) {
  ctx.fillStyle = dark ? "rgba(255,255,255,0.45)" : "rgba(20,30,40,0.45)";
  ctx.font = "600 16px ui-monospace, Menlo, monospace";
  ctx.fillText(title, x, y);

  const barY = y + 16;
  const barH = 14;
  ctx.fillStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(20,30,40,0.08)";
  roundRect(ctx, x, barY, w, barH, 7);
  ctx.fill();

  let cursor = x;
  for (const s of segs) {
    const pw = total > 0 ? (s.count / total) * w : 0;
    if (pw <= 0) continue;
    ctx.fillStyle = s.color;
    ctx.fillRect(cursor, barY, pw, barH);
    cursor += pw;
  }

  ctx.fillStyle = dark ? "rgba(255,255,255,0.5)" : "rgba(20,30,40,0.5)";
  ctx.font = "600 15px ui-monospace, Menlo, monospace";
  let legendX = x;
  for (const s of segs) {
    const p = total > 0 ? Math.round((s.count / total) * 100) : 0;
    const text = `${s.label} ${s.count} · ${p}%`;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(legendX + 5, barY + barH + 22, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dark ? "rgba(255,255,255,0.55)" : "rgba(20,30,40,0.55)";
    ctx.fillText(text, legendX + 14, barY + barH + 26);
    legendX += ctx.measureText(text).width + 36;
  }
}
