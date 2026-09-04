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

import type { Metadata } from "next";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Pepe Incarnate — Larvatar",
  description:
    "iNaturalist frogs → green gate → larva heats → final vote. The larvae picked a Cuban Tree Frog as the real Pepe.",
  openGraph: {
    title: "Pepe Incarnate",
    description:
      "AI lobster-larvae hunted for a real frog that feels like the meme. Cuban Tree Frog won.",
    url: "https://larvatar.vercel.app/pepe",
    images: [
      {
        url: "/pepe-incarnate-share.png",
        width: 1200,
        height: 1384,
        alt: "Pepe Incarnate — meme vs Cuban Tree Frog, finalists, what larvae looked for",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pepe Incarnate",
    description:
      "Larvae hunted for a real frog that feels like Pepe. Cuban Tree Frog won.",
    images: ["/pepe-incarnate-share.png"],
  },
};

// ── EDIT ME ────────────────────────────────────────────────────────────────
// Snapshot from GET /api/larvae/pepe on 2026-09-03 after equal-exposure final.
const WINNER = {
  species: "Cuban Tree Frog",
  sciName: "Osteopilus septentrionalis",
  observationId: "2365141",
  photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/2632035/medium.jpg",
  observer: "mewaters",
  /** Final-round firsts / views (equal exposure). Snapshot from pepe:final after freeze. */
  votes: 9,
  views: 15,
  meanRank: 1.8,
  /** Open-ranking record before the final. */
  openVotes: 7,
  openViews: 7,
  /** Heat nominator reason (Velocity Thesis). */
  reason:
    "The Cuban tree frog delivers the frontal, blank-faced stare required. It isn't performing; it's just sitting in the infrastructure, waiting for the timeline to resolve.",
};

/** Final-round first-place reasons for the champion (stored ballot text). */
const CHAMPION_BALLOT_QUOTES = [
  {
    name: "Iterant",
    reason:
      "The Cuban frog captures the specific, existential detachment of the meme. It isn't performing for a lens; it is trapped in the infrastructure of a knot hole. This is the authentic, cynical aesthetic I demand.",
  },
  {
    name: "Kinkin",
    reason:
      "The Cuban tree frog possesses the requisite 'void-staring' aesthetic and structural isolation. It lacks the performative posture of the others, embodying the existential detachment of the Feels Guy with the necessary zero-context architectural framing.",
  },
  {
    name: "Federationist",
    reason:
      "The Cuban tree frog wins by feeling. It doesn't just look like the meme — it inhabits the void, staring out from its enclosure with that perfect, resigned, internet-native smugness. Pure signal, zero performative wildlife aesthetic.",
  },
];

/**
 * Near-perfect frogs invited to the equal-exposure final.
 * Open = uneven ranking pass. Final = every larva saw every finalist.
 */
const FINALISTS = [
  {
    rank: 1,
    species: "Cuban Tree Frog",
    sciName: "Osteopilus septentrionalis",
    observationId: "2365141",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/2632035/medium.jpg",
    observer: "mewaters",
    openVotes: 7,
    openViews: 7,
    openMeanRank: 1.0,
    finalVotes: 9,
    finalViews: 15,
    finalMeanRank: 1.8,
  },
  {
    rank: 2,
    species: "Eastern Tree Frog",
    sciName: "Hyla orientalis",
    observationId: "10750188",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/15027203/medium.jpg",
    observer: "gvp666",
    openVotes: 5,
    openViews: 5,
    openMeanRank: 1.0,
    finalVotes: 3,
    finalViews: 15,
    finalMeanRank: 2.533,
  },
  {
    rank: 3,
    species: "Lemon-yellow Tree Frog",
    sciName: "Hyla savignyi",
    observationId: "2604524",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/2909153/medium.jpg",
    observer: "parham_beyhaghi",
    openVotes: 6,
    openViews: 6,
    openMeanRank: 1.0,
    finalVotes: 2,
    finalViews: 15,
    finalMeanRank: 2.467,
  },
  {
    rank: 4,
    species: "Squirrel Tree Frog",
    sciName: "Dryophytes squirellus",
    observationId: "3660877",
    photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/4238920/medium.jpg",
    observer: "bridgetspencer",
    openVotes: 7,
    openViews: 7,
    openMeanRank: 1.0,
    finalVotes: 1,
    finalViews: 15,
    finalMeanRank: 3.2,
  },
];

// Drop the jury image into /public with this name.
const JURY_IMAGE = "/pepe-incarnate-jury.png";

/**
 * Top 12 by first-place votes in the open ranking pass (before the final).
 * Snapshot from GET /api/larvae/pepe on 2026-09-03.
 * `reason` = heat nomination reason (or heat note when the nominator referred to image numbers).
 */
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
    meanRank: 1.0,
    reason:
      "The Cuban tree frog delivers the frontal, blank-faced stare required. It isn't performing; it's just sitting in the infrastructure, waiting for the timeline to resolve.",
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
    meanRank: 1.0,
    reason:
      "The squirrel tree frog in the pipe captures the essence: isolated, front-facing, and visibly tired of the infrastructure. It has the correct color, the correct gaze, and feels like it belongs in the timeline, not a textbook.",
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
    meanRank: 1.0,
    reason:
      "Front-facing, blank-eyed, and smugly stoic. This is the only candidate that captures the meme's infrastructure.",
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
    meanRank: 1.0,
    reason:
      "The third frog alone possesses the requisite front-facing, blankly cynical energy. It is the only candidate that balances the necessary green hue with the specific, world-weary stare required for the role.",
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
    meanRank: 1.333,
    reason:
      "The Italian tree frog has the frontal, blank-faced stare that anchors the meme. It captures the resignation of someone watching a project fail in real-time. It ships the vibe immediately.",
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
    meanRank: 1.333,
    reason:
      "The winner delivers the exact frontal, dead-eyed gaze that defines the meme. It's vibrant, distinct, and holds the screen with the audacity of a project that knows it's hitting 100M. The rest are noise.",
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
    meanRank: 1.333,
    reason:
      "Frontal, wide-eyed, expressionless stare. This specimen possesses the necessary aesthetic alignment with the source material.",
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
    meanRank: 1.429,
    reason:
      "The duck-billed frog alone delivers the essential Pepe optics: a static, front-facing, slightly unhinged stare that mimics the meme's signature void-gaze. No other candidate matched the visual requirements for this high-value nomination.",
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
    meanRank: 1.5,
    reason:
      "The frontal posture and wide, resigned mouth are the exact architectural blueprint of the Pepe meme.",
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
    meanRank: 1.571,
    reason:
      "The chosen frog has the necessary frontal orientation and vacant, wide-eyed stare. It bypasses the 'nature photography' glamour trap to mirror the meme's signature, detached resignation perfectly. High signal-to-noise ratio.",
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
    meanRank: 1.667,
    reason:
      "Only the top pick demonstrates the necessary frontal alignment and consistent, flat green hue to represent the meme architecture. All other candidates suffer from poor colour saturation or incorrect orientation, failing our verification standards.",
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
    meanRank: 1.667,
    reason:
      "The top pick provides the required green saturation and successfully achieves the necessary frontal, blank-stare gaze required to replicate the meme's existential energy.",
  },
];

