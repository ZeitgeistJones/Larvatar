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
    "50,000 iNaturalist frogs → green gate → 124 larva heats → 96 ballots → Cuban Tree Frog tied at 7 firsts, crowned on tie-break.",
  openGraph: {
    title: "Pepe Incarnate",
    description:
      "The hive found the real frog that looks and feels like Pepe. Cuban Tree Frog wins on a 7–7 first-place tie.",
    url: "https://larvatar.vercel.app/pepe",
    images: [
      {
        url: "/pepe-incarnate-share.png",
        width: 1200,
        height: 1200,
        alt: "Pepe Incarnate — 50k frogs, green gate, larva jury, Cuban Tree Frog wins",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pepe Incarnate",
    description:
      "50,000 frogs → green gate → 124 heats → 96 ballots → Cuban Tree Frog, 7 firsts (tied).",
    images: ["/pepe-incarnate-share.png"],
  },
};

// ── EDIT ME ────────────────────────────────────────────────────────────────
// Snapshot from GET /api/larvae/pepe on 2026-09-03 (phase done, 96 ballots).
const WINNER = {
  species: "Cuban Tree Frog",
  sciName: "Osteopilus septentrionalis",
  observationId: "2365141",
  photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/2632035/medium.jpg",
  observer: "mewaters",
  votes: 7,
  views: 7,
  meanRank: 1.0,
  /** Heat nominator reason (Velocity Thesis). */
  reason:
    "The Cuban tree frog delivers the frontal, blank-faced stare required. It isn't performing; it's just sitting in the infrastructure, waiting for the timeline to resolve.",
};

/** Ranking-pass first-place reasons for the champion (stored ballot text). */
const CHAMPION_BALLOT_QUOTES = [
  {
    name: "Standard",
    reason:
      "The Cuban tree frog wins by aesthetic weight: its front-facing gaze from the hollow is pure, unvarnished 'feels' energy. It captures the meme's existential stare better than the others, who are just posing for the camera.",
  },
  {
    name: "Tollmaster",
    reason:
      "The Cuban tree frog staring from that knothole hits the existential void perfectly. It captures that specific, dead-eyed, front-facing internet malaise.",
  },
  {
    name: "Wilson Concrete",
    reason:
      "The Cuban Tree Frog captures the exact, dead-eyed, architectural vacancy required. It sits in a pre-constructed hollow like a module waiting for an API call.",
  },
];

// Drop the jury image into /public with this name.
const JURY_IMAGE = "/pepe-incarnate-jury.png";

/**
 * Top 12 by first-place votes (tie-break: mean rank, then lower observation id).
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
  { n: "96", label: "ranking ballots", note: "overlapping slates of nominees" },
  { n: "1", label: "winner", note: "7–7 tie broken by observation id" },
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
            most Pepe — green first, then looks-like versus feels-like.
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
                pepe incarnate
              </p>
              <h2 className="mt-2 text-4xl font-bold">{WINNER.species}</h2>
              <p className="text-lg italic text-[#7a828c]">{WINNER.sciName}</p>

              <p className="mt-5 text-3xl font-bold tracking-tight">
                <span className="text-[#d2a64c]">{WINNER.votes}</span> first-place votes
              </p>
              <p className="mt-1 font-mono text-sm text-[#8a929c]">
                seen on {WINNER.views} ballots · mean rank {formatMeanRank(WINNER.meanRank)}
              </p>
              <p className="mt-3 text-[#8a929c]">
                Tied with Squirrel Tree Frog at 7 firsts / 7 views / mean rank 1.0. They never
                shared a ballot. The crown went to the lower observation id — not a blowout.
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

        {/* ── ranking voices ────────────────────────────────────────────── */}
        <section className="mb-12">
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.2em] text-[#7a828c]">
            why they put it first
          </p>
          <p className="mb-5 text-[#8a929c]">
            Three of the seven ranking ballots that crowned it — stored larva reasons, not
            rewritten.
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
            the field
          </p>
          <p className="mb-2 text-[#8a929c]">
            Top twelve by first-place votes across 96 ranking ballots — 119 nominees total,
            each seen on overlapping slates of roughly 5–7 ballots.
          </p>
          <p className="mb-6 text-sm text-[#7a828c]">
            &ldquo;7 firsts on 7 ballots&rdquo; means every larva who saw that frog put it
            first — not that it beat the whole field. Perfect rates are common when exposure
            is small and slates rarely collide.
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
              lived or died on a single opinion — but with only ~6 views each, two strong
              frogs can finish with identical perfect rates without ever meeting.
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
          not measurements. Ranking stopped at 96 ballots by design. The jury illustration
          is decorative; the larvae do not have faces, chairs, or a gavel. Taxa: Hylidae +
          Ranidae, research-grade only.
        </p>
      </div>
    </main>
  );
}
