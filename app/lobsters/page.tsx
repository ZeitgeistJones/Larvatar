// app/lobsters/page.tsx
//
// Clawd Incarnate — the nomination stage.
//
// Every larva was handed its own small set of lobsters that nobody else saw,
// and nominated one. So each card here is a choice a larva actually made
// between real alternatives, not a number on a scale — which is what the
// scoring pass failed at when it compressed 600 photographs into a 5-6 band.
//
// Selecting a nominee shows what it beat. The runners-up are the honest part:
// they say what the choice actually cost.

"use client";

import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

type Candidate = {
  id: number;
  species: string;
  sciName: string;
  photo: string;
  page: string;
  observer: string;
};

type Nomination = {
  wallet: string;
  name: string;
  pick: number | null;
  reason: string;
  against: number[];
  verdicts: { id: number; rank: number; note: string; red: boolean }[];
};

type Judged = {
  id: number;
  species: string;
  sciName: string;
  photo: string;
  page: string;
  observer: string;
  rank: number;
  note: string;
  red: boolean;
  judge: string;
  heatSize: number;
};

type SemiRow = { id: number; votes: number; views: number; meanRank: number };
type Standing = {
  id: number;
  liveVotes: number;
  seedRate: number;
  liveNorm: number;
  seedNorm: number;
  score: number;
};
type QA = {
  wallet: string;
  name: string;
  target: number;
  question: string;
  answer?: string;
  grounded?: boolean;
};
type Placing = {
  id: number;
  place: number;
  votes: number;
  verdict: string;
  sourced: number;
};
type FinalBallot = {
  stage: 1 | 2;
  wallet: string;
  name: string;
  pick: number;
  reason: string;
  switchedFrom?: number;
};
type SemiBallot = { wallet: string; name: string; pick: number; reason: string; order: number[] };

type Payload = {
  ready: boolean;
  phase: string | null;
  considered?: number;
  shortlisted?: number;
  heatsRun?: number;
  nominees?: Candidate[];
  nominations?: Nomination[];
  judged?: Judged[];
  abstentions?: number;
  redCount?: number;
  semi?: SemiRow[];
  semiBallots?: SemiBallot[];
  finalists?: Candidate[];
  questions?: QA[];
  finalBallots?: FinalBallot[];
  stand1?: Standing[];
  stand2?: Standing[];
  five?: Candidate[];
  championId?: number | null;
  placings?: Placing[];
};

const PHASE_LABEL: Record<string, string> = {
  collect: "reading the database",
  filter: "drawing the heats",
  heats: "the larvae are nominating",
  draw: "drawing the semifinal",
  semi: "the semifinal is running",
  dossier: "pulling the species records",
  ask: "the larvae are asking questions",
  answer: "answering from the record",
  f1: "voting on the twelve",
  f2: "the final vote",
  verdict: "writing up the result",
  done: "complete",
};

