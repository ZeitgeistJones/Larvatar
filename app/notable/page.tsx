// app/notable/page.tsx
//
// Notable forum posts — build / structural-change intent scores (Gemini).
// Default view hides general Q&A. Austin larva column for quick divergence scan.

"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

type Post = {
  postId: string;
  title: string;
  bodySnippet: string;
  respondentCount: number;
  communityBuildIntent: number;
  isGeneralQuestion: boolean;
  notable: boolean;
  rationale: string;
  austinBuildIntent: number | null;
  austinResponded: boolean;
  austinSnippet: string | null;
  link: string;
};

type Payload = {
  posts: Post[];
  computedAt: string;
  austinWallet: string;
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
            Each forum thread scored for build or structural-change intent — not vibes, not
            general Q&A. Community score from the whole thread; Austin column is only his larva&apos;s
            response when he posted.
          </p>
          {data && (
            <p className="mt-2 font-mono text-xs opacity-50">
              {data.meta.notable} notable · {data.meta.filtered} filtered · scored {built}
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
            Show filtered (general Q&A)
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
            const hotDivergence = divergence != null && Math.abs(divergence) >= 20;

            return (
              <li
                key={p.postId}
                className="rounded-2xl border p-4 sm:p-5"
                style={{
                  background: CARD,
                  borderColor: p.notable ? `${GOLD}55` : `${INK}15`,
                }}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-lg font-semibold leading-snug underline decoration-dotted underline-offset-4"
                      style={{ color: INK }}
                    >
                      {p.title}
                    </a>
                    {p.bodySnippet && (
                      <p className="mt-2 text-sm opacity-60 line-clamp-2">{p.bodySnippet}</p>
                    )}
                    <p className="mt-2 text-sm opacity-75">{p.rationale}</p>
                    <p className="mt-2 font-mono text-xs opacity-45">
                      {p.respondentCount} larvae ·{" "}
                      {p.isGeneralQuestion ? "general Q&A" : "build path"}
                    </p>
                    {p.austinSnippet && (
                      <p className="mt-2 text-xs opacity-55 italic">
                        Austin: {p.austinSnippet}…
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-4 font-mono text-sm">
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
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-10 border-t pt-6 font-mono text-xs leading-relaxed opacity-45">
          Scores are Gemini estimates of build / structural-change push, not votes. Run{" "}
          <code>/api/larvae/build-intent/build?secret=…</code> until done to refresh.
        </p>
      </div>
    </main>
  );
}
