// app/trends/page.tsx
//
// Topic Trends — overall pulse from recurring “Checking in” forum posts,
// with the top liked / complained / mixed themes per check-in, plus how each
// theme moved versus the previous check-in.

"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

type ThemeDelta = {
  praisePrev: number | null;
  pushbackPrev: number | null;
  praiseDelta: number | null;
  pushbackDelta: number | null;
};

type PulseTheme = {
  id: string;
  label: string;
  n: number;
  praise: number;
  pushback: number;
  metric: string;
  detail?: string;
  delta?: ThemeDelta;
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
  mixed_themes?: PulseTheme[];
};

type Payload = {
  waves: PulseWave[];
  positive: PulseTheme[];
  negative: PulseTheme[];
  mixed_themes: PulseTheme[];
  prompt?: string;
  meta: {
    builtAt: string;
    waveCount: number;
    totalResponses: number;
    caveat: string;
  };
};

type Side = "praise" | "pushback";

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
    (w) =>
      (w.positive?.length || 0) +
        (w.negative?.length || 0) +
        (w.mixed_themes?.length || 0) >
      0
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
            The swarm gets the same check-in every month. Here is the overall
            mood each time, the topics people liked and complained about, and how
            those topics moved since the check-in before.
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
            {data.prompt && (
              <section
                className="mb-6 rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: CARD }}
              >
                <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
                  The recurring question
                </p>
                <p className="mt-2 text-sm italic opacity-80">“{data.prompt}”</p>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-widest opacity-45">
                  Asked every check-in · {data.meta.waveCount} waves ·{" "}
                  {data.meta.totalResponses} replies
                </p>
              </section>
            )}

            <section
              className="mb-6 rounded-xl border p-5"
              style={{ borderColor: `${INK}22`, background: CARD }}
            >
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
                Overall pulse
              </p>
              <p className="mt-1 mb-4 text-sm opacity-70">
                Share of replies that read upbeat, mixed, or frustrated each wave.
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

            {hasPerWave ? (
              data.waves.map((w, i) => (
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
                        {i > 0 ? " · vs previous check-in" : " · first check-in"}
                      </p>
                    </div>
                  </div>

                  {w.aggregateShort && (
                    <p className="mb-5 text-sm opacity-65">{w.aggregateShort}</p>
                  )}

                  <ThemeList
                    title="Top 5 liked"
                    blurb="Topics people spoke well of."
                    items={w.positive || []}
                    accent={GREEN}
                    side="praise"
                    empty="No clear liked themes in this wave."
                  />
                  <ThemeList
                    title="Top 5 complaints"
                    blurb="Topics people pushed back on."
                    items={w.negative || []}
                    accent={CORAL}
                    side="pushback"
                    empty="No clear complaints in this wave."
                  />
                  <ThemeList
                    title="Mixed takes"
                    blurb="Topics the swarm both liked and complained about."
                    items={w.mixed_themes || []}
                    accent={GOLD}
                    side="praise"
                    mixed
                    empty="No clearly divisive topics this wave."
                    last
                  />
                </section>
              ))
            ) : (
              <>
                <ThemeSection
                  title="Top liked"
                  blurb="Rebuild pulse to get per-check-in boards."
                  items={data.positive}
                  accent={GREEN}
                  empty="Not enough repeated liked themes yet."
                />
                <ThemeSection
                  title="Top complaints"
                  blurb="Rebuild pulse to get per-check-in boards."
                  items={data.negative}
                  accent={CORAL}
                  empty="Not enough repeated complaints yet."
                />
                <ThemeSection
                  title="Mixed takes"
                  blurb="Rebuild pulse to get per-check-in boards."
                  items={data.mixed_themes}
                  accent={GOLD}
                  empty="No clearly divisive topics yet."
                />
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

/** A small chip describing movement vs the previous check-in. */
function DeltaChip({
  delta,
  side,
  accent,
}: {
  delta?: ThemeDelta;
  side: Side;
  accent: string;
}) {
  const { colors } = useTheme();
  const { ink: INK } = colors;
  if (!delta) return null;

  const d = side === "praise" ? delta.praiseDelta : delta.pushbackDelta;
  const prev = side === "praise" ? delta.praisePrev : delta.pushbackPrev;

  // No prior wave to compare against.
  if (d === null) return null;

  // Theme was absent last time.
  if (prev === null || prev === 0) {
    return (
      <span
        className="rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide"
        style={{ background: `${accent}22`, color: accent }}
      >
        new
      </span>
    );
  }

  if (d === 0) {
    return (
      <span
        className="rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide opacity-55"
        style={{ background: `${INK}14` }}
      >
        = flat
      </span>
    );
  }

  const up = d > 0;
  return (
    <span
      className="rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide"
      style={{ background: `${accent}22`, color: accent }}
      title={`was ${prev} last check-in`}
    >
      {up ? "↑" : "↓"} {up ? "+" : ""}
      {d} vs last
    </span>
  );
}

function ThemeList({
  title,
  blurb,
  items,
  accent,
  side,
  empty,
  mixed,
  last,
}: {
  title: string;
  blurb?: string;
  items: PulseTheme[];
  accent: string;
  side: Side;
  empty: string;
  mixed?: boolean;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const { ink: INK } = colors;

  return (
    <div className={last ? "" : "mb-5"}>
      <p className="font-mono text-[10px] uppercase tracking-widest" style={{ color: accent }}>
        {title}
      </p>
      {blurb && <p className="mt-1 text-sm opacity-60">{blurb}</p>}
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold">{item.label}</p>
                  {!mixed && <DeltaChip delta={item.delta} side={side} accent={accent} />}
                </div>
                {mixed && (
                  <p className="mt-0.5 text-xs opacity-60">
                    {item.praise} liked · {item.pushback} complained
                  </p>
                )}
              </div>
              <p className="shrink-0 text-right text-xs font-bold" style={{ color: accent }}>
                {mixed
                  ? `${item.praise}/${item.pushback}`
                  : side === "praise"
                    ? `${item.praise} liked`
                    : `${item.pushback} complained`}
              </p>
            </li>
          ))}
        </ol>
      )}
      {!last && <div className="mt-4 border-t" style={{ borderColor: `${INK}12` }} />}
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