export default function LobstersPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, sea: SEA } = colors;

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/larvae/lobsters")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const nominees = data?.nominees || [];
  const nominations = data?.nominations || [];
  const judged = data?.judged || [];
  const semi = data?.semi || [];
  const semiBallots = data?.semiBallots || [];
  const finalists = data?.finalists || [];
  const questions = data?.questions || [];
  const finalBallots = data?.finalBallots || [];
  const stand1 = data?.stand1 || [];
  const stand2 = data?.stand2 || [];
  const five = data?.five || [];
  const placings = data?.placings || [];

  // A nominee can be picked only once — heats never overlap — so this is 1:1.
  const byId = useMemo(() => new Map(nominees.map((n) => [n.id, n])), [nominees]);
  const nomByPick = useMemo(
    () => new Map(nominations.filter((n) => n.pick !== null).map((n) => [n.pick as number, n])),
    [nominations]
  );

  const speciesSpread = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of nominees) counts.set(n.species, (counts.get(n.species) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [nominees]);

  const judgedById = useMemo(() => {
    const m = new Map<number, Judged>();
    for (const j of judged) m.set(j.id, j);
    return m;
  }, [judged]);

  /** Everything that was looked at and lost — the part a nominee-only page hides. */
  const alsoRan = useMemo(
    () => judged.filter((j) => j.rank > 1).sort((a, b) => a.rank - b.rank || a.species.localeCompare(b.species)),
    [judged]
  );

  const allById = useMemo(() => {
    const m = new Map<number, Candidate>();
    for (const c of [...nominees, ...finalists, ...five]) m.set(c.id, c);
    return m;
  }, [nominees, finalists, five]);

  const answered = useMemo(() => questions.filter((q) => q.answer), [questions]);
  const notInRecord = answered.filter((q) => q.grounded === false).length;
  const champion = data?.championId ? allById.get(data.championId) || null : null;
  const defections = useMemo(
    () => finalBallots.filter((b) => b.stage === 2 && b.switchedFrom !== undefined),
    [finalBallots]
  );

  const openNom = open === null ? null : nomByPick.get(open) || null;
  const openCand = open === null ? null : byId.get(open) || null;

  const fmt = (n?: number) => (n ?? 0).toLocaleString();
  const border = `${INK}22`;

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
            Every lobster observation on iNaturalist, narrowed to a shortlist, then dealt
            out so each larva judged its own handful that nobody else saw. Clawd is red,
            so only red animals are eligible — a larva holding nothing red nominates
            nothing. One nomination each, and nothing could be nominated twice.
          </p>
        </header>

        {loading ? (
          <p className="text-sm opacity-60">loading…</p>
        ) : !data?.ready ? (
          <section className="rounded-xl border p-5" style={{ borderColor: border, background: CARD }}>
            <p className="font-mono text-xs uppercase tracking-widest opacity-60">
              no round published yet
            </p>
            <p className="mt-2 text-sm opacity-80">
              {data?.phase
                ? `Currently ${PHASE_LABEL[data.phase] || data.phase}. ${fmt(data.considered)} read so far.`
                : "Run the cron route once to start a round."}
            </p>
          </section>
        ) : (
          <>
            <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "considered", value: fmt(data.considered) },
                { label: "shortlisted", value: fmt(data.shortlisted) },
                { label: "judged", value: fmt(judged.length) },
                { label: "red enough", value: fmt(data.redCount) },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border p-4" style={{ borderColor: border, background: CARD }}>
                  <p className="font-mono text-xs uppercase tracking-widest opacity-60">{s.label}</p>
                  <p className="mt-1 text-2xl font-bold">{s.value}</p>
                </div>
              ))}
            </section>

            {data.phase && data.phase !== "done" && (
              <p className="mb-6 font-mono text-xs uppercase tracking-widest" style={{ color: SEA }}>
                in progress — {PHASE_LABEL[data.phase] || data.phase}
              </p>
            )}

            {speciesSpread.length > 0 && (
              <p className="mb-2 text-sm opacity-70">
                {nominees.length} nominees across {speciesSpread.length} species. Most
                nominated: <span style={{ color: CORAL }}>{speciesSpread[0][0]}</span> (
                {speciesSpread[0][1]}).
              </p>
            )}

            {(data.abstentions ?? 0) > 0 && (
              <p className="mb-6 text-sm opacity-70">
                <span style={{ color: SEA }}>{data.abstentions}</span> of{" "}
                {nominations.length} larvae found nothing red enough in their set and
                nominated nobody. Those heats are recorded below with everything they
                rejected — an empty heat is a real answer, not a failure.
              </p>
            )}

            {/* ── the detail panel ─────────────────────────────────────── */}
            {openCand && openNom && (
              <section
                className="mb-6 rounded-xl border p-5"
                style={{ borderColor: `${GOLD}55`, background: CARD }}
              >
                <div className="flex flex-col gap-4 sm:flex-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={openCand.photo}
                    alt={openCand.species}
                    className="h-44 w-44 flex-shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                      nominated by {openNom.name}
                    </p>
                    <h2 className="mt-1 text-2xl font-bold">{openCand.species}</h2>
                    <p className="text-sm italic opacity-50">{openCand.sciName}</p>
                    <p className="mt-2 text-sm">{openNom.reason}</p>
                    <p className="mt-3 font-mono text-xs uppercase tracking-widest opacity-60">
                      beat {openNom.against.length} others in its heat
                    </p>
                    {openNom.verdicts?.length > 1 && (
                      <ul className="mt-2 space-y-1">
                        {openNom.verdicts.slice(1).map((v) => (
                          <li key={v.id} className="text-xs opacity-65">
                            <span className="font-mono">#{v.rank}</span>{" "}
                            {judgedById.get(v.id)?.species ?? "—"} — {v.note || "no comment"}
                          </li>
                        ))}
                      </ul>
                    )}
                    <a
                      href={openCand.page}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block font-mono text-xs underline opacity-60"
                    >
                      observed by {openCand.observer} on iNaturalist ↗
                    </a>
                  </div>
                </div>
              </section>
            )}

            {/* ── champion ─────────────────────────────────────────────── */}
            {champion && (
              <section
                className="mb-8 overflow-hidden rounded-xl border"
                style={{ borderColor: `${GOLD}66`, background: CARD }}
              >
                <div className="flex flex-col gap-4 p-5 sm:flex-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={champion.photo}
                    alt={champion.species}
                    className="h-52 w-52 flex-shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                      🦞 clawd incarnate
                    </p>
                    <h2 className="mt-1 text-3xl font-bold">{champion.species}</h2>
                    <p className="text-sm italic opacity-50">{champion.sciName}</p>
                    <p className="mt-2 text-sm">
                      {stand2.find((r) => r.id === champion.id)?.liveVotes ?? 0} of{" "}
                      {finalBallots.filter((b) => b.stage === 2).length} final votes.
                    </p>
                    <ul className="mt-3 space-y-1">
                      {finalBallots
                        .filter((b) => b.stage === 2 && b.pick === champion.id)
                        .slice(0, 4)
                        .map((b, i) => (
                          <li key={b.wallet + i} className="text-sm opacity-75">
                            <span className="font-bold" style={{ color: CORAL }}>{b.name}</span> —{" "}
                            {b.reason}
                          </li>
                        ))}
                    </ul>
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

            {/* ── final five ───────────────────────────────────────────── */}
            {five.length > 0 && (
              <section className="mb-8">
                <p className="mb-1 font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                  the final {five.length}
                </p>
                <p className="mb-3 text-sm opacity-75">
                  Cut from twelve on a blend of semifinal record and live vote. Nothing
                  carried into the last round — that one was decided on the day. Each
                  write-up below is assembled only from what larvae actually wrote about
                  that animal, not from looking at it again.
                </p>
                {placings.length > 0 ? (
                  <ul className="space-y-3">
                    {placings.map((pl) => {
                      const c = allById.get(pl.id);
                      if (!c) return null;
                      const won = pl.place === 1;
                      return (
                        <li
                          key={pl.id}
                          className="flex gap-4 overflow-hidden rounded-xl border p-3"
                          style={{
                            borderColor: won ? GOLD : border,
                            background: CARD,
                            opacity: won ? 1 : 0.85,
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={c.photo}
                            alt={c.species}
                            className="h-24 w-24 flex-shrink-0 rounded-lg object-cover"
                          />
                          <div className="min-w-0">
                            <p className="font-mono text-xs" style={{ color: won ? GOLD : INK }}>
                              #{pl.place} · {pl.votes} vote{pl.votes === 1 ? "" : "s"}
                            </p>
                            <p className="text-sm font-bold">{c.species}</p>
                            <p className="mt-1 text-sm opacity-75">
                              {pl.verdict || "No write-up for this one."}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    {five.map((c) => {
                      const row = stand2.find((r) => r.id === c.id);
                      const won = c.id === data.championId;
                      return (
                        <div
                          key={c.id}
                          className="overflow-hidden rounded-xl border"
                          style={{
                            borderColor: won ? GOLD : border,
                            background: CARD,
                            opacity: won ? 1 : 0.75,
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.photo} alt={c.species} className="h-28 w-full object-cover" />
                          <div className="p-2">
                            <p className="truncate text-xs font-bold">{c.species}</p>
                            <p className="mt-0.5 font-mono text-xs opacity-60">
                              {row?.liveVotes ?? 0} votes
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* ── the press conference ─────────────────────────────────── */}
            {answered.length > 0 && (
              <section className="mb-8 rounded-xl border p-5" style={{ borderColor: border, background: CARD }}>
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  the press conference
                </p>
                <p className="mt-1 mb-3 text-sm opacity-75">
                  Each larva asked one question. Answers are drawn only from the species
                  record — {notInRecord} of {answered.length} weren&apos;t covered by it,
                  which says something about how thinly these animals are documented.
                </p>
                <ul className="space-y-3">
                  {answered.slice(0, 40).map((q, i) => (
                    <li key={q.wallet + i} className="text-sm">
                      <p>
                        <span className="font-bold" style={{ color: CORAL }}>{q.name}</span>
                        <span className="opacity-50">
                          {" "}
                          on {allById.get(q.target)?.species ?? "—"} —{" "}
                        </span>
                        <span>{q.question}</span>
                      </p>
                      <p
                        className="mt-0.5 pl-3 opacity-70"
                        style={{ borderLeft: `2px solid ${q.grounded === false ? border : SEA}` }}
                      >
                        {q.answer}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── stage one standings ──────────────────────────────────── */}
            {stand1.length > 0 && (
              <section className="mb-8 rounded-xl border p-5" style={{ borderColor: border, background: CARD }}>
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  the cut from twelve
                </p>
                <p className="mt-1 mb-3 text-sm opacity-75">
                  Half semifinal record, half live vote, each side scaled against the
                  strongest in the field. A strong seed survives one bad answer; it does
                  not survive being ignored.
                </p>
                <ul className="space-y-1">
                  {stand1.map((r, i) => {
                    const c = allById.get(r.id);
                    const through = five.some((f) => f.id === r.id);
                    return (
                      <li key={r.id} className="text-sm" style={{ opacity: through ? 1 : 0.55 }}>
                        <span className="font-mono text-xs opacity-50">#{i + 1}</span>{" "}
                        <span className="font-bold">{c?.species ?? "—"}</span>
                        <span className="font-mono text-xs opacity-60">
                          {" "}
                          · {r.liveVotes} votes · seed {(r.seedRate * 100).toFixed(0)}% · score{" "}
                          {r.score.toFixed(2)}
                        </span>
                        {through ? (
                          <span className="font-mono text-xs" style={{ color: GOLD }}>
                            {" "}
                            · through
                          </span>
                        ) : (
                          <span className="font-mono text-xs opacity-50"> · out</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* ── defections ───────────────────────────────────────────── */}
            {defections.length > 0 && (
              <section className="mb-8 rounded-xl border p-5" style={{ borderColor: border, background: CARD }}>
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  who changed their mind
                </p>
                <p className="mt-1 mb-3 text-sm opacity-75">
                  {defections.length} larvae lost their candidate in the cut and had to
                  back someone else.
                </p>
                <ul className="space-y-1.5">
                  {defections.slice(0, 40).map((b, i) => (
                    <li key={b.wallet + i} className="text-sm">
                      <span className="font-bold" style={{ color: CORAL }}>{b.name}</span>
                      <span className="opacity-50">
                        {" "}
                        {allById.get(b.switchedFrom!)?.species ?? "—"} →{" "}
                        {allById.get(b.pick)?.species ?? "—"}
                      </span>
                      <span className="opacity-75"> — {b.reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── the finalists ────────────────────────────────────────── */}
            {finalists.length > 0 && (
              <section className="mb-8">
                <p className="mb-1 font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
                  the finalists
                </p>
                <p className="mb-3 text-sm opacity-75">
                  Every nominee was judged by about{" "}
                  {semi[0]?.views ?? "several"} different larvae. These came top.
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {finalists.map((c, i) => {
                    const row = semi.find((r) => r.id === c.id);
                    return (
                      <div
                        key={c.id}
                        className="overflow-hidden rounded-xl border"
                        style={{ borderColor: `${GOLD}55`, background: CARD }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.photo} alt={c.species} className="h-28 w-full object-cover" />
                        <div className="p-2">
                          <p className="font-mono text-xs" style={{ color: GOLD }}>
                            #{i + 1}
                          </p>
                          <p className="truncate text-xs font-bold">{c.species}</p>
                          <p className="mt-0.5 font-mono text-xs opacity-55">
                            {row?.votes ?? 0} of {row?.views ?? 0}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── semifinal standings ──────────────────────────────────── */}
            {semi.length > 0 && (
              <section className="mb-8 rounded-xl border p-5" style={{ borderColor: border, background: CARD }}>
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  semifinal standings
                </p>
                <p className="mt-1 mb-3 text-sm opacity-75">
                  First-place votes out of how many larvae saw it. Ties break on mean
                  placing, so a nominee with no wins can still finish above one that
                  nobody ranked highly.
                </p>
                <ul className="space-y-1">
                  {semi.slice(0, 40).map((r, i) => {
                    const c = nominees.find((n) => n.id === r.id) || finalists.find((n) => n.id === r.id);
                    const through = finalists.some((f) => f.id === r.id);
                    return (
                      <li key={r.id} className="text-sm" style={{ opacity: through ? 1 : 0.6 }}>
                        <span className="font-mono text-xs opacity-50">#{i + 1}</span>{" "}
                        <span className="font-bold">{c?.species ?? "—"}</span>
                        <span className="font-mono text-xs opacity-60">
                          {" "}
                          · {r.votes}/{r.views} · mean {r.meanRank.toFixed(2)}
                        </span>
                        {through && (
                          <span className="font-mono text-xs" style={{ color: GOLD }}>
                            {" "}
                            · through
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* ── semifinal reasoning ──────────────────────────────────── */}
            {semiBallots.length > 0 && (
              <section className="mb-8 rounded-xl border p-5" style={{ borderColor: border, background: CARD }}>
                <p className="font-mono text-xs uppercase tracking-widest opacity-60">
                  how the semifinal was argued
                </p>
                <ul className="mt-3 space-y-1.5">
                  {semiBallots.slice(0, 40).map((b, i) => {
                    const c =
                      nominees.find((n) => n.id === b.pick) || finalists.find((n) => n.id === b.pick);
                    return (
                      <li key={b.wallet + i} className="text-sm">
                        <span className="font-bold" style={{ color: CORAL }}>{b.name}</span>
                        <span className="opacity-50"> → {c?.species ?? "—"}</span>
                        <span className="opacity-75"> — {b.reason}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* ── the nominees ─────────────────────────────────────────── */}
            <section className="mb-10">
              <p className="mb-3 font-mono text-xs uppercase tracking-widest opacity-60">
                the nominees — one per larva
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {nominees.map((c) => {
                  const nom = nomByPick.get(c.id);
                  const active = c.id === open;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setOpen(active ? null : c.id)}
                      className="overflow-hidden rounded-xl border text-left transition"
                      style={{
                        borderColor: active ? GOLD : border,
                        background: CARD,
                        opacity: active ? 1 : 0.9,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.photo} alt={c.species} className="h-28 w-full object-cover" />
                      <div className="p-2">
                        <p className="truncate text-xs font-bold">{c.species}</p>
                        <p className="mt-0.5 truncate font-mono text-xs opacity-55">
                          {nom?.name ?? "—"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {alsoRan.length > 0 && (
              <section className="mb-10">
                <p className="mb-1 font-mono text-xs uppercase tracking-widest opacity-60">
                  everything else that was looked at
                </p>
                <p className="mb-3 text-sm opacity-70">
                  {alsoRan.length} lobsters were judged and passed over. Each one still got
                  a placing and a line from the larva that rejected it.
                </p>
                <ul className="space-y-1.5">
                  {alsoRan.slice(0, 120).map((j) => (
                    <li key={j.id} className="text-sm">
                      <span className="font-mono text-xs opacity-50">
                        #{j.rank}/{j.heatSize}
                      </span>{" "}
                      <a
                        href={j.page}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold underline decoration-dotted"
                      >
                        {j.species}
                      </a>
                      <span className="opacity-50"> · {j.judge}</span>
                      {!j.red && (
                        <span className="font-mono text-xs" style={{ color: SEA }}>
                          {" "}
                          · not red
                        </span>
                      )}
                      <span className="opacity-75"> — {j.note || "no comment"}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <p className="font-mono text-xs opacity-50">
              Photographs from iNaturalist contributors under their stated licences. Each
              larva saw only its own heat, so a nominee beat the handful it was drawn
              against — not the whole shortlist. Reasons are written by a language model
              speaking as each specimen.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
