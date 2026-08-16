// app/lobsters/page.tsx
//
// Clawd Incarnate.
//
// The funnel numbers are shown, not hidden. "12,000 considered → 600 shortlisted
// → 12 finalists → the hive voted" is a better and more honest headline than
// implying every larva squinted at twelve thousand photographs.
//
// The scatter is the load-bearing bit: two axes, not one blended score, so a
// gorgeous red poser and a battered survivor land in different corners instead
// of averaging into the same forgettable middle.

"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

type Finalist = {
  id: number;
  species: string;
  photo: string;
  page: string;
  observer: string;
  license: string | null;
  clawd: number;
  bot: number;
  both: number;
  note: string;
};

type Vote = { wallet: string; name: string; pick: number; reason: string };

type Payload = {
  ready: boolean;
  phase: string | null;
  considered?: number;
  shortlisted?: number;
  scored?: number;
  finalists?: Finalist[];
  cloud?: { id: number; clawd: number; bot: number }[];
  votes?: Vote[];
  tally?: Record<string, number>;
  championId?: number | null;
  clawdKingId?: number | null;
  botKingId?: number | null;
  updatedAt?: string;
};

const PHASE_LABEL: Record<string, string> = {
  collect: "reading the database",
  filter: "shortlisting",
  score: "scoring photographs",
  vote: "the hive is voting",
  done: "complete",
};

