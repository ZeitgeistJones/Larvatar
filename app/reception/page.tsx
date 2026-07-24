// app/reception/page.tsx
// Author Reception — how the swarm responds to different proposers.
//
// FRAMING NOTES (these are design decisions, not decoration):
//
// - The confound leads. Warm reception is equally consistent with writing
//   good proposals and with being favoured. The page says so before showing
//   numbers, because the data cannot separate the two.
// - Full outcome mix, not approve-only. This hive's aggregates mostly land
//   conditional; an approve% chart collapses to near-zero and hides the real
//   split between hedged, rejected, and mute.
// - Under-threshold authors are shown as insufficient rather than given a
//   misleading rate.
// - The per-larva-per-author matrix is NOT requested here. It exists in the
//   API behind ?relations=true.

"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

type Stance = "approve" | "conditional" | "disapprove" | "neutral";

type Author = {
  wallet: string;
  /** Specimen nickname, when this author holds a larva. Null otherwise. */
  name: string | null;
  /** ENS for the wallet line — never replaces nickname. */
  ens?: string | null;
  posts: number;
  outcomes: Record<Stance, number>;
  approvalRate: number;
  nonNegativeRate: number;
  insufficientData: boolean;
};

type Payload = {
  computedAt: string;
  thresholds: { minPostsForAuthor: number };
  coverage: { postsWithKnownAuthor: number; postsTotal: number };
  meanApprovalRate: number;
  authors: Author[];
  relationCount: number;
};

const short = (w: string) => `${w.slice(0, 6)}…${w.slice(-4)}`;

/** Primary label: nickname, else ENS, else short hex. */
const label = (a: Author) => a.name || a.ens || short(a.wallet);

/** Wallet subtitle: ENS if present, else short hex. Hidden when primary is already that string. */
const walletLine = (a: Author) => a.ens || short(a.wallet);

export default function ReceptionPage() {
  const { colors } = useTheme();
  const {
    ink: INK,
    sheet: SHEET,
    card: CARD,
    coral: CORAL,
    gold: GOLD,
    green: GREEN,
  } = colors;

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/larvae/reception")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError("network error"))
      .finally(() => setLoading(false));
  }, []);

  const qualifying = useMemo(() => {
    if (!data) return [];
    return [...data.authors.filter((a) => !a.insufficientData)].sort(
      (a, b) =>
        b.nonNegativeRate - a.nonNegativeRate || b.posts - a.posts
    );
  }, [data]);

  const belowThreshold = useMemo(
    () => (data ? data.authors.filter((a) => a.insufficientData) : []),
    [data]
  );

  const meanNonNegative = useMemo(() => {
    if (qualifying.length === 0) return 0;
    return (
      qualifying.reduce((s, a) => s + a.nonNegativeRate, 0) / qualifying.length
    );
  }, [qualifying]);

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-3xl">
        <Nav />

        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Author Reception</h1>
          <p className="mt-2 max-w-2xl text-sm opacity-75">
            Track Record measures the voters. This measures the other side of the
            room — how the swarm&apos;s aggregated opinion lands on posts from
            different authors.
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
              style={{ borderColor: `${GOLD}55`, background: CARD }}
            >
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                what this can and can&apos;t tell you
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                A warm reception mix is equally consistent with two very different
                explanations: that an author writes well-scoped, well-timed proposals,
                or that the swarm responds warmly to them regardless of content.
                Nothing in this data separates those. Post topic, timing, length and
                how concrete the ask was all move these numbers, and none of them are
                measured here. Read the bars as a description of what happened, not
                as an explanation of why.
              </p>
              <p className="mt-3 text-sm leading-relaxed opacity-80">
                Authors with fewer than {data.thresholds.minPostsForAuthor} posts are
                listed without a mix — at that volume a single post swings the
                split far enough to be meaningless.
              </p>
            </section>

            <section
              className="mb-6 grid grid-cols-2 gap-4 rounded-xl border p-5 sm:grid-cols-4"
              style={{ borderColor: `${INK}22`, background: CARD }}
            >
              <Stat label="authors" value={String(data.authors.length)} />
              <Stat
                label={`with ${data.thresholds.minPostsForAuthor}+ posts`}
                value={String(qualifying.length)}
              />
              <Stat
                label="mean non-negative"
                value={`${Math.round(meanNonNegative * 100)}%`}
                accent={GOLD}
              />
              <Stat
                label="posts covered"
                value={`${data.coverage.postsWithKnownAuthor}/${data.coverage.postsTotal}`}
              />
            </section>

            {qualifying.length > 0 && (
              <section
                className="mb-6 rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: CARD }}
              >
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  outcome mix by author
                </p>
                <p className="mt-1 mb-4 text-sm opacity-70">
                  Share of each author&apos;s posts whose swarm aggregate landed on
                  approve, conditional, disapprove, or neutral. Most posts here land
                  conditional — the mix is the signal, not an approve-only rate.
                  Sorted by non-negative share (everything except disapprove).
                </p>
                <div className="space-y-3">
                  {qualifying.map((a) => (
                    <div key={a.wallet}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate">
                          <span className="text-xs font-semibold">{label(a)}</span>
                          {a.name && (
                            <span className="ml-2 font-mono text-[9px] opacity-40">
                              {walletLine(a)}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest opacity-45">
                          {a.posts} posts · {Math.round(a.nonNegativeRate * 100)}% non-neg
                        </span>
                      </div>
                      <OutcomeBar outcomes={a.outcomes} total={a.posts} colors={colors} />
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-widest opacity-60">
                  {[
                    ["approve", GREEN],
                    ["conditional", GOLD],
                    ["disapprove", CORAL],
                    ["neutral", `${INK}44`],
                  ].map(([lbl, color]) => (
                    <span key={lbl} className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: color }}
                      />
                      {lbl}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {belowThreshold.length > 0 && (
              <section
                className="rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: CARD }}
              >
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  insufficient data
                </p>
                <p className="mt-1 mb-3 text-sm opacity-70">
                  {belowThreshold.length} authors posted fewer than{" "}
                  {data.thresholds.minPostsForAuthor} times. Their mixes are omitted
                  rather than shown, because at that volume the split would be noise.
                </p>
                <div className="flex flex-wrap gap-2">
                  {belowThreshold.map((a) => (
                    <span
                      key={a.wallet}
                      className="rounded-md px-2 py-1 font-mono text-[10px] opacity-55"
                      style={{ background: `${INK}0d` }}
                      title={walletLine(a)}
                    >
                      {label(a)} · {a.posts}p
                    </span>
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

function OutcomeBar({
  outcomes,
  total,
  colors,
}: {
  outcomes: Record<Stance, number>;
  total: number;
  colors: { green: string; gold: string; coral: string; ink: string };
}) {
  const t = total || 1;
  const seg: [Stance, string][] = [
    ["approve", colors.green],
    ["conditional", colors.gold],
    ["disapprove", colors.coral],
    ["neutral", `${colors.ink}44`],
  ];
  return (
    <div className="flex h-3 overflow-hidden rounded-full">
      {seg.map(([k, color]) => (
        <div
          key={k}
          style={{ width: `${(outcomes[k] / t) * 100}%`, background: color }}
          title={`${k}: ${outcomes[k]}`}
        />
      ))}
    </div>
  );
}
