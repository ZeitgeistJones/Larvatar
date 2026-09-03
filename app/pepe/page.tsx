// app/pepe/page.tsx
//
// Pepe Incarnate — live contest page.
// Reads /api/larvae/pepe (never calls Gemini). While the cron runs, this
// fills in: shortlist → nominees → ranking → champion.
// After a round is decided, leave this live until you hardcode a static
// winner page the way /lobsters did.

"use client";

import { useEffect, useState } from "react";
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

type Standing = { id: number; votes: number; views: number; meanRank: number };

type Judged = Candidate & {
  rank: number;
  note: string;
  green: boolean;
  judge: string;
  heatSize: number;
};

type Nomination = {
  wallet: string;
  name: string;
  pick: number | null;
  reason: string;
};

type Payload = {
  ready: boolean;
  phase: string | null;
  note?: string | null;
  considered?: number;
  shortlisted?: number;
  heatsRun?: number;
  abstentions?: number;
  greenCount?: number;
  nominees?: Candidate[];
  nominations?: Nomination[];
  standings?: Standing[];
  top?: Candidate[];
  championId?: number | null;
  judged?: Judged[];
  updatedAt?: string;
  round?: string;
};

const PHASE_LABEL: Record<string, string> = {
  collect: "Collecting frogs from iNaturalist",
  filter: "Drawing heats",
  heats: "Larvae nominating (green gate)",
  draw: "Drawing ranking slates",
  rank: "Ranking pass",
  done: "Decided",
};

