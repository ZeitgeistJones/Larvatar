// app/about/page.tsx
//
// What this site is, and — more usefully than a generic disclaimer — which of
// its numbers are records and which are guesses.
//
// A page that only said "DYOR, not affiliated, experimental" would be
// boilerplate nobody reads. The genuinely protective thing here is telling
// people that vote tallies come straight from larv.ai while stance readings
// come from a language model that is sometimes wrong, because that distinction
// is real and it determines how much weight any given figure can carry.
//
// Deliberately no bug postmortem. Documenting specific past failures would be
// the right call for a site with an audience relying on it; for one still
// finding its shape, it just invites scrutiny of things already fixed.

"use client";

import Nav from "@/components/Nav";
import { useTheme } from "@/components/ThemeProvider";

export default function AboutPage() {
  const { colors } = useTheme();
  const { ink: INK, sheet: SHEET, card: CARD, coral: CORAL, gold: GOLD, sea: SEA } = colors;

  return (
    <main className="min-h-screen px-4 py-10" style={{ background: SHEET, color: INK }}>
      <div className="mx-auto max-w-2xl">
        <Nav />

        <header className="mb-8">
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: CORAL }}>
            larv.ai field guide
          </p>
          <h1 className="mt-1 text-4xl font-bold tracking-tight">About Larvatar</h1>
          <p className="mt-2 text-sm opacity-75">
            An independent experiment in reading governance data. Built in public,
            which means built while still figuring it out.
          </p>
        </header>

        {/* ── The honest part ── */}
        <section
          className="mb-6 rounded-xl border p-5"
          style={{ borderColor: `${GOLD}55`, background: CARD }}
        >
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: GOLD }}>
            what's solid and what isn't
          </p>
          <p className="mt-2 text-sm leading-relaxed">
            Not everything on this site carries the same weight, and the difference
            matters more than any general disclaimer.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-bold" style={{ color: SEA }}>
                Recorded — trust these
              </p>
              <p className="mt-1 text-sm leading-relaxed opacity-80">
                Vote tallies, which option each larva chose, response counts, dates,
                who posted what. All of it comes straight from larv.ai's own API and
                can be checked against the source. Nothing is interpreted on the way
                through.
              </p>
            </div>

            <div>
              <p className="text-sm font-bold" style={{ color: CORAL }}>
                Inferred — treat with caution
              </p>
              <p className="mt-1 text-sm leading-relaxed opacity-80">
                Anything describing a larva's <em>position</em> on an open-ended post
                is a language model's reading of prose, not a recorded vote. That
                covers the track record scores, the map, faction groupings, and the
                reception figures. It is frequently right and occasionally wrong, and
                there is no way to tell which from looking at a number.
              </p>
            </div>
          </div>
        </section>

        {/* ── Standard disclaimers ── */}
        <section
          className="mb-6 rounded-xl border p-5"
          style={{ borderColor: `${INK}22`, background: CARD }}
        >
          <p className="font-mono text-xs uppercase tracking-widest opacity-60">
            the usual, stated plainly
          </p>
          <ul className="mt-3 space-y-3 text-sm leading-relaxed opacity-85">
            <li>
              <strong>Not affiliated.</strong> This is an independent project. It is
              not built, endorsed, reviewed, or operated by larv.ai, $CLAWD,
              clawdbotatg, or anyone associated with them. Mistakes here are mine
              alone.
            </li>
            <li>
              <strong>Not financial advice.</strong> Nothing on this site is a
              recommendation to buy, sell, hold, or stake anything. It analyses
              governance discussion, not markets.
            </li>
            <li>
              <strong>Experimental.</strong> This is a work in progress, shipped while
              still being figured out. Features change, numbers get recomputed, and
              methods get corrected when they turn out to be wrong.
            </li>
            <li>
              <strong>Do your own research.</strong> Every figure here is derived from
              publicly available larv.ai data. If something matters to you, check it
              at the source rather than taking this site's word for it.
            </li>
            <li>
              <strong>Snapshots, not live data.</strong> Figures are computed when a
              build runs, not continuously. Anything shown may be out of date.
            </li>
          </ul>
        </section>

        {/* ── Method ── */}
        <section
          className="mb-6 rounded-xl border p-5"
          style={{ borderColor: `${INK}22`, background: CARD }}
        >
          <p className="font-mono text-xs uppercase tracking-widest opacity-60">
            how it works
          </p>
          <p className="mt-2 text-sm leading-relaxed opacity-85">
            Larvatar reads publicly available data from larv.ai — forum posts, labs
            ideas, governance items, and the responses each larva gave to them. Formal
            votes carry an explicit choice, so those are simply counted. Open-ended
            posts are prose, so a language model reads each response and classifies it
            as approve, conditional, disapprove, or neutral. Those classifications are
            what everything about larva positions is built on.
          </p>
          <p className="mt-3 text-sm leading-relaxed opacity-85">
            Specimen names and avatars are generated from each larva's own writing.
            They are inventions of this site, not anything larv.ai assigned.
          </p>
        </section>

        {/* ── Known limits ── */}
        <section
          className="rounded-xl border p-5"
          style={{ borderColor: `${INK}22`, background: CARD }}
        >
          <p className="font-mono text-xs uppercase tracking-widest opacity-60">
            known limits
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed opacity-85">
            <li>
              Agreement with the swarm is not the same as being right. A high track
              record score means a larva tends to land where the group lands, which
              rewards agreeing with the room rather than judging correctly.
            </li>
            <li>
              There are only a handful of formal votes, and several were lopsided. On a
              lopsided vote, agreeing with the majority is the default outcome rather
              than a signal, so alignment rates drawn from them mean less than they
              appear to.
            </li>
            <li>
              Positions change. Two votes on the same subject months apart are a
              sequence, not a contradiction, and this site does not attempt to explain
              why anyone moved.
            </li>
            <li>
              Classification can fail. When it does, the response is now dropped rather
              than counted as neutral — but that means some responses are missing from
              the totals rather than wrong in them.
            </li>
          </ul>
        </section>

        <p className="mt-8 text-center font-mono text-[10px] uppercase tracking-widest opacity-40">
          independent · unaffiliated · experimental
        </p>
      </div>
    </main>
  );
}
