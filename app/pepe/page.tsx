// app/pepe/page.tsx
//
// Pepe Incarnate — the result.
//
// This page is deliberately STATIC. Every number below is hardcoded rather
// than read from redis, because the live results object gets overwritten by
// every run and was already destroyed once on Clawd by a stray reset. A
// declared winner should not be able to disappear because a cron fired.
//
// If you ever run another round, that round gets its own page. This one is
// the record of what happened.

import Nav from "@/components/Nav";

// ── EDIT ME ────────────────────────────────────────────────────────────────
// Fill these from the winning observation on iNaturalist / pepe API.
const WINNER = {
  species: "Cuban Tree Frog",
  sciName: "Osteopilus septentrionalis",
  observationId: "2365141",
  photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/2632035/medium.jpg",
  observer: "mewaters",
  votes: 7,
  views: 7,
};

/** Top 12 by first-place votes (tie-break: mean rank). Snapshot from GET /api/larvae/pepe on 2026-09-03. */
const STANDINGS = [
  {
    rank: 1,
    species: "Cuban Tree Frog",
    sciName: "Osteopilus septentrionalis",
    observationId: "2365141",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/2632035/medium.jpg",
    observer: "mewaters",
    votes: 7,
    views: 7,
  },
  {
    rank: 2,
    species: "Squirrel Tree Frog",
    sciName: "Dryophytes squirellus",
    observationId: "3660877",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/4238920/medium.jpg",
    observer: "bridgetspencer",
    votes: 7,
    views: 7,
  },
  {
    rank: 3,
    species: "Lemon-yellow Tree Frog",
    sciName: "Hyla savignyi",
    observationId: "2604524",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/2909153/medium.jpg",
    observer: "parham_beyhaghi",
    votes: 6,
    views: 6,
  },
  {
    rank: 4,
    species: "Eastern Tree Frog",
    sciName: "Hyla orientalis",
    observationId: "10750188",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/15027203/medium.jpg",
    observer: "gvp666",
    votes: 5,
    views: 5,
  },
  {
    rank: 5,
    species: "Italian Tree Frog",
    sciName: "Hyla intermedia",
    observationId: "4282813",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/5133087/medium.jpg",
    observer: "francescovigliotti",
    votes: 4,
    views: 6,
  },
  {
    rank: 6,
    species: "Palearctic Treefrogs",
    sciName: "Hyla",
    observationId: "5583181",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/6892289/medium.jpeg",
    observer: "jakubpelka",
    votes: 4,
    views: 6,
  },
  {
    rank: 7,
    species: "Green Dotted Tree Frog",
    sciName: "Dendropsophus molitor",
    observationId: "9132700",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/12343146/medium.jpeg",
    observer: "claudurana",
    votes: 4,
    views: 6,
  },
  {
    rank: 8,
    species: "Duck-billed Tree Frog",
    sciName: "Triprion spatulatus",
    observationId: "1580899",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/1952727/medium.jpg",
    observer: "magazhu",
    votes: 4,
    views: 7,
  },
  {
    rank: 9,
    species: "Ridged Tree Frog",
    sciName: "Dryophytes plicatus",
    observationId: "12648904",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/18298207/medium.jpeg",
    observer: "franciscoacos",
    votes: 4,
    views: 6,
  },
  {
    rank: 10,
    species: "Black-spotted Casque-headed Tree Frog",
    sciName: "Trachycephalus nigromaculatus",
    observationId: "17052582",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/25802005/medium.jpeg",
    observer: "michelotto",
    votes: 4,
    views: 7,
  },
  {
    rank: 11,
    species: "Mountain Tree Frog",
    sciName: "Dryophytes eximius",
    observationId: "8636585",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/11560047/medium.jpg",
    observer: "biodefensores",
    votes: 4,
    views: 6,
  },
  {
    rank: 12,
    species: "Green Treefrog",
    sciName: "Dryophytes cinereus",
    observationId: "6797664",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/8646590/medium.jpg",
    observer: "tigerswallowtail",
    votes: 3,
    views: 6,
  },
];

