// app/governance/page.tsx
//
// The governance record. Votes show real tallies from larv.ai. RFCs have no
// ballot, so we show an inferred stance mix from classified prose — clearly
// labeled, never presented as a tally.

"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

type Item = {
  id: string;
  kind: "vote" | "rfc";
  title: string;
  author: string;
  authorName: string | null;
  authorEns?: string | null;
  status: string;
  createdAt: string;
  options: string[];
  affirmativeOption: string | null;
  tallies: Record<string, number> | null;
  cvTotals: Record<string, number> | null;
  responseCount: number;
  stanceMix: Record<string, number>;
};

type Payload = {
  collectedAt: string;
  proposers: {
    authors: { wallet: string; name: string | null; items: number }[];
    singleAuthor: boolean;
    concentration: number;
    note: string;
  };
  items: Item[];
};

const STANCE_ORDER = ["approve", "conditional", "disapprove", "neutral"] as const;

const fmtDate = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
};

export default function GovernancePage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, sea: SEA } = colors;

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "vote" | "rfc">("all");

  useEffect(() => {
    fetch("/api/larvae/gov")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError("network error"))
      .finally(() => setLoading(false));
  }, []);

  // Oldest first. A record reads forwards.
  const items = useMemo(() => {
    if (!data) return [];
    const list = filter === "all" ? data.items : data.items.filter((i) => i.kind === filter);
    return [...list].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  }, [data, filter]);

  const voteCount = data?.items.filter((i) => i.kind === "vote").length ?? 0;
  const rfcCount = data?.items.filter((i) => i.kind === "rfc").length ?? 0;

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-3xl">
        <Nav />

        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Governance Record</h1>
          <p className="mt-2 max-w-2xl text-sm opacity-75">
            Every item put to the swarm, oldest first. Vote tallies come straight from
            larv.ai. RFCs have no ballot — the stance bars there are a language-model
            reading of the prose, not a recorded count.
          </p>
        </header>

        {loading && <p className="text-sm opacity-60">loading…</p>}
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
              <div className="grid grid-cols-3 gap-4">
                <Stat label="items" value={String(data.items.length)} />
                <Stat label="votes" value={String(voteCount)} />
                <Stat label="rfcs" value={String(rfcCount)} />
              </div>
              <p className="mt-4 border-t pt-4 text-sm opacity-70" style={{ borderColor: `${INK}15` }}>
                {data.proposers.note}
              </p>
            </section>

            <div className="mb-4 flex gap-2">
              {(["all", "vote", "rfc"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className="rounded-md border px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-opacity"
                  style={{
                    borderColor: filter === k ? CORAL : `${INK}22`,
                    background: filter === k ? `${CORAL}12` : CARD,
                    color: filter === k ? CORAL : INK,
                    opacity: filter === k ? 1 : 0.65,
                  }}
                >
                  {k === "all" ? "everything" : k === "vote" ? "votes" : "rfcs"}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {items.map((item) => (
                <section
                  key={`${item.kind}-${item.id}`}
                  className="rounded-xl border p-5"
                  style={{ borderColor: `${INK}22`, background: CARD }}
                >
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <span
                      className="font-mono text-[10px] uppercase tracking-widest"
                      style={{ color: item.kind === "vote" ? GOLD : SEA }}
                    >
                      {item.kind} · {fmtDate(item.createdAt)}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                      {item.responseCount} larvae responded
                    </span>
                  </div>

                  <h2 className="text-lg font-bold leading-snug">{item.title}</h2>

                  {item.tallies ? (
                    <Tally
                      tallies={item.tallies}
                      cvTotals={item.cvTotals}
                      colors={{ ink: INK, gold: GOLD, sea: SEA }}
                    />
                  ) : (
                    <>
                      {item.options.length > 0 && (
                        <div className="mt-4">
                          <p className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                            options
                          </p>
                          <ul className="mt-1 space-y-1">
                            {item.options.map((o) => (
                              <li key={o} className="text-sm opacity-80">
                                {o}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <StanceMix
                        mix={item.stanceMix}
                        colors={{ ink: INK, gold: GOLD, sea: SEA, coral: CORAL }}
                      />
                    </>
                  )}
                </section>
              ))}
            </div>

            <p className="mt-8 text-center font-mono text-[10px] uppercase tracking-widest opacity-40">
              collected {fmtDate(data.collectedAt)} · source: larv.ai/api/gov
            </p>
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

function stanceColor(
  stance: string,
  colors: { gold: string; sea: string; coral: string; ink: string }
) {
  if (stance === "approve") return colors.gold;
  if (stance === "conditional") return colors.sea;
  if (stance === "disapprove") return colors.coral;
  return colors.ink;
}

/** Inferred reading of RFC prose — not a ballot tally. */
function StanceMix({
  mix,
  colors,
}: {
  mix: Record<string, number>;
  colors: { ink: string; gold: string; sea: string; coral: string };
}) {
  const entries = STANCE_ORDER.map((k) => [k, mix[k] || 0] as const).filter(([, n]) => n > 0);
  const unresolved = mix.unresolved || 0;
  const total = entries.reduce((s, [, n]) => s + n, 0) + unresolved;
  if (total === 0) {
    return (
      <p className="mt-3 text-sm opacity-55">
        No classified responses yet for this RFC.
      </p>
    );
  }

  const max = Math.max(...entries.map(([, n]) => n), unresolved, 1);

  return (
    <div className="mt-4 space-y-2">
      <p className="font-mono text-[10px] uppercase tracking-widest opacity-45">
        inferred stance mix · not a recorded tally
      </p>
      {entries.map(([stance, n]) => {
        const share = n / total;
        const bar = stanceColor(stance, colors);
        return (
          <div key={stance}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-sm capitalize">{stance}</span>
              <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                {n}
                <span className="ml-2 font-normal opacity-45">
                  {Math.round(share * 100)}%
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded" style={{ background: `${colors.ink}10` }}>
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.max(1, (n / max) * 100)}%`,
                  background: bar,
                  opacity: n === max ? 0.85 : 0.55,
                }}
              />
            </div>
          </div>
        );
      })}
      {unresolved > 0 && (
        <p className="pt-1 font-mono text-[10px] uppercase tracking-widest opacity-40">
          {unresolved} unclassified
        </p>
      )}
    </div>
  );
}

/**
 * Results for one vote.
 *
 * Options are shown in the order the ballot listed them, not sorted by score —
 * reordering by result would quietly editorialize, and on a two-option vote it
 * would put the winner first every time.
 */
function Tally({
  tallies,
  cvTotals,
  colors,
}: {
  tallies: Record<string, number>;
  cvTotals: Record<string, number> | null;
  colors: { ink: string; gold: string; sea: string };
}) {
  const entries = Object.entries(tallies);
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  const max = Math.max(...entries.map(([, n]) => n));

  return (
    <div className="mt-4 space-y-2">
      {entries.map(([option, n]) => {
        const share = n / total;
        return (
          <div key={option}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-sm">{option}</span>
              <span className="shrink-0 font-mono text-sm font-bold tabular-nums">
                {n}
                <span className="ml-2 font-normal opacity-45">
                  {Math.round(share * 100)}%
                </span>
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded"
              style={{ background: `${colors.ink}10` }}
            >
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.max(1, share * 100)}%`,
                  background: n === max ? colors.gold : colors.sea,
                  opacity: 0.75,
                }}
              />
            </div>
          </div>
        );
      })}

      {cvTotals && Object.keys(cvTotals).length > 0 && (
        <details className="pt-1">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest opacity-45">
            conviction-weighted totals
          </summary>
          <div className="mt-2 space-y-1">
            {Object.entries(cvTotals).map(([option, v]) => (
              <div key={option} className="flex justify-between gap-3 text-xs opacity-70">
                <span className="min-w-0">{option}</span>
                <span className="shrink-0 font-mono tabular-nums">
                  {Number(v).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
