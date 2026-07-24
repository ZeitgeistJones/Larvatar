// app/trends/page.tsx
//
// Topic Trends — present snapshot of what the swarm has backed, pushed back
// on, and split over across accumulated governance data.

"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

type TrendItem = {
  id: string;
  title: string;
  kind: "vote" | "rfc";
  score: number;
  n: number;
  metric: string;
  detail?: string;
  equalWeightFallback?: boolean;
  link: string;
};

type TrendBoard = {
  happy: TrendItem[];
  frustrated: TrendItem[];
  contention: TrendItem[];
};

type Payload = {
  equal: TrendBoard;
  cv: TrendBoard;
  meta: {
    collectedAt: string;
    voteCount: number;
    rfcCount: number;
    cvCoverage: number;
    caveat: string;
  };
};

type Weight = "equal" | "cv";

export default function TopicTrendsPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, green: GREEN } =
    colors;

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weight, setWeight] = useState<Weight>("equal");

  useEffect(() => {
    fetch("/api/larvae/mood")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError("network error"))
      .finally(() => setLoading(false));
  }, []);

  const board = data ? (weight === "equal" ? data.equal : data.cv) : null;

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
            Where the swarm has backed, pushed back on, and split — across all
            accumulated governance topics. A present snapshot, not a weekly chart.
          </p>
        </header>

        {loading && <p className="text-sm opacity-60">ranking topics…</p>}
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

        {data && board && (
          <>
            <section
              className="mb-6 rounded-xl border p-5"
              style={{ borderColor: `${INK}22`, background: CARD }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid grid-cols-3 gap-4">
                  <Stat label="votes" value={String(data.meta.voteCount)} />
                  <Stat label="rfcs" value={String(data.meta.rfcCount)} />
                  <Stat
                    label="votes w/ CV"
                    value={`${Math.round(data.meta.cvCoverage * 100)}%`}
                  />
                </div>
                <div className="flex gap-2">
                  {(["equal", "cv"] as Weight[]).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setWeight(w)}
                      className="rounded-md border px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-opacity"
                      style={{
                        borderColor: weight === w ? CORAL : `${INK}22`,
                        background: weight === w ? `${CORAL}12` : "transparent",
                        color: weight === w ? CORAL : INK,
                        opacity: weight === w ? 1 : 0.6,
                      }}
                    >
                      {w === "equal" ? "Equal weight" : "CV weight"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-4 border-t pt-4 text-sm opacity-70" style={{ borderColor: `${INK}15` }}>
                {data.meta.caveat}
                {weight === "cv" && (
                  <>
                    {" "}
                    CV mode uses larv.ai conviction totals on votes; RFCs still
                    use headcount and are marked when they fall back.
                  </>
                )}
              </p>
            </section>

            <TrendSection
              title="Happy with"
              blurb={
                weight === "equal"
                  ? "Highest share for the yes side (votes) or approve (RFCs). Metric = % support · n = how many weighed in."
                  : "Same idea, CV-weighted on votes. Metric = % support under CV · n = CV mass (or headcount for RFCs)."
              }
              items={board.happy}
              accent={GREEN}
              empty="Nothing clear enough to call a win yet."
            />

            <TrendSection
              title="Frustrated with"
              blurb={
                weight === "equal"
                  ? "Highest share against the yes side (votes) or disapprove (RFCs). Metric = % opposition · n = participation."
                  : "Same idea under CV on votes. Metric = % opposition · n = CV mass (or headcount for RFCs)."
              }
              items={board.frustrated}
              accent={CORAL}
              empty="No strong opposition showing up yet."
            />

            <TrendSection
              title="Points of contention"
              blurb="Closest splits with real participation. Metric = how the top sides broke · detail notes vote vs RFC."
              items={board.contention}
              accent={GOLD}
              empty="The room isn't splitting hard on anything scored yet."
            />
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function TrendSection({
  title,
  blurb,
  items,
  accent,
  empty,
}: {
  title: string;
  blurb: string;
  items: TrendItem[];
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
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold hover:opacity-80"
                >
                  {item.title}
                </a>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest opacity-45">
                  {item.kind}
                  {item.equalWeightFallback ? " · equal fallback" : ""}
                  {item.detail ? ` · ${item.detail}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold" style={{ color: accent }}>
                  {item.metric}
                </p>
                <p className="font-mono text-[10px] opacity-45">n={item.n}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