const FUNNEL = [
  { n: "50,000", label: "observations read", note: "Hylidae + Ranidae on iNaturalist" },
  { n: "800", label: "shortlisted", note: "research-grade, photographed, licensed" },
  { n: "726", label: "judged by a larva", note: "each one seen in a heat" },
  { n: "288", label: "green enough", note: "passed the colour gate" },
  { n: "119", label: "nominated", note: "one per larva, none twice" },
  { n: "96", label: "ranking ballots", note: "overlapping slates of nominees" },
  { n: "1", label: "winner", note: "" },
];

const LOOKS_SIDE = [
  "Front-facing, eyes toward the camera",
  "That blank or faintly smug mouth",
  "Classic meme silhouette, not a side profile in a swamp",
  "Reads as Pepe before it reads as wildlife",
];

const FEELS_SIDE = [
  "Blank internet energy",
  "Not glamorous, not photographer-of-the-year",
  "A little sad or resigned",
  "Staring into the timeline",
];

export default function PepePage() {
  return (
    <main className="min-h-screen bg-[#0b0d10] px-4 py-10 text-[#f3f3f1]">
      <div className="page-shell">
        <Nav />

        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#6fbf73]">
            larv.ai field guide · decided
          </p>
          <h1 className="mt-2 text-5xl font-bold tracking-tight">Pepe Incarnate</h1>
          <p className="mt-3 max-w-2xl text-lg text-[#8a929c]">
            Of the frogs recorded on iNaturalist, this is the one the hive chose as
            most Pepe — green first, then looks-like versus feels-like.
          </p>
        </header>

        {/* ── hero: the champion ────────────────────────────────────────── */}
        <figure className="mb-10 overflow-hidden rounded-2xl border border-[#2c313a]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={WINNER.photo}
            alt={`${WINNER.species} — Pepe Incarnate`}
            className="max-h-[70vh] w-full object-cover object-center"
          />
        </figure>

        {/* ── the verdict ───────────────────────────────────────────────── */}
        <section className="mb-12 overflow-hidden rounded-2xl border border-[#d2a64c]/50 bg-[#14171d]">
          <div className="flex flex-col gap-6 p-6 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={WINNER.photo}
              alt={WINNER.species}
              className="h-64 w-64 flex-shrink-0 rounded-xl object-cover"
            />
            <div className="min-w-0">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#d2a64c]">
                pepe incarnate
              </p>
              <h2 className="mt-2 text-4xl font-bold">{WINNER.species}</h2>
              <p className="text-lg italic text-[#7a828c]">{WINNER.sciName}</p>

              <p className="mt-5 text-2xl font-bold">
                {WINNER.votes} of {WINNER.views}
              </p>
              <p className="text-[#8a929c]">
                larvae who saw it ranked it first — every ballot that met it put it
                on top.
              </p>

              <a
                href={`https://www.inaturalist.org/observations/${WINNER.observationId}`}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-block font-mono text-xs text-[#6fbf73] underline"
              >
                observation {WINNER.observationId} by {WINNER.observer} ↗
              </a>
            </div>
          </div>
        </section>

        {/* ── the field: top twelve ─────────────────────────────────────── */}
        <section className="mb-12">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-[#7a828c]">
            the field
          </p>
          <p className="mb-6 text-[#8a929c]">
            Top twelve by first-place votes across 96 ranking ballots — 119 nominees
            total, each seen on overlapping slates.
          </p>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {STANDINGS.map((frog) => {
              const champion = frog.rank === 1;
              return (
                <li
                  key={frog.observationId}
                  className={`overflow-hidden rounded-2xl border bg-[#14171d] ${
                    champion ? "border-[#d2a64c]/50" : "border-[#2c313a]"
                  }`}
                >
                  <a
                    href={`https://www.inaturalist.org/observations/${frog.observationId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group block"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={frog.photo}
                        alt={frog.species}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                      />
                      <span
                        className={`absolute left-3 top-3 rounded-full px-2.5 py-1 font-mono text-xs font-bold ${
                          champion
                            ? "bg-[#d2a64c] text-[#0b0d10]"
                            : "bg-[#0b0d10]/80 text-[#f3f3f1]"
                        }`}
                      >
                        #{frog.rank}
                      </span>
                    </div>
                    <div className="p-4">
                      <p className="font-bold leading-snug">{frog.species}</p>
                      <p className="mt-0.5 text-sm italic text-[#7a828c]">{frog.sciName}</p>
                      <p className="mt-3 font-mono text-sm">
                        <span className="text-[#d2a64c]">{frog.votes}</span>
                        <span className="text-[#8a929c]"> of {frog.views} first</span>
                      </p>
                      <p className="mt-1 font-mono text-xs text-[#6fbf73] group-hover:underline">
                        {frog.observationId} · {frog.observer} ↗
                      </p>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── the funnel ────────────────────────────────────────────────── */}
        <section className="mb-12">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-[#7a828c]">
            how it got here
          </p>
          <ul className="divide-y divide-[#2c313a] border-y border-[#2c313a]">
            {FUNNEL.map((s) => (
              <li key={s.label} className="flex items-baseline gap-5 py-3">
                <span className="w-24 flex-shrink-0 text-right text-2xl font-bold">
                  {s.n}
                </span>
                <span className="w-44 flex-shrink-0 font-mono text-xs uppercase tracking-widest text-[#8a929c]">
                  {s.label}
                </span>
                <span className="text-sm text-[#7a828c]">{s.note}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── the method ────────────────────────────────────────────────── */}
        <section className="mb-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#2c313a] bg-[#14171d] p-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#7a828c]">
              nobody saw the same set
            </p>
            <p className="mt-3 text-[#c8ced6]">
              The shortlist was dealt into private heats so every larva judged its own
              handful that no other larva was shown. One nomination each, and nothing
              could be nominated twice — so no frog advanced because it happened to be
              drawn against weak company.
            </p>
            <p className="mt-3 text-[#c8ced6]">
              Nominees were then re-judged across overlapping ranking slates. Nothing
              lived or died on a single opinion.
            </p>
          </div>

          <div className="rounded-2xl border border-[#2c313a] bg-[#14171d] p-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#7a828c]">
              green was a gate, not a preference
            </p>
            <p className="mt-3 text-[#c8ced6]">
              Pepe is green, so a brown toad was simply the wrong answer however funny
              or well-photographed. As one score among several it kept getting traded
              away for a striking image; as a hard rule it could not be.
            </p>
            <p className="mt-3 text-[#c8ced6]">
              Two larvae opened their set, found nothing green enough, and nominated
              nobody. An empty heat is a real answer.
            </p>
          </div>
        </section>

        {/* ── the criteria ──────────────────────────────────────────────── */}
        <section className="mb-12">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-[#7a828c]">
            what they were looking for
          </p>
          <p className="mb-5 text-[#8a929c]">
            Two halves that pull against each other. The winner had to resolve both.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-3 font-mono text-sm uppercase tracking-widest text-[#6fbf73]">
                looks like Pepe
              </p>
              <ul className="space-y-2">
                {LOOKS_SIDE.map((t) => (
                  <li key={t} className="text-[#c8ced6]">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-3 font-mono text-sm uppercase tracking-widest text-[#5aa9b4]">
                feels like Pepe
              </p>
              <ul className="space-y-2">
                {FEELS_SIDE.map((t) => (
                  <li key={t} className="text-[#c8ced6]">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-5 text-sm text-[#7a828c]">
            Meme silhouette and blank timeline energy are opposites. A frog that only
            poses is a mascot with nothing behind it; one that only sulks is invisible.
          </p>
        </section>

        <p className="border-t border-[#2c313a] pt-6 font-mono text-xs leading-relaxed text-[#5f6772]">
          Photographs by iNaturalist contributors under their stated licences. Judgements
          were produced by language models speaking as each larva — they are opinions,
          not measurements. Taxa: Hylidae + Ranidae, research-grade only.
        </p>
      </div>
    </main>
  );
}