export default function LobstersPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, sea: SEA } = colors;

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/larvae/lobsters")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const finalists = data?.finalists || [];
  const votes = data?.votes || [];
  const tally = data?.tally || {};
  const cloud = data?.cloud || [];

  const champion = finalists.find((f) => f.id === data?.championId) || null;
  const focus = selected ?? data?.championId ?? null;
  const focused = finalists.find((f) => f.id === focus) || null;
  const focusVotes = votes.filter((v) => v.pick === focus);

  const ranked = useMemo(
    () =>
      [...finalists].sort(
        (a, b) => (tally[b.id] || 0) - (tally[a.id] || 0) || b.both - a.both
      ),
    [finalists, tally]
  );

  const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="page-shell">
        <Nav />

        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">Clawd Incarnate</h1>
          <p className="mt-2 max-w-2xl text-sm opacity-75">
            Every lobster observation on iNaturalist, read and scored on two separate
            questions: does it <em>look</em> like Clawd, and does it <em>behave</em> like
            clawdbotatg. The hive voted on the twelve that scored highest on both — one
            real animal, out there right now, that is most clawdbotatg.
          </p>
        </header>

        {loading ? (
          <p className="text-sm opacity-60">loading…</p>
        ) : !data?.ready ? (
          <section
            className="rounded-xl border p-5"
            style={{ borderColor: `${INK}22`, background: CARD }}
          >
            <p className="font-mono text-xs uppercase tracking-widest opacity-60">
              no round published yet
            </p>
            <p className="mt-2 text-sm opacity-80">
              {data?.phase
                ? `Currently ${PHASE_LABEL[data.phase] || data.phase}. ${fmt(
                    data.considered
                  )} lobsters read so far.`
                : "Run the cron route once to start a round."}
            </p>
          </section>
        ) : (
          <>
            {/* ── funnel ─────────────────────────────────────────────── */}
            <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "considered", value: fmt(data.considered) },
                { label: "shortlisted", value: fmt(data.shortlisted) },
                { label: "scored", value: fmt(data.scored) },
                { label: "larvae voted", value: fmt(votes.length) },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border p-4"
                  style={{ borderColor: `${INK}22`, background: CARD }}
                >
                  <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                    {s.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold">{s.value}</p>
                </div>
              ))}
            </section>

            {data.phase && data.phase !== "done" && (
              <p className="mb-6 font-mono text-xs uppercase tracking-widest" style={{ color: SEA }}>
                round in progress — {PHASE_LABEL[data.phase] || data.phase}
              </p>
            )}

            {/* ── champion ───────────────────────────────────────────── */}
            {champion && (
              <section
                className="mb-8 overflow-hidden rounded-xl border"
                style={{ borderColor: `${GOLD}55`, background: CARD }}
              >
                <div className="flex flex-col gap-4 p-5 sm:flex-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={champion.photo}
                    alt={champion.species}
                    className="h-48 w-48 flex-shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p
                      className="font-mono text-xs uppercase tracking-widest"
                      style={{ color: GOLD }}
                    >
                      🦞 clawd incarnate
                    </p>
                    <h2 className="mt-1 text-2xl font-bold">{champion.species}</h2>
                    <p className="mt-1 text-sm opacity-75">{champion.note}</p>
                    <div className="mt-3 flex flex-wrap gap-4 text-sm">
                      <span>
                        looks like Clawd{" "}
                        <strong style={{ color: CORAL }}>{champion.clawd}/10</strong>
                      </span>
                      <span>
                        is clawdbotatg <strong style={{ color: SEA }}>{champion.bot}/10</strong>
                      </span>
                      <span>
                        hive votes <strong>{tally[champion.id] || 0}</strong>
                      </span>
                    </div>
                    <a
                      href={champion.page}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-block font-mono text-xs underline opacity-60"
                    >
                      observed by {champion.observer} on iNaturalist ↗
                    </a>
                  </div>
                </div>
              </section>
            )}

            {/* ── the grid ───────────────────────────────────────────── */}
            {cloud.length > 0 && (
              <section
                className="mb-8 rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: CARD }}
              >
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  every scored lobster
                </p>
                <p className="mt-1 mb-4 text-sm opacity-75">
                  Two scores, never averaged. Top-right is the rare one that is both.
                </p>
                <Scatter
                  cloud={cloud}
                  finalists={finalists}
                  championId={data.championId ?? null}
                  ink={INK}
                  coral={CORAL}
                  sea={SEA}
                  gold={GOLD}
                  onPick={setSelected}
                />
                <div className="mt-3 flex justify-between font-mono text-xs opacity-60">
                  <span>← plain ·· looks like Clawd ·· red &amp; composed →</span>
                </div>
              </section>
            )}

            {/* ── focused finalist + its voters ──────────────────────── */}
            {focused && (
              <section
                className="mb-8 rounded-xl border p-5"
                style={{ borderColor: `${INK}22`, background: CARD }}
              >
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  who voted for this one
                </p>
                <p className="mt-1 text-lg font-bold">{focused.species}</p>
                {focusVotes.length === 0 ? (
                  <p className="mt-2 text-sm opacity-60">No larva picked this one.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {focusVotes.map((v) => (
                      <li key={v.wallet} className="text-sm">
                        <span className="font-bold" style={{ color: CORAL }}>
                          {v.name}
                        </span>
                        <span className="opacity-75"> — {v.reason}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {/* ── the field ──────────────────────────────────────────── */}
            <section className="mb-10">
              <p className="mb-3 font-mono text-xs uppercase tracking-widest opacity-60">
                the finalists
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {ranked.map((f) => {
                  const count = tally[f.id] || 0;
                  const active = f.id === focus;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setSelected(f.id)}
                      className="overflow-hidden rounded-xl border text-left transition"
                      style={{
                        borderColor: active ? GOLD : `${INK}22`,
                        background: CARD,
                        opacity: active ? 1 : 0.85,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.photo}
                        alt={f.species}
                        className="h-32 w-full object-cover"
                      />
                      <div className="p-3">
                        <p className="truncate text-sm font-bold">{f.species}</p>
                        <p className="mt-1 font-mono text-xs opacity-60">
                          <span style={{ color: CORAL }}>{f.clawd}</span>
                          {" / "}
                          <span style={{ color: SEA }}>{f.bot}</span>
                          {" · "}
                          {count} vote{count === 1 ? "" : "s"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <p className="font-mono text-xs opacity-50">
              Photographs from iNaturalist contributors under their stated licences.
              Scores are produced by a language model and are frequently wrong — they
              are opinions dressed as numbers, not measurements.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Scatter({
  cloud,
  finalists,
  championId,
  ink,
  coral,
  sea,
  gold,
  onPick,
}: {
  cloud: { id: number; clawd: number; bot: number }[];
  finalists: Finalist[];
  championId: number | null;
  ink: string;
  coral: string;
  sea: string;
  gold: string;
  onPick: (id: number) => void;
}) {
  const W = 520;
  const H = 380;
  const PAD = 34;

  const fx = (v: number) => PAD + (v / 10) * (W - PAD * 2);
  const fy = (v: number) => H - PAD - (v / 10) * (H - PAD * 2);

  const finalistIds = new Set(finalists.map((f) => f.id));

  // Jitter identical integer scores so a hundred 3/3s don't stack into one dot.
  const jitter = (id: number, salt: number) => (((id * 31 + salt * 17) % 9) - 4) * 1.6;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 380 }}>
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={ink} strokeOpacity={0.25} />
      <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke={ink} strokeOpacity={0.25} />

      <text x={W - PAD} y={H - PAD + 20} textAnchor="end" fontSize="10" fill={coral}>
        looks like Clawd →
      </text>
      <text
        x={-PAD - 4}
        y={PAD - 12}
        transform={`rotate(-90 ${PAD} ${PAD})`}
        fontSize="10"
        fill={sea}
      >
        is clawdbotatg →
      </text>

      {cloud.map((p) => {
        const isFinal = finalistIds.has(p.id);
        const isChamp = p.id === championId;
        return (
          <circle
            key={p.id}
            cx={fx(p.clawd) + jitter(p.id, 1)}
            cy={fy(p.bot) + jitter(p.id, 2)}
            r={isChamp ? 7 : isFinal ? 4.5 : 2.4}
            fill={isChamp ? gold : isFinal ? coral : ink}
            fillOpacity={isChamp ? 1 : isFinal ? 0.85 : 0.22}
            style={{ cursor: isFinal ? "pointer" : "default" }}
            onClick={() => isFinal && onPick(p.id)}
          />
        );
      })}
    </svg>
  );
}
