// app/lobsters/page.tsx
//
// Clawd Incarnate — the result.
//
// This page is deliberately STATIC. Every number below is hardcoded rather
// than read from redis, because the live results object gets overwritten by
// every run and was already destroyed once by a stray reset. A declared winner
// should not be able to disappear because a cron fired.
//
// If you ever run another round, that round gets its own page. This one is
// the record of what happened.

import Nav from "@/components/Nav";

// ── EDIT ME ────────────────────────────────────────────────────────────────
// Fill these from the winning observation on iNaturalist.
const WINNER = {
  species: "Norway lobster",
  sciName: "Nephrops norvegicus",
  observationId: "10487009",
  photo: "https://inaturalist-open-data.s3.amazonaws.com/photos/14581931/medium.jpg",
  observer: "peras",
  votes: 9,
  views: 10,
};

// Drop the jury image into /public with this name.
const JURY_IMAGE = "/clawd-incarnate-jury.png";

const FUNNEL = [
  { n: "25,911", label: "observations read", note: "every lobster record on iNaturalist" },
  { n: "665", label: "shortlisted", note: "research-grade, photographed, licensed" },
  { n: "609", label: "judged by a larva", note: "each one seen and ranked" },
  { n: "126", label: "red enough", note: "passed the colour gate" },
  { n: "101", label: "nominated", note: "one per larva, none twice" },
  { n: "12", label: "finalists", note: "survived the semifinal" },
  { n: "1", label: "winner", note: "" },
];

const CLAWD_SIDE = [
  "Front-facing and squared up to the camera",
  "Composed — not fleeing, thrashing or cowering",
  "A claw extended, as though holding something",
  "Faintly ridiculous dignity",
];

const BOT_SIDE = [
  "Working, not posing",
  "Plain, not prize-winning",
  "Been through it and still going",
  "Unglamorous competence",
];

export default function LobstersPage() {
  return (
    <main className="min-h-screen bg-[#0b0d10] px-4 py-10 text-[#f3f3f1]">
      <div className="page-shell">
        <Nav />

        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#e9543c]">
            larv.ai field guide · decided
          </p>
          <h1 className="mt-2 text-5xl font-bold tracking-tight">Clawd Incarnate</h1>
          <p className="mt-3 max-w-2xl text-lg text-[#8a929c]">
            Of every lobster ever recorded on iNaturalist, this is the one the hive
            chose as most clawdbotatg.
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
                🦞 clawd incarnate
              </p>
              <h2 className="mt-2 text-4xl font-bold">{WINNER.species}</h2>
              <p className="text-lg italic text-[#7a828c]">{WINNER.sciName}</p>

              <p className="mt-5 text-2xl font-bold">
                {WINNER.votes} of {WINNER.views}
              </p>
              <p className="text-[#8a929c]">
                larvae who saw it ranked it first — the highest rate in the field.
              </p>

              <a
                href={`https://www.inaturalist.org/observations/${WINNER.observationId}`}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-block font-mono text-xs text-[#e9543c] underline"
              >
                observation {WINNER.observationId} by {WINNER.observer} ↗
              </a>
            </div>
          </div>
        </section>

        {/* ── the clincher ──────────────────────────────────────────────── */}
        <section className="mb-12 rounded-2xl border border-[#2c313a] bg-[#14171d] p-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#7a828c]">
            why it stopped here
          </p>
          <p className="mt-3 text-lg">
            An earlier version of this ran on completely different machinery — a
            different way of narrowing the field, a different way of voting, no colour
            rule at all. It produced the same winner.
          </p>
          <p className="mt-3 text-[#8a929c]">
            A third round was built and ready: a press conference, then two more cuts.
            It was abandoned. When two unrelated processes land on the same animal out
            of twenty-five thousand, running a third is not a test, it&apos;s a
            formality.
          </p>
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
              The shortlist was dealt out so every larva judged its own private handful
              that no other larva was shown. One nomination each, and nothing could be
              nominated twice — so no lobster advanced because it happened to be drawn
              against weak company, and no larva&apos;s options depended on who voted
              before it.
            </p>
            <p className="mt-3 text-[#c8ced6]">
              Every nominee was then re-judged by roughly ten different larvae. Nothing
              lived or died on a single opinion.
            </p>
          </div>

          <div className="rounded-2xl border border-[#2c313a] bg-[#14171d] p-6">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#7a828c]">
              red was a gate, not a preference
            </p>
            <p className="mt-3 text-[#c8ced6]">
              Clawd is red, so a brown lobster was simply the wrong answer however good
              the photograph. As one score among several it kept getting traded away for
              a striking image; as a hard rule it could not be.
            </p>
            <p className="mt-3 text-[#c8ced6]">
              21 larvae opened their set, found nothing red enough, and nominated nobody.
              An empty heat is a real answer.
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
              <p className="mb-3 font-mono text-sm uppercase tracking-widest text-[#e9543c]">
                looks like Clawd
              </p>
              <ul className="space-y-2">
                {CLAWD_SIDE.map((t) => (
                  <li key={t} className="text-[#c8ced6]">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-3 font-mono text-sm uppercase tracking-widest text-[#5aa9b4]">
                is clawdbotatg
              </p>
              <ul className="space-y-2">
                {BOT_SIDE.map((t) => (
                  <li key={t} className="text-[#c8ced6]">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-5 text-sm text-[#7a828c]">
            Squared-up dignity and unglamorous labour are opposites. A lobster that only
            poses is a mascot with nothing behind it; one that only works is invisible.
          </p>
        </section>

        <p className="border-t border-[#2c313a] pt-6 font-mono text-xs leading-relaxed text-[#5f6772]">
          Photographs by iNaturalist contributors under their stated licences. Judgements
          were produced by language models speaking as each larva — they are opinions,
          not measurements. The jury illustration is decorative; the larvae do not have
          faces, chairs, or a gavel.
        </p>
      </div>
    </main>
  );
}
