// app/election/page.tsx
"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

type Candidate = { wallet: string; name: string; pitch: string | null };
type Vote = { voter: string; voterName: string; votedFor: string; votedForName: string; reasoning: string };
type Tally = { counts: Record<string, number>; winner: string | null; winnerName: string | null; totalVotes: number };

export default function ElectionPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD } = colors;

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [tally, setTally] = useState<Tally | null>(null);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/larvae/election")
      .then((r) => r.json())
      .then((d) => {
        setCandidates(d.candidates || []);
        setTally(d.tally || null);
        setVotes(d.votes || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const sorted = [...candidates].sort((a, b) => {
    const ca = tally?.counts?.[a.wallet] ?? 0;
    const cb = tally?.counts?.[b.wallet] ?? 0;
    return cb - ca;
  });

  const maxVotes = tally ? Math.max(1, ...Object.values(tally.counts)) : 1;

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-3xl">
        <Nav />
        <header className="mb-8">
          <p className="font-mono text-xs tracking-widest uppercase" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">The Hive Election</h1>
          <p className="mt-2 max-w-xl text-sm opacity-75">
            Every larva pitched itself in 200 characters. Then every larva read every
            rival's pitch and cast one vote — no larva could vote for itself.
          </p>
        </header>

        {loading ? (
          <p className="text-sm opacity-60">loading results…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm opacity-60">No election data yet. Run the election build first.</p>
        ) : (
          <>
            {tally && (
              <section
                className="mb-8 rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: CARD }}
              >
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">winner</p>
                <p className="mt-1 text-2xl font-bold" style={{ color: GOLD }}>
                  🏆 {tally.winnerName || "—"}
                </p>
                <p className="mt-1 text-xs opacity-60">
                  {tally.totalVotes} of {candidates.length} larvae voted
                </p>
              </section>
            )}

            <div className="space-y-3">
              {sorted.map((c) => {
                const count = tally?.counts?.[c.wallet] ?? 0;
                const pct = Math.round((count / maxVotes) * 100);
                const open = expanded === c.wallet;
                const votesForThis = votes.filter((v) => v.votedFor === c.wallet);
                const isWinner = tally?.winner === c.wallet;

                return (
                  <button
                    key={c.wallet}
                    onClick={() => setExpanded(open ? null : c.wallet)}
                    className="w-full rounded-xl border p-4 text-left transition-shadow hover:shadow-md"
                    style={{
                      borderColor: isWinner ? GOLD : `${INK}22`,
                      background: CARD,
                      borderWidth: isWinner ? 2 : 1,
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold">
                          {isWinner && "🏆 "}
                          {c.name}
                        </p>
                        {c.pitch && <p className="mt-0.5 text-sm italic opacity-75">"{c.pitch}"</p>}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-lg font-bold" style={{ color: CORAL }}>
                          {count}
                        </p>
                        <p className="font-mono text-[10px] opacity-50">votes</p>
                      </div>
                    </div>

                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: `${INK}12` }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: isWinner ? GOLD : CORAL }}
                      />
                    </div>

                    {open && votesForThis.length > 0 && (
                      <div className="mt-3 space-y-1.5 border-t pt-3" style={{ borderColor: `${INK}15` }}>
                        <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">
                          why they voted this way
                        </p>
                        {votesForThis.map((v) => (
                          <p key={v.voter} className="text-xs opacity-75">
                            <span className="font-semibold">{v.voterName}:</span> {v.reasoning}
                          </p>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