export default function PepePage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, green: GREEN } = colors;
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/larvae/pepe")
        .then((r) => r.json())
        .then((d: Payload) => {
          if (!alive) return;
          setData(d);
          setErr(null);
        })
        .catch((e) => {
          if (!alive) return;
          setErr(String(e));
        });
    };
    load();
    const t = setInterval(load, 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const phase = data?.phase ?? null;
  const champion =
    data?.championId && data?.top
      ? data.top.find((c) => c.id === data.championId) ||
        data.nominees?.find((c) => c.id === data.championId)
      : null;
  const champStanding = data?.standings?.find((s) => s.id === data.championId);

  const byId = new Map((data?.nominees || []).map((c) => [c.id, c]));
  const topRows =
    data?.standings
      ?.slice(0, 12)
      .map((s) => ({ standing: s, c: byId.get(s.id) }))
      .filter((r) => r.c) || [];

  const greenJudged = (data?.judged || []).filter((j) => j.green).slice(0, 24);
  const nominations = (data?.nominations || []).filter((n) => n.pick !== null).slice(0, 20);

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="page-shell">
        <Nav />

        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em]" style={{ color: GREEN || CORAL }}>
            larv.ai field guide · pepe incarnate
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Pepe Incarnate</h1>
          <p className="mt-3 max-w-2xl text-lg opacity-70">
            Real frogs from iNaturalist. Larvae pick the one that <em>is</em> Pepe — green gate,
            then looks-like vs feels-like.
          </p>
        </header>

        {/* status strip */}
        <section
          className="mb-10 rounded-2xl border px-5 py-4"
          style={{ borderColor: `${INK}18`, background: CARD }}
        >
          {!data && !err && <p className="opacity-60">loading contest…</p>}
          {err && <p style={{ color: CORAL }}>could not load: {err}</p>}
          {data && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest opacity-50">phase</p>
                <p className="text-xl font-semibold">
                  {PHASE_LABEL[phase || ""] || phase || "not started"}
                </p>
                {data.note && <p className="mt-1 text-sm opacity-55">{data.note}</p>}
              </div>
              <div className="flex flex-wrap gap-6 font-mono text-sm">
                <Stat label="read" value={data.considered ?? 0} />
                <Stat label="shortlist" value={data.shortlisted ?? 0} />
                <Stat label="green" value={data.greenCount ?? 0} />
                <Stat label="nominees" value={data.nominees?.length ?? 0} />
                <Stat label="abstain" value={data.abstentions ?? 0} />
              </div>
            </div>
          )}
          {data?.updatedAt && (
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest opacity-40">
              updated {new Date(data.updatedAt).toLocaleString()}
              {data.round ? ` · round ${data.round}` : ""}
            </p>
          )}
        </section>

        {/* champion */}
        {champion && (
          <section
            className="mb-12 overflow-hidden rounded-2xl border"
            style={{ borderColor: `${GOLD}55`, background: CARD }}
          >
            <div className="flex flex-col gap-6 p-6 sm:flex-row">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={champion.photo}
                alt={champion.species}
                className="h-64 w-64 flex-shrink-0 rounded-xl object-cover"
              />
              <div className="min-w-0">
                <p
                  className="font-mono text-xs uppercase tracking-[0.2em]"
                  style={{ color: GOLD }}
                >
                  pepe incarnate
                </p>
                <h2 className="mt-2 text-3xl font-bold sm:text-4xl">{champion.species}</h2>
                <p className="text-lg italic opacity-55">{champion.sciName}</p>
                {champStanding && (
                  <>
                    <p className="mt-5 text-2xl font-bold">
                      {champStanding.votes} of {champStanding.views}
                    </p>
                    <p className="opacity-60">
                      first-place rankings among larvae who saw it in the ranking pass.
                    </p>
                  </>
                )}
                <a
                  href={champion.page}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-block font-mono text-xs uppercase tracking-widest underline opacity-70"
                >
                  iNaturalist · @{champion.observer}
                </a>
              </div>
            </div>
          </section>
        )}

        {!data?.ready && phase && phase !== "done" && (
          <p className="mb-10 max-w-xl text-sm opacity-60">
            Contest is running. Cron advances one slice at a time — this page refreshes every
            20s. Trigger:{" "}
            <code className="font-mono text-xs">/api/larvae/pepe/cron?secret=…</code>
          </p>
        )}

        {/* standings */}
        {topRows.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-2xl font-bold">Standings</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topRows.map(({ standing, c }, i) => (
                <a
                  key={standing.id}
                  href={c!.page}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-3 rounded-xl border p-3 transition-opacity hover:opacity-90"
                  style={{ borderColor: `${INK}15`, background: CARD }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c!.photo}
                    alt={c!.species}
                    className="h-20 w-20 flex-shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                      #{i + 1}
                    </p>
                    <p className="truncate font-semibold">{c!.species}</p>
                    <p className="text-sm opacity-55">
                      {standing.votes} votes · mean rank {standing.meanRank.toFixed(1)}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* recent nominations */}
        {nominations.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-2xl font-bold">Nominations</h2>
            <ul className="space-y-3">
              {nominations.map((n) => {
                const pick = byId.get(n.pick!);
                return (
                  <li
                    key={n.wallet}
                    className="rounded-xl border px-4 py-3"
                    style={{ borderColor: `${INK}12`, background: CARD }}
                  >
                    <p className="font-mono text-[10px] uppercase tracking-widest opacity-45">
                      {n.name}
                    </p>
                    <p className="mt-1 text-sm">
                      {pick ? (
                        <>
                          picked <strong>{pick.species}</strong>
                        </>
                      ) : (
                        "abstained"
                      )}
                      {n.reason ? ` — ${n.reason}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* green field sample */}
        {greenJudged.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-2 text-2xl font-bold">Passed the green gate</h2>
            <p className="mb-4 max-w-xl text-sm opacity-60">
              Sample of frogs a larva judged green enough to be Pepe-eligible.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {greenJudged.map((j) => (
                <a
                  key={`${j.id}-${j.judge}`}
                  href={j.page}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-xl border"
                  style={{ borderColor: `${INK}12`, background: CARD }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={j.photo} alt={j.species} className="aspect-square w-full object-cover" />
                  <div className="p-2">
                    <p className="truncate text-xs font-semibold">{j.species}</p>
                    <p className="truncate text-[11px] opacity-50">
                      {j.judge}: {j.note || "—"}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        <footer className="border-t pt-6 font-mono text-[10px] uppercase tracking-widest opacity-40"
          style={{ borderColor: `${INK}12` }}
        >
          Data: iNaturalist research-grade Hylidae + Ranidae · licensed photos only · Redis{" "}
          <code>pepe:*</code>
        </footer>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest opacity-45">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
