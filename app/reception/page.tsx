// app/reception/page.tsx
// Author Reception — how the swarm responds to different proposers.
//
// FRAMING NOTES (these are design decisions, not decoration):
//
// - The confound leads. A high approval rate is equally consistent with
//   writing good proposals and with being favoured. The page says so before
//   showing a single number, because the data cannot separate the two and
//   presenting rates without that caveat invites a conclusion they don't support.
// - Distribution, not leaderboard. A ranked table with someone at the top
//   invites a villain reading. A histogram with everyone plotted against the
//   mean invites "here is the spread", which is what the data actually shows.
// - Under-threshold authors are shown as insufficient rather than hidden or
//   given a misleading rate.
// - The per-larva-per-author matrix is NOT requested here. It exists in the
//   API behind ?relations=true.

"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

type Stance = "approve" | "conditional" | "disapprove" | "neutral";

type Author = {
  wallet: string;
  /** Specimen name, when this author holds a larva. Null otherwise. */
  name: string | null;
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

/**
 * Authors are wallets; some hold a larva and some don't. Show the specimen
 * name where one exists so this page reads like the rest of the site, and
 * fall back to a shortened wallet rather than leaving a gap.
 */
const label = (a: { name: string | null; wallet: string }) => a.name || short(a.wallet);

export default function ReceptionPage() {
  const { colors } = useTheme();
  const {
    ink: INK,
    sheet: SHEET,
    card: CARD,
    coral: CORAL,
    gold: GOLD,
    green: GREEN,
    sea: SEA,
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

  const qualifying = useMemo(
    () => (data ? data.authors.filter((a) => !a.insufficientData) : []),
    [data]
  );
  const belowThreshold = useMemo(
    () => (data ? data.authors.filter((a) => a.insufficientData) : []),
    [data]
  );

  const spread = useMemo(() => {
    if (qualifying.length === 0) return null;
    const rates = qualifying.map((a) => a.approvalRate);
    return { min: Math.min(...rates), max: Math.max(...rates) };
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
            room — how the swarm's aggregated opinion lands on posts from
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
            {/* ── The caveat, before any numbers ── */}
            <section
              className="mb-6 rounded-xl border p-5"
              style={{ borderColor: `${GOLD}55`, background: CARD }}
            >
              <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                what this can and can't tell you
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                A high approval rate is equally consistent with two very different
                explanations: that an author writes well-scoped, well-timed proposals,
                or that the swarm responds warmly to them regardless of content.
                Nothing in this data separates those. Post topic, timing, length and
                how concrete the ask was all move these numbers, and none of them are
                measured here. Read the spread as a description of what happened, not
                as an explanation of why.
              </p>
              <p className="mt-3 text-sm leading-relaxed opacity-80">
                Authors with fewer than {data.thresholds.minPostsForAuthor} posts are
                listed without a rate — at that volume a single post swings the
                percentage far enough to be meaningless.
              </p>
            </section>

            {/* ── Summary ── */}
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
                label="mean approval"
                value={`${Math.round(data.meanApprovalRate * 100)}%`}
                accent={GOLD}
              />
              <Stat
                label="posts covered"
                value={`${data.coverage.postsWithKnownAuthor}/${data.coverage.postsTotal}`}
              />
            </section>

            {/* ── Distribution ── */}
            {qualifying.length > 0 && spread && (
              <section
                className="mb-6 rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: CARD }}
              >
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  approval rate by author
                </p>
                <p className="mt-1 mb-4 text-sm opacity-70">
                  Each bar is one author with at least{" "}
                  {data.thresholds.minPostsForAuthor} posts, plotted against the mean.
                  {spread.max - spread.min < 0.25
                    ? " The spread here is narrow — authors are received broadly alike."
                    : " There is real spread between authors; the caveat above applies to reading it."}
                </p>

                <div className="space-y-2">
                  {qualifying.map((a) => {
                    const above = a.approvalRate >= data.meanApprovalRate;
                    return (
                      <div key={a.wallet} className="flex items-center gap-3">
                        <span className="w-32 shrink-0 truncate">
                          <span className="block truncate text-xs font-semibold">
                            {label(a)}
                          </span>
                          {a.name && (
                            <span className="block font-mono text-[9px] opacity-40">
                              {short(a.wallet)}
                            </span>
                          )}
                        </span>
                        <span className="w-10 shrink-0 font-mono text-[10px] uppercase tracking-widest opacity-40">
                          {a.posts}p
                        </span>
                        <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded">
                          <span
                            className="absolute inset-y-0 left-0 rounded"
                            style={{
                              width: `${Math.max(1.5, a.approvalRate * 100)}%`,
                              background: above ? GOLD : SEA,
                              opacity: 0.75,
                            }}
                          />
                          <span
                            className="absolute inset-y-0 w-px"
                            style={{
                              left: `${data.meanApprovalRate * 100}%`,
                              background: INK,
                              opacity: 0.45,
                            }}
                          />
                        </span>
                        <span className="w-10 shrink-0 text-right font-mono text-xs font-bold tabular-nums">
                          {Math.round(a.approvalRate * 100)}%
                        </span>
                      </div>
                    );
                  })}
                </div>

                <p className="mt-3 font-mono text-[10px] uppercase tracking-widest opacity-45">
                  vertical line = mean ({Math.round(data.meanApprovalRate * 100)}%) ·
                  bar = share of posts whose aggregate landed on approve
                </p>
              </section>
            )}

            {/* ── Outcome mix ── */}
            {qualifying.length > 0 && (
              <section
                className="mb-6 rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: CARD }}
              >
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  outcome mix
                </p>
                <p className="mt-1 mb-4 text-sm opacity-70">
                  Approval rate alone hides the difference between a post that was
                  hedged and one that was rejected. Most posts land on conditional.
                </p>
                <div className="space-y-3">
                  {qualifying.map((a) => (
                    <div key={a.wallet}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="min-w-0 truncate">
                          <span className="text-xs font-semibold">{label(a)}</span>
                          {a.name && (
                            <span className="ml-2 font-mono text-[9px] opacity-40">
                              {short(a.wallet)}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                          {a.posts} posts
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
                  ].map(([label, color]) => (
                    <span key={label} className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: color }}
                      />
                      {label}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* ── Below threshold ── */}
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
                  {data.thresholds.minPostsForAuthor} times. Their rates are omitted
                  rather than shown, because at that volume the number would be noise.
                </p>
                <div className="flex flex-wrap gap-2">
                  {belowThreshold.map((a) => (
                    <span
                      key={a.wallet}
                      className="rounded-md px-2 py-1 font-mono text-[10px] opacity-55"
                      style={{ background: `${INK}0d` }}
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
