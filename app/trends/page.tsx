// app/trends/page.tsx
//
// Topic Trends — overall pulse from recurring “Checking in” forum posts,
// with top positive / negative / contention themes per check-in.

"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

type PulseTheme = {
  id: string;
  label: string;
  n: number;
  metric: string;
  detail?: string;
  waves: string[];
};

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
  positive?: PulseTheme[];
  negative?: PulseTheme[];
  contention?: PulseTheme[];
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

  const hasPerWave = data?.waves.some(
    (w) => (w.positive?.length || 0) + (w.negative?.length || 0) + (w.contention?.length || 0) > 0
  );

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
            Overall pulse from each Checking in post, then the top positive,
            negative, and contention themes inside that wave.
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
                  <li
                    key={`pulse-${w.postId}`}
                    className="border-t pt-4 first:border-t-0 first:pt-0"
                    style={{ borderColor: `${INK}12` }}
                  >
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
                    <div
                      className="flex h-2.5 overflow-hidden rounded-full"
                      style={{ background: `${INK}12` }}
                    >
                      <div style={{ width: pct(w.pctUpbeat), background: GREEN }} />
                      <div style={{ width: pct(w.pctMixed), background: GOLD }} />
                      <div style={{ width: pct(w.pctFrustrated), background: CORAL }} />
                    </div>
                  </li>
                ))}
              </ol>

              <p
                className="mt-4 border-t pt-4 text-sm opacity-60"
                style={{ borderColor: `${INK}15` }}
              >
                {data.meta.caveat}
              </p>
            </section>

            {hasPerWave
              ? data.waves.map((w, i) => (
                  <section
                    key={`board-${w.postId}`}
                    className="mb-6 rounded-xl border p-5"
                    style={{ borderColor: `${INK}22`, background: CARD }}
                  >
                    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <p
                          className="font-mono text-xs uppercase tracking-widest"
                          style={{ color: CORAL }}
                        >
                          Check-in {i + 1}
                        </p>
                        <a
                          href={w.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-lg font-bold hover:opacity-80"
                        >
                          {w.title.trim() || `Wave ${i + 1}`}
                        </a>
                        <p className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                          {shortDate(w.createdAt)} · n={w.n}
                        </p>
                      </div>
                    </div>

                    {w.aggregateShort && (
                      <p className="mb-5 text-sm opacity-65">{w.aggregateShort}</p>
                    )}

                    <ThemeList
                      title="Top 5 positive"
                      items={w.positive || []}
                      accent={GREEN}
                      empty="No clear positive themes in this wave."
                    />
                    <ThemeList
                      title="Top 5 negative"
                      items={w.negative || []}
                      accent={CORAL}
                      empty="No clear negative themes in this wave."
                    />
                    <ThemeList
                      title="Top 3 contention"
                      items={w.contention || []}
                      accent={GOLD}
                      empty="No clear contention themes in this wave."
                      last
                    />
                  </section>
                ))
              : (
                  <>
                    <ThemeSection
                      title="Top positive vibes"
                      blurb="Rebuild pulse to get per-check-in boards."
                      items={data.positive}
                      accent={GREEN}
                      empty="Not enough repeated positive themes yet."
                    />
                    <ThemeSection
                      title="Top negative vibes"
                      blurb="Rebuild pulse to get per-check-in boards."
                      items={data.negative}
                      accent={CORAL}
                      empty="Not enough repeated negative themes yet."
                    />
                    <ThemeSection
                      title="Points of contention"
                      blurb="Rebuild pulse to get per-check-in boards."
                      items={data.contention}
                      accent={GOLD}
                      empty="No strong split themes extracted yet."
                    />
                  </>
                )}
          </>
        )}
      </div>
    </main>
  );
}

function ThemeList({
  title,
  items,
  accent,
  empty,
  last,
}: {
  title: string;
  items: PulseTheme[];
  accent: string;
  empty: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const { ink: INK } = colors;

  return (
    <div className={last ? "" : "mb-5"}>
      <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: accent }}>
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm opacity-50">{empty}</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {items.map((item, i) => (
            <li key={`${title}-${item.id}`} className="flex items-start gap-3">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
                style={{ background: `${accent}22`, color: accent }}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.label}</p>
              </div>
              <p className="shrink-0 text-right text-xs font-bold" style={{ color: accent }}>
                {item.metric}
              </p>
            </li>
          ))}
        </ol>
      )}
      {!last && (
        <div className="mt-4 border-t" style={{ borderColor: `${INK}12` }} />
      )}
    </div>
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
              </div>
              <p className="shrink-0 text-sm font-bold" style={{ color: accent }}>
                {item.metric}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
