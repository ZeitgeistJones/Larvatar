// app/trends/page.tsx
//
// Topic Trends — overall pulse from recurring “Checking in” forum posts,
// plus top positive / negative / contention themes mined from those replies.

"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

type PulseWave = {
  postId: string;
  title: string;
  createdAt: string;
  n: number;
  upbeat: number;
  frustrated: number;
  mixed: number;
  unclear: number;
  pctUpbeat: number;
  pctFrustrated: number;
  pctMixed: number;
  aggregateShort: string;
  link: string;
};

type PulseTheme = {
  id: string;
  label: string;
  n: number;
  metric: string;
  detail?: string;
  waves: string[];
};

type Payload = {
  waves: PulseWave[];
  positive: PulseTheme[];
  negative: PulseTheme[];
  contention: PulseTheme[];
  meta: {
    builtAt: string;
    waveCount: number;
    totalResponses: number;
    caveat: string;
  };
};

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function shortDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export default function TopicTrendsPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, green: GREEN } =
    colors;

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/larvae/pulse")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError("network error"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-3xl">
        <Nav />

        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Topic Trends</h1>
          <p className="mt-2 max-w-2xl text-sm opacity-75">
            Overall pulse from the recurring Checking in forum posts, plus the
            themes that keep coming up as wins, gripes, and splits.
          </p>
        </header>

        {loading && <p className="text-sm opacity-60">reading check-ins…</p>}
        {error && (
          <section
            className="rounded-xl border p-5"
            style={{ borderColor: `${CORAL}55`, background: CARD }}
          >
            <p className="text-sm" style={{ color: CORAL }}>
              {error}
            </p>
          </section>
        )}

        {data && (
          <>
            <section
              className="mb-6 rounded-xl border p-5"
              style={{ borderColor: `${INK}22`, background: CARD }}
            >
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
                Overall pulse
              </p>
              <p className="mt-1 mb-4 text-sm opacity-70">
                Same check-in prompt across {data.meta.waveCount} waves ·{" "}
                {data.meta.totalResponses} larva replies classified
              </p>

              <ol className="space-y-4">
                {data.waves.map((w, i) => (
                  <li key={w.postId} className="border-t pt-4 first:border-t-0 first:pt-0" style={{ borderColor: `${INK}12` }}>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <a
                          href={w.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold hover:opacity-80"
                        >
                          {w.title.trim() || `Check-in ${i + 1}`}
                        </a>
                        <p className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                          {shortDate(w.createdAt)} · n={w.n}
                        </p>
                      </div>
                      <p className="font-mono text-[10px] opacity-50">
                        {pct(w.pctUpbeat)} up · {pct(w.pctFrustrated)} down ·{" "}
                        {pct(w.pctMixed)} mixed
                      </p>
                    </div>

                    <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: `${INK}12` }}>
                      <div style={{ width: pct(w.pctUpbeat), background: GREEN }} />
                      <div style={{ width: pct(w.pctMixed), background: GOLD }} />
                      <div style={{ width: pct(w.pctFrustrated), background: CORAL }} />
                    </div>

                    {w.aggregateShort && (
                      <p className="mt-2 text-sm opacity-65">{w.aggregateShort}</p>
                    )}
                  </li>
                ))}
              </ol>

              <p className="mt-4 border-t pt-4 text-sm opacity-60" style={{ borderColor: `${INK}15` }}>
                {data.meta.caveat}
              </p>
            </section>

            <ThemeSection
              title="Top positive vibes"
              blurb="Themes that show up as wins, hope, or what’s working."
              items={data.positive}
              accent={GREEN}
              empty="Not enough repeated positive themes yet."
            />

            <ThemeSection
              title="Top negative vibes"
              blurb="Themes that show up as gripes, impatience, or worry."
              items={data.negative}
              accent={CORAL}
              empty="Not enough repeated negative themes yet."
            />

            <ThemeSection
              title="Points of contention"
              blurb="Themes where the swarm splits — contested takes, or both praise and pushback."
              items={data.contention}
              accent={GOLD}
              empty="No strong split themes extracted yet."
            />
          </>
        )}
      </div>
    </main>
  );
}

function ThemeSection({
  title,
  blurb,
  items,
  accent,
  empty,
}: {
  title: string;
  blurb: string;
  items: PulseTheme[];
  accent: string;
  empty: string;
}) {
  const { colors } = useTheme();
  const { ink: INK, card: CARD } = colors;

  return (
    <section
      className="mb-6 rounded-xl border p-5"
      style={{ borderColor: `${INK}22`, background: CARD }}
    >
      <p className="font-mono text-xs uppercase tracking-widest" style={{ color: accent }}>
        {title}
      </p>
      <p className="mt-1 mb-4 text-sm opacity-70">{blurb}</p>

      {items.length === 0 ? (
        <p className="text-sm opacity-50">{empty}</p>
      ) : (
        <ol className="space-y-3">
          {items.map((item, i) => (
            <li
              key={`${title}-${item.id}`}
              className="flex items-start gap-3 border-t pt-3 first:border-t-0 first:pt-0"
              style={{ borderColor: `${INK}12` }}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
                style={{ background: `${accent}22`, color: accent }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.label}</p>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest opacity-45">
                  {item.detail || `waves ${item.waves.join(", ")}`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold" style={{ color: accent }}>
                  {item.metric}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