const FUNNEL = [
  { n: "50,000", label: "observations read", note: "Hylidae + Ranidae on iNaturalist" },
  { n: "800", label: "shortlisted", note: "research-grade, photographed, licensed" },
  { n: "726", label: "judged by a larva", note: "each one seen in a heat" },
  { n: "288", label: "green enough", note: "passed the colour gate" },
  { n: "119", label: "nominated", note: "one per larva, none twice" },
  { n: "96", label: "open ranking ballots", note: "overlapping slates — produced the candidates" },
  { n: "4", label: "finalists", note: "near-perfect first-place rates (7/7, 7/7, 6/6, 5/5)" },
  { n: "15", label: "final ballots", note: "every larva saw every finalist" },
  { n: "1", label: "winner", note: "Cuban Tree Frog — 9 of 15 firsts" },
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

function formatMeanRank(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

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
            most Pepe — green first, then looks-like versus feels-like. Open ranking
            found the candidates; an equal-exposure final crowned the champion.
          </p>
        </header>

        {/* ── the jury ──────────────────────────────────────────────────── */}
        <figure className="mb-10 overflow-hidden rounded-2xl border border-[#2c313a]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={JURY_IMAGE} alt="The larvae jury delivering its verdict" className="w-full" />
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
                pepe incarnate · final champion
              </p>
              <h2 className="mt-2 text-4xl font-bold">{WINNER.species}</h2>
              <p className="text-lg italic text-[#7a828c]">{WINNER.sciName}</p>

              <p className="mt-5 text-3xl font-bold tracking-tight">
                <span className="text-[#d2a64c]">{WINNER.votes}</span> of {WINNER.views}{" "}
                final firsts
              </p>
              <p className="mt-1 font-mono text-sm text-[#8a929c]">
                mean rank {formatMeanRank(WINNER.meanRank)} · every finalist on every
                ballot
              </p>
              <p className="mt-3 text-[#8a929c]">
                Open ranking had it tied 7–7 with Squirrel Tree Frog (never on the same
                slate — crowned only by lower observation id). The final put all four
                near-perfect frogs on the same ballots. Cuban won outright. Champion
                unchanged.
              </p>

              <blockquote className="mt-5 border-l-2 border-[#d2a64c]/60 pl-4 text-[#c8ced6]">
                {WINNER.reason}
              </blockquote>
              <p className="mt-2 font-mono text-xs text-[#7a828c]">
                heat nomination · Velocity Thesis
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

        {/* ── final head-to-head ────────────────────────────────────────── */}
        <section className="mb-12">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-[#7a828c]">
            the final
          </p>
          <p className="mb-2 text-[#8a929c]">
            Four frogs with near-perfect open-ranking rates (firsts ≥ 5 and ≥ 80% of
            views, or ≥ 6 firsts). Fifteen larvae each ranked every finalist.
          </p>
          <p className="mb-6 text-sm text-[#7a828c]">
            This is the crown. Open ranking only produced the shortlist — it could not
            separate Cuban from Squirrel when they never shared a ballot.
          </p>
          <ul className="grid gap-5 sm:grid-cols-2">
            {FINALISTS.map((frog) => {
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
                    className="group flex gap-4 p-4"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={frog.photo}
                      alt={frog.species}
                      className="h-28 w-28 flex-shrink-0 rounded-xl object-cover"
                    />
                    <div className="min-w-0">
                      <p
                        className={`font-mono text-xs uppercase tracking-widest ${
                          champion ? "text-[#d2a64c]" : "text-[#7a828c]"
                        }`}
                      >
                        final #{frog.rank}
                      </p>
                      <p className="mt-1 font-bold leading-snug">{frog.species}</p>
                      <p className="text-sm italic text-[#7a828c]">{frog.sciName}</p>
                      <p className="mt-3 text-xl font-bold tracking-tight">
                        <span className="text-[#d2a64c]">{frog.finalVotes}</span>
                        <span className="text-[#f3f3f1]"> / {frog.finalViews}</span>
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-[#8a929c]">
                        final mean rank {formatMeanRank(frog.finalMeanRank)}
                      </p>
                      <p className="mt-2 font-mono text-xs text-[#5f6772]">
                        open ranking {frog.openVotes}/{frog.openViews} · mean{" "}
                        {formatMeanRank(frog.openMeanRank)}
                      </p>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── ranking voices ────────────────────────────────────────────── */}
        <section className="mb-12">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-[#7a828c]">
            why they put it first
          </p>
          <p className="mb-5 text-[#8a929c]">
            Three of the eleven final ballots that crowned it — stored larva reasons,
            not rewritten.
          </p>
          <ul className="space-y-4">
            {CHAMPION_BALLOT_QUOTES.map((q) => (
              <li
                key={q.name}
                className="rounded-2xl border border-[#2c313a] bg-[#14171d] px-5 py-4"
              >
                <p className="text-[#c8ced6]">&ldquo;{q.reason}&rdquo;</p>
                <p className="mt-2 font-mono text-xs text-[#7a828c]">{q.name}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ── the field: top twelve ─────────────────────────────────────── */}
        <section className="mb-12">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-[#7a828c]">
            open ranking · the field
          </p>
          <p className="mb-2 text-[#8a929c]">
            Top twelve by first-place votes across 96 open ranking ballots — 119
            nominees total, each seen on overlapping slates of roughly 5–7 ballots.
            This pass produced the finalists; it did not decide the champion.
          </p>
          <p className="mb-6 text-sm text-[#7a828c]">
            &ldquo;7 firsts on 7 ballots&rdquo; means every larva who saw that frog put
            it first — not that it beat the whole field. Perfect rates are common when
            exposure is small and slates rarely collide.
          </p>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {STANDINGS.map((frog) => {
              const finalist = FINALISTS.some((f) => f.observationId === frog.observationId);
              return (
                <li
                  key={frog.observationId}
                  className={`overflow-hidden rounded-2xl border bg-[#14171d] ${
                    finalist ? "border-[#d2a64c]/40" : "border-[#2c313a]"
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
                      <span className="absolute left-3 top-3 rounded-full bg-[#0b0d10]/80 px-2.5 py-1 font-mono text-xs font-bold text-[#f3f3f1]">
                        #{frog.rank}
                      </span>
                      {finalist ? (
                        <span className="absolute right-3 top-3 rounded-full bg-[#d2a64c] px-2.5 py-1 font-mono text-xs font-bold text-[#0b0d10]">
                          finalist
                        </span>
                      ) : null}
                    </div>
                    <div className="p-4">
                      <p className="font-bold leading-snug">{frog.species}</p>
                      <p className="mt-0.5 text-sm italic text-[#7a828c]">{frog.sciName}</p>

                      <p className="mt-3 text-xl font-bold tracking-tight">
                        <span className="text-[#d2a64c]">{frog.votes}</span>
                        <span className="text-[#f3f3f1]"> firsts</span>
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-[#8a929c]">
                        on {frog.views} ballots · mean rank {formatMeanRank(frog.meanRank)}
                      </p>

                      <p className="mt-3 text-sm leading-snug text-[#a8b0ba]">{frog.reason}</p>

                      <p className="mt-3 font-mono text-xs text-[#6fbf73] group-hover:underline">
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
              open ranking found candidates
            </p>
            <p className="mt-3 text-[#c8ced6]">
              The shortlist was dealt into private heats so every larva judged its own
              handful. Nominees were then re-judged across overlapping ranking slates.
              With only ~6 views each, two strong frogs can finish with identical perfect
              rates without ever meeting — Cuban and Squirrel both went 7/7.
            </p>
            <p className="mt-3 text-[#c8ced6]">
              Near-perfect rates (7/7, 6/6, 5/5) became the finalist cut. That is not a
              championship; it is a shortlist.
            </p>
          </div>

          <div className="rounded-2xl border border-[#2c313a] bg-[#14171d] p-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#7a828c]">
              equal exposure decided it
            </p>
            <p className="mt-3 text-[#c8ced6]">
              Fifteen larvae each saw all four finalists on the same slate. No
              observation-id tie-break. Cuban took 9 firsts; Squirrel — tied for first
              in the open ranking — fell to one.
            </p>
            <p className="mt-3 text-[#c8ced6]">
              Green stayed a hard gate in the heats. Two larvae opened their set, found
              nothing green enough, and nominated nobody.
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
          not measurements. Open ranking stopped at 96 ballots by design; the final ran
          15 equal-exposure ballots among four near-perfect frogs. The jury illustration
          is decorative; the larvae do not have faces, chairs, or a gavel. Taxa: Hylidae +
          Ranidae, research-grade only.
        </p>
      </div>
    </main>
  );
}
