"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";
import { type MoralLabel, type MoralResult } from "@/lib/moral";
import { moralMapCoords, moralMargin } from "@/lib/moral-map";

const GRID: MoralLabel[][] = [
  ["Lawful Good", "Neutral Good", "Chaotic Good"],
  ["Lawful Neutral", "True Neutral", "Chaotic Neutral"],
  ["Lawful Evil", "Neutral Evil", "Chaotic Evil"],
];

const W = 1024;
const H = 1024;

export default function ShareCompassClient() {
  const { colors, dark } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, sea: SEA } = colors;
  const params = useSearchParams();
  const meName = (params.get("me") || "Kandi").trim();

  const compassRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const [results, setResults] = useState<MoralResult[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  const counts = useCallback(() => {
    const m = new Map<MoralLabel, number>();
    for (const r of results) m.set(r.label, (m.get(r.label) || 0) + 1);
    return m;
  }, [results]);

  const drawCompass = useCallback(() => {
    const canvas = compassRef.current;
    if (!canvas || results.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = W;
    canvas.height = H;

    const by = counts();
    const total = results.length || 1;
    const pct = (c: number) => Math.round((c / total) * 100);
    const n = (l: MoralLabel) => by.get(l) || 0;

    ctx.fillStyle = dark ? "#12171d" : "#e8eef2";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = CORAL;
    ctx.font = "600 20px ui-monospace, Menlo, monospace";
    ctx.fillText("LARV.AI FIELD GUIDE", 64, 72);

    ctx.fillStyle = INK;
    ctx.font = "800 44px system-ui, Segoe UI, sans-serif";
    wrapText(ctx, `I ran ${total} larva proxies through the EasyDamus test.`, 64, 130, W - 128, 52);
    ctx.fillStyle = dark ? "rgba(255,255,255,0.6)" : "rgba(20,30,40,0.6)";
    ctx.font = "600 28px system-ui, Segoe UI, sans-serif";
    ctx.fillText("Here's how the hive landed.", 64, 240);

    const originX = 64;
    const originY = 280;
    const gap = 14;
    const cellW = (W - 128 - gap * 2) / 3;
    const cellH = 132;

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
        roundRect(ctx, x, y, cellW, cellH, 16);
        ctx.fillStyle = rowTint(ri);
        ctx.fill();
        ctx.strokeStyle = dark ? "rgba(255,255,255,0.1)" : "rgba(20,30,40,0.12)";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = dark ? "rgba(255,255,255,0.5)" : "rgba(20,30,40,0.5)";
        ctx.font = "600 15px ui-monospace, Menlo, monospace";
        ctx.fillText(label.toUpperCase(), x + 18, y + 32);

        ctx.fillStyle = c === 0 ? (dark ? "rgba(255,255,255,0.25)" : "rgba(20,30,40,0.28)") : INK;
        ctx.font = "800 44px system-ui, Segoe UI, sans-serif";
        ctx.fillText(String(c), x + 18, y + 88);
        ctx.fillStyle = dark ? "rgba(255,255,255,0.45)" : "rgba(20,30,40,0.45)";
        ctx.font = "600 20px system-ui, Segoe UI, sans-serif";
        ctx.fillText(`${pct(c)}%`, x + 18 + ctx.measureText(String(c)).width + 12, y + 88);
      });
    });

    const barY0 = originY + 3 * (cellH + gap) + 28;
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
    drawBar(ctx, "LAW ↔ CHAOS", law, 64, barY0, W - 128, total, dark);
    drawBar(ctx, "GOOD ↔ EVIL", good, 64, barY0 + 100, W - 128, total, dark);

    ctx.fillStyle = dark ? "rgba(255,255,255,0.55)" : "rgba(20,30,40,0.55)";
    ctx.font = "italic 600 26px Georgia, serif";
    ctx.fillText("The real larvae would hate this.", 64, H - 100);

    ctx.fillStyle = dark ? "rgba(255,255,255,0.4)" : "rgba(20,30,40,0.4)";
    ctx.font = "600 18px ui-monospace, Menlo, monospace";
    ctx.fillText("proxies of proxies", 64, H - 52);
    const right = "larvatar.vercel.app · 1/2";
    ctx.fillText(right, W - 64 - ctx.measureText(right).width, H - 52);
  }, [CORAL, GOLD, INK, SEA, counts, dark, results]);

  const drawMap = useCallback(() => {
    const canvas = mapRef.current;
    if (!canvas || results.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = W;
    canvas.height = H;

    const total = results.length;
    ctx.fillStyle = dark ? "#12171d" : "#e8eef2";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = CORAL;
    ctx.font = "600 20px ui-monospace, Menlo, monospace";
    ctx.fillText("LARV.AI FIELD GUIDE", 64, 72);

    ctx.fillStyle = INK;
    ctx.font = "800 56px system-ui, Segoe UI, sans-serif";
    ctx.fillText("Moral Map", 64, 145);
    ctx.fillStyle = dark ? "rgba(255,255,255,0.55)" : "rgba(20,30,40,0.55)";
    ctx.font = "500 24px system-ui, Segoe UI, sans-serif";
    ctx.fillText(`${total} proxies · Law ↔ Chaos × Good ↔ Evil`, 64, 185);

    const pad = { l: 100, r: 56, t: 230, b: 140 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const plotX = pad.l;
    const plotY = pad.t;
    const midX = plotX + plotW / 2;
    const midY = plotY + plotH / 2;

    // Soft 9-box washes (good top / evil bottom — matches live map)
    const boxes: { x0: number; x1: number; y0: number; y1: number; c: string }[] = [
      { x0: -1, x1: -1 / 3, y0: -1, y1: -1 / 3, c: SEA },
      { x0: -1 / 3, x1: 1 / 3, y0: -1, y1: -1 / 3, c: SEA },
      { x0: 1 / 3, x1: 1, y0: -1, y1: -1 / 3, c: SEA },
      { x0: -1, x1: -1 / 3, y0: -1 / 3, y1: 1 / 3, c: INK },
      { x0: -1 / 3, x1: 1 / 3, y0: -1 / 3, y1: 1 / 3, c: GOLD },
      { x0: 1 / 3, x1: 1, y0: -1 / 3, y1: 1 / 3, c: INK },
      { x0: -1, x1: -1 / 3, y0: 1 / 3, y1: 1, c: CORAL },
      { x0: -1 / 3, x1: 1 / 3, y0: 1 / 3, y1: 1, c: CORAL },
      { x0: 1 / 3, x1: 1, y0: 1 / 3, y1: 1, c: CORAL },
    ];
    const toX = (v: number) => plotX + ((v + 1) / 2) * plotW;
    const toY = (v: number) => plotY + ((v + 1) / 2) * plotH; // +evil down
    for (const b of boxes) {
      const x = toX(b.x0);
      const y = toY(b.y0);
      ctx.fillStyle = b.c;
      ctx.globalAlpha = 0.05;
      ctx.fillRect(x, y, toX(b.x1) - x, toY(b.y1) - y);
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = dark ? "rgba(255,255,255,0.14)" : "rgba(20,30,40,0.16)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(plotX, plotY, plotW, plotH);
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(midX, plotY);
    ctx.lineTo(midX, plotY + plotH);
    ctx.moveTo(plotX, midY);
    ctx.lineTo(plotX + plotW, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels like live map
    ctx.fillStyle = dark ? "rgba(255,255,255,0.45)" : "rgba(20,30,40,0.45)";
    ctx.font = "600 14px ui-monospace, Menlo, monospace";
    ctx.fillText("GOOD", plotX + 8, plotY + 20);
    ctx.fillText("← LAWFUL", plotX, plotY + plotH + 36);
    ctx.fillText("CHAOTIC →", plotX + plotW - 90, plotY + plotH + 36);
    ctx.save();
    ctx.translate(28, midY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("EVIL →", 0, 0);
    ctx.restore();

    // Closest / deepest meta
    const plotted = results.map((r) => {
      const { x, y } = moralMapCoords(r);
      return { r, x, y, margin: moralMargin(r), dist: Math.hypot(x, y) };
    });
    const closest = [...plotted].sort((a, b) => a.dist - b.dist)[0];
    const deepest = [...plotted].sort((a, b) => b.margin - a.margin)[0];
    ctx.font = "600 16px ui-monospace, Menlo, monospace";
    ctx.textAlign = "right";
    ctx.fillStyle = dark ? "rgba(255,255,255,0.45)" : "rgba(20,30,40,0.45)";
    if (closest) {
      ctx.fillText("closest to center · ", W - 64 - ctx.measureText(closest.r.name).width, 100);
      ctx.fillStyle = GOLD;
      ctx.fillText(closest.r.name, W - 64, 100);
    }
    if (deepest && deepest.r.wallet !== closest?.r.wallet) {
      ctx.fillStyle = dark ? "rgba(255,255,255,0.45)" : "rgba(20,30,40,0.45)";
      ctx.fillText("strongest margin · ", W - 64 - ctx.measureText(deepest.r.name).width, 124);
      ctx.fillStyle = CORAL;
      ctx.fillText(deepest.r.name, W - 64, 124);
    }
    ctx.textAlign = "left";

    const me = results.find((r) => r.name.toLowerCase() === meName.toLowerCase());
    let mePt: { x: number; y: number; r: MoralResult } | null = null;

    const sorted = [...plotted].sort((a, b) => a.margin - b.margin);
    for (const p of sorted) {
      const px = toX(p.x);
      const py = toY(p.y);
      const rad = 4.5 + Math.min(5, p.margin / 7);
      const hue = walletHue(p.r.wallet);
      ctx.beginPath();
      ctx.arc(px, py, rad, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${hue} 58% 52%)`;
      ctx.fill();
      if (me && p.r.wallet === me.wallet) mePt = { x: px, y: py, r: p.r };
    }

    if (mePt) {
      ctx.beginPath();
      ctx.arc(mePt.x, mePt.y, 13, 0, Math.PI * 2);
      ctx.strokeStyle = CORAL;
      ctx.lineWidth = 3;
      ctx.stroke();

      const label = mePt.r.name;
      const sub = "builder's stand-in";
      ctx.font = "700 22px system-ui, Segoe UI, sans-serif";
      const tw = Math.max(ctx.measureText(label).width, 140);
      let ax = mePt.x + 16;
      let ay = mePt.y - 28;
      if (ax + tw > plotX + plotW - 8) ax = mePt.x - tw - 20;
      if (ay < plotY + 28) ay = mePt.y + 36;

      ctx.strokeStyle = CORAL;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mePt.x, mePt.y - 12);
      ctx.lineTo(ax + 4, ay);
      ctx.stroke();

      ctx.fillStyle = INK;
      ctx.fillText(label, ax + 6, ay);
      ctx.fillStyle = dark ? "rgba(255,255,255,0.5)" : "rgba(20,30,40,0.5)";
      ctx.font = "600 15px ui-monospace, Menlo, monospace";
      ctx.fillText(sub, ax + 6, ay + 20);
    }

    ctx.fillStyle = dark ? "rgba(255,255,255,0.4)" : "rgba(20,30,40,0.4)";
    ctx.font = "600 13px ui-monospace, Menlo, monospace";
    ctx.fillText("DOT SIZE = ALIGNMENT MARGIN", 64, H - 88);
    ctx.fillText("CROSSHAIR = TRUE NEUTRAL", midX - 90, H - 88);

    ctx.font = "600 18px ui-monospace, Menlo, monospace";
    ctx.fillText("proxies of proxies", 64, H - 48);
    const right = "larvatar.vercel.app · 2/2";
    ctx.fillText(right, W - 64 - ctx.measureText(right).width, H - 48);
  }, [CORAL, GOLD, INK, SEA, dark, meName, results]);

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
    if (results.length === 0) return;
    drawCompass();
    drawMap();
    setReady(true);
  }, [results, drawCompass, drawMap]);

  function downloadCanvas(canvas: HTMLCanvasElement | null, name: string) {
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  function downloadBoth() {
    downloadCanvas(compassRef.current, `larvatar-hive-compass-${results.length}.png`);
    setTimeout(() => {
      downloadCanvas(mapRef.current, `larvatar-moral-map-${results.length}.png`);
    }, 250);
  }

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-3xl">
        <Nav />
        <header className="mb-6">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            share · two cards
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Hive Compass + Moral Map</h1>
          <p className="mt-2 text-sm opacity-65">
            Pair for posts: compass split, then the scatter with your stand-in marked. Highlight
            defaults to <span className="font-semibold">{meName}</span> — override with{" "}
            <code className="text-xs opacity-80">?me=Name</code>. Both export at{" "}
            <strong>1024×1024</strong> so they match as a set. Map uses live dots (don’t
            AI-redraw it).
          </p>
        </header>

        {error && (
          <p className="mb-4 text-sm" style={{ color: CORAL }}>
            {error}
          </p>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadBoth}
            disabled={!ready}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: CORAL }}
          >
            Download both PNGs
          </button>
          <button
            type="button"
            onClick={() =>
              downloadCanvas(compassRef.current, `larvatar-hive-compass-${results.length}.png`)
            }
            disabled={!ready}
            className="rounded-lg border px-4 py-2.5 text-sm opacity-70 hover:opacity-100 disabled:opacity-40"
            style={{ borderColor: `${INK}28` }}
          >
            Compass only
          </button>
          <button
            type="button"
            onClick={() =>
              downloadCanvas(mapRef.current, `larvatar-moral-map-${results.length}.png`)
            }
            disabled={!ready}
            className="rounded-lg border px-4 py-2.5 text-sm opacity-70 hover:opacity-100 disabled:opacity-40"
            style={{ borderColor: `${INK}28` }}
          >
            Map only
          </button>
          <Link
            href="/moral"
            className="rounded-lg border px-4 py-2.5 text-sm opacity-70 hover:opacity-100"
            style={{ borderColor: `${INK}28` }}
          >
            Moral Test
          </Link>
        </div>

        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest opacity-45">1 / 2 · compass</p>
        <div
          className="mb-8 overflow-hidden rounded-xl border"
          style={{ borderColor: `${INK}18`, background: CARD }}
        >
          <canvas ref={compassRef} className="block h-auto w-full" style={{ aspectRatio: "1 / 1" }} />
        </div>

        <p className="mb-2 font-mono text-[10px] uppercase tracking-widest opacity-45">2 / 2 · map</p>
        <div
          className="mb-8 overflow-hidden rounded-xl border"
          style={{ borderColor: `${INK}18`, background: CARD }}
        >
          <canvas ref={mapRef} className="block h-auto w-full" style={{ aspectRatio: "1 / 1" }} />
        </div>
      </div>
    </main>
  );
}

function walletHue(wallet: string): number {
  let h = 0;
  for (const c of wallet.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number
) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
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
  dark: boolean
) {
  ctx.fillStyle = dark ? "rgba(255,255,255,0.45)" : "rgba(20,30,40,0.45)";
  ctx.font = "600 15px ui-monospace, Menlo, monospace";
  ctx.fillText(title, x, y);
  const barY = y + 14;
  const barH = 12;
  roundRect(ctx, x, barY, w, barH, 6);
  ctx.fillStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(20,30,40,0.08)";
  ctx.fill();
  let cursor = x;
  for (const s of segs) {
    const pw = total > 0 ? (s.count / total) * w : 0;
    if (pw <= 0) continue;
    ctx.fillStyle = s.color;
    ctx.fillRect(cursor, barY, pw, barH);
    cursor += pw;
  }
  let legendX = x;
  ctx.font = "600 14px ui-monospace, Menlo, monospace";
  for (const s of segs) {
    const p = total > 0 ? Math.round((s.count / total) * 100) : 0;
    const text = `${s.label} ${s.count} · ${p}%`;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(legendX + 4, barY + barH + 20, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = dark ? "rgba(255,255,255,0.55)" : "rgba(20,30,40,0.55)";
    ctx.fillText(text, legendX + 12, barY + barH + 24);
    legendX += ctx.measureText(text).width + 28;
  }
}
