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
  pick: number;
  reason: string;
  against: number[];
};

type Payload = {
  ready: boolean;
  phase: string | null;
  considered?: number;
  shortlisted?: number;
  heatsRun?: number;
  nominees?: Candidate[];
  nominations?: Nomination[];
};

const PHASE_LABEL: Record<string, string> = {
  collect: "reading the database",
  filter: "drawing the heats",
  heats: "the larvae are nominating",
  done: "nominations closed",
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

  // A nominee can be picked only once — heats never overlap — so this is 1:1.
  const byId = useMemo(() => new Map(nominees.map((n) => [n.id, n])), [nominees]);
  const nomByPick = useMemo(
    () => new Map(nominations.map((n) => [n.pick, n])),
    [nominations]
  );

  const speciesSpread = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of nominees) counts.set(n.species, (counts.get(n.species) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [nominees]);

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
            out so each larva judged its own handful that nobody else saw. One nomination
            each. Nothing could be nominated twice.
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
                { label: "heats", value: fmt(data.heatsRun) },
                { label: "nominees", value: fmt(nominees.length) },
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
              <p className="mb-6 text-sm opacity-70">
                {speciesSpread.length} species among the nominees. Most nominated:{" "}
                <span style={{ color: CORAL }}>{speciesSpread[0][0]}</span> ({speciesSpread[0][1]}).
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
