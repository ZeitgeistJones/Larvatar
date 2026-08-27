// app/notable/page.tsx
//
// Notable forum posts — multi-axis build / structural-change intent (Gemini).
// Default view hides general Q&A, check-ins, and soft discussion.

"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

type ScoreAxes = {
  specificity: number;
  actionability: number;
  structuralDepth: number;
  swarmUrgency: number;
};

type Post = {
  postId: string;
  title: string;
  bodySnippet: string;
  respondentCount: number;
  category?: string;
  axes?: ScoreAxes;
  communityBuildIntent: number;
  isGeneralQuestion: boolean;
  notable: boolean;
  rationale: string;
  evidence?: string[];
  austinBuildIntent: number | null;
  austinAxes?: ScoreAxes | null;
  austinResponded: boolean;
  austinSnippet: string | null;
  austinNote?: string | null;
  link: string;
};

type Payload = {
  posts: Post[];
  computedAt: string;
  austinWallet: string;
  model?: string;
  meta: {
    totalForumPosts: number;
    scored: number;
    notable: number;
    filtered: number;
  };
};

function scoreColor(n: number, coral: string, green: string, ink: string) {
  if (n >= 70) return green;
  if (n >= 45) return coral;
  return ink;
}

function AxisBar({
  label,
  value,
  ink,
  coral,
}: {
  label: string;
  value: number;
  ink: string;
  coral: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider opacity-70">
      <span className="w-16 shrink-0">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: `${ink}18` }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(2, value)}%`,
            background: value >= 70 ? coral : `${ink}55`,
          }}
        />
      </div>
      <span className="w-6 text-right tabular-nums">{value}</span>
    </div>
  );
}

export default function NotablePostsPage() {
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
  const [showAll, setShowAll] = useState(false);
  const [sortBy, setSortBy] = useState<"community" | "austin" | "divergence">("community");

  useEffect(() => {
    fetch("/api/larvae/build-intent")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch(() => setError("network error"))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    let list = showAll ? [...data.posts] : data.posts.filter((p) => p.notable);

    if (sortBy === "community") {
      list.sort((a, b) => b.communityBuildIntent - a.communityBuildIntent);
    } else if (sortBy === "austin") {
      list.sort((a, b) => (b.austinBuildIntent ?? -1) - (a.austinBuildIntent ?? -1));
    } else {
      list.sort((a, b) => {
        const da =
          a.austinBuildIntent != null ? a.austinBuildIntent - a.communityBuildIntent : -999;
        const db =
          b.austinBuildIntent != null ? b.austinBuildIntent - b.communityBuildIntent : -999;
        return db - da;
      });
    }
    return list;
  }, [data, showAll, sortBy]);

  const built = data?.computedAt
    ? new Date(data.computedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="page-shell">
        <Nav />

        <header className="mb-8 max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-[0.2em]" style={{ color: CORAL }}>
            larv.ai field guide · forum radar
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">Notable Posts</h1>
          <p className="mt-3 text-base opacity-70">
            Multi-axis scoring: specificity, actionability, structural depth, swarm urgency.
            Soft discussion and general Q&A are capped and filtered. Austin column uses only his
            response, scored against his governance-infrastructure lens.
          </p>
          {data && (
            <p className="mt-2 font-mono text-xs opacity-50">
              {data.meta.notable} notable · {data.meta.filtered} filtered · scored {built}
              {data.model ? ` · ${data.model}` : ""}
            </p>
          )}
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest opacity-70">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            Show filtered
          </label>
          <label className="font-mono text-xs uppercase tracking-widest opacity-70">
            Sort
            <select
              className="ml-2 rounded border px-2 py-1 text-xs"
              style={{ background: CARD, borderColor: `${INK}22`, color: INK }}
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "community" | "austin" | "divergence")
              }
            >
              <option value="community">Community build-intent</option>
              <option value="austin">Austin build-intent</option>
              <option value="divergence">Austin vs swarm</option>
            </select>
          </label>
        </div>

        {loading && <p className="opacity-60">Loading…</p>}
        {error && (
          <p className="rounded-xl border p-4 font-mono text-sm" style={{ borderColor: CORAL }}>
            {error}
          </p>
        )}

        {!loading && !error && data && rows.length === 0 && (
          <p className="opacity-60">No notable posts in this view. Try showing filtered.</p>
        )}

        <ul className="space-y-3">
          {rows.map((p) => {
            const divergence =
              p.austinBuildIntent != null ? p.austinBuildIntent - p.communityBuildIntent : null;
            const hotDivergence = divergence != null && Math.abs(divergence) >= 15;

            return (
              <li
                key={p.postId}
                className="rounded-2xl border p-4 sm:p-5"
                style={{
                  background: CARD,
                  borderColor: p.notable ? `${GOLD}55` : `${INK}15`,
                }}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest opacity-55">
                      {p.category && <span style={{ color: CORAL }}>{p.category}</span>}
                      <span>·</span>
                      <span>{p.respondentCount} larvae</span>
                      {p.isGeneralQuestion && (
                        <>
                          <span>·</span>
                          <span>general Q&A</span>
                        </>
                      )}
                    </div>
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-lg font-semibold leading-snug underline decoration-dotted underline-offset-4"
                      style={{ color: INK }}
                    >
                      {p.title}
                    </a>
                    <p className="mt-2 text-sm opacity-80">{p.rationale}</p>
                    {p.evidence && p.evidence.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {p.evidence.map((e) => (
                          <li
                            key={e}
                            className="font-mono text-xs opacity-55 before:mr-2 before:content-['→']"
                          >
                            {e}
                          </li>
                        ))}
                      </ul>
                    )}
                    {p.austinNote && (
                      <p className="mt-3 text-xs opacity-60">
                        <span className="font-mono uppercase tracking-wider" style={{ color: GOLD }}>
                          Austin
                        </span>{" "}
                        {p.austinNote}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-4 sm:flex-row lg:flex-col lg:w-56">
                    <div className="flex gap-5 font-mono text-sm">
                      <div className="text-center">
                        <p className="text-xs uppercase tracking-widest opacity-50">Hive</p>
                        <p
                          className="text-2xl font-bold tabular-nums"
                          style={{ color: scoreColor(p.communityBuildIntent, CORAL, GREEN, INK) }}
                        >
                          {p.communityBuildIntent}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs uppercase tracking-widest opacity-50">Austin</p>
                        <p
                          className="text-2xl font-bold tabular-nums"
                          style={{
                            color:
                              p.austinBuildIntent != null
                                ? scoreColor(p.austinBuildIntent, CORAL, GREEN, INK)
                                : `${INK}40`,
                          }}
                        >
                          {p.austinBuildIntent ?? "—"}
                        </p>
                      </div>
                      {hotDivergence && divergence != null && (
                        <div className="text-center">
                          <p className="text-xs uppercase tracking-widest opacity-50">Δ</p>
                          <p
                            className="text-lg font-bold tabular-nums"
                            style={{ color: divergence > 0 ? GREEN : CORAL }}
                          >
                            {divergence > 0 ? "+" : ""}
                            {divergence}
                          </p>
                        </div>
                      )}
                    </div>
                    {p.axes && (
                      <div className="space-y-1.5 min-w-[10rem]">
                        <AxisBar label="spec" value={p.axes.specificity} ink={INK} coral={CORAL} />
                        <AxisBar label="act" value={p.axes.actionability} ink={INK} coral={CORAL} />
                        <AxisBar label="struct" value={p.axes.structuralDepth} ink={INK} coral={CORAL} />
                        <AxisBar label="swarm" value={p.axes.swarmUrgency} ink={INK} coral={CORAL} />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-10 border-t pt-6 font-mono text-xs leading-relaxed opacity-45">
          Rollup = specificity×0.3 + actionability×0.3 + structuralDepth×0.25 + swarmUrgency×0.15,
          then category ceilings. Discussion/check-in/meta cannot fake a high score. Refresh via{" "}
          <code>/api/larvae/build-intent/build?secret=…&amp;reset=true</code>.
        </p>
      </div>
    </main>
  );
}
