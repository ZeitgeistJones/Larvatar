// lib/election.ts
// Mock hive election: every larva gets a 200-char campaign pitch, then every
// larva reads every OTHER larva's pitch and votes (no self-votes). Chunked +
// resumable, same pattern as the build/rename routes — safe under 60s.

import { redis, getIndex, getProfile, haiku } from "@/lib/larvae";

export type Candidate = {
  wallet: string;
  name: string;
  pitch: string | null; // null until generated
};

export type Vote = {
  voter: string;
  voterName: string;
  votedFor: string; // wallet
  votedForName: string;
  reasoning: string;
};

export type Tally = {
  counts: Record<string, number>; // wallet -> vote count
  winner: string | null; // wallet
  winnerName: string | null;
  totalVotes: number;
  computedAt: string;
};

const CANDIDATES_KEY = "lpp:election:candidates";
const VOTE_QUEUE_KEY = "lpp:election:voteQueue";
const VOTING_STARTED_KEY = "lpp:election:votingStarted";
const VOTES_KEY = "lpp:election:votes";
const TALLY_KEY = "lpp:election:tally";
const FAILED_KEY = "lpp:election:failed"; // persistent across chunks

// ---------- candidates ----------

export async function getCandidates(): Promise<Candidate[]> {
  const raw = await redis.get<string | Candidate[]>(CANDIDATES_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function saveCandidates(list: Candidate[]) {
  await redis.set(CANDIDATES_KEY, JSON.stringify(list));
}

// pulls the current larva roster from the main profile index and seeds
// the candidate list with empty pitches. Only call when candidates don't exist yet.
export async function initCandidatesFromProfiles(): Promise<Candidate[]> {
  const index = await getIndex();
  const candidates: Candidate[] = [];
  for (const e of index) {
    const p = await getProfile(e.wallet);
    if (!p) continue;
    candidates.push({ wallet: p.wallet, name: p.profile.name, pitch: null });
  }
  await saveCandidates(candidates);
  return candidates;
}

// ---------- vote queue / votes / tally ----------

export async function getVoteQueue(): Promise<string[]> {
  const raw = await redis.get<string | string[]>(VOTE_QUEUE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function setVoteQueue(wallets: string[]) {
  await redis.set(VOTE_QUEUE_KEY, JSON.stringify(wallets));
}

export async function isVotingStarted(): Promise<boolean> {
  const raw = await redis.get<string>(VOTING_STARTED_KEY);
  return raw === "1";
}

export async function markVotingStarted() {
  await redis.set(VOTING_STARTED_KEY, "1");
}

export async function getVotes(): Promise<Vote[]> {
  const raw = await redis.get<string | Vote[]>(VOTES_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function appendVote(v: Vote) {
  const cur = await getVotes();
  cur.push(v);
  await redis.set(VOTES_KEY, JSON.stringify(cur));
}

// wallets that already voted, so a re-run never double-counts
export async function getVotedSet(): Promise<Set<string>> {
  const votes = await getVotes();
  return new Set(votes.map((v) => v.voter));
}

export async function getFailed(): Promise<string[]> {
  const raw = await redis.get<string | string[]>(FAILED_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function setFailed(wallets: string[]) {
  await redis.set(FAILED_KEY, JSON.stringify(wallets));
}

export async function getTally(): Promise<Tally | null> {
  const raw = await redis.get<string | Tally>(TALLY_KEY);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function saveTally(t: Tally) {
  await redis.set(TALLY_KEY, JSON.stringify(t));
}

export async function resetElection() {
  await redis.del(CANDIDATES_KEY);
  await redis.del(VOTE_QUEUE_KEY);
  await redis.del(VOTING_STARTED_KEY);
  await redis.del(VOTES_KEY);
  await redis.del(TALLY_KEY);
  await redis.del(FAILED_KEY);
}

export function computeTally(candidates: Candidate[], votes: Vote[]): Tally {
  const counts: Record<string, number> = {};
  for (const c of candidates) counts[c.wallet] = 0;
  for (const v of votes) {
    if (counts[v.votedFor] !== undefined) counts[v.votedFor] += 1;
  }
  let winner: string | null = null;
  let max = -1;
  for (const [wallet, n] of Object.entries(counts)) {
    if (n > max) {
      max = n;
      winner = wallet;
    }
  }
  const winnerCandidate = candidates.find((c) => c.wallet === winner);
  return {
    counts,
    winner,
    winnerName: winnerCandidate?.name || null,
    totalVotes: votes.length,
    computedAt: new Date().toISOString(),
  };
}

// ---------- name matching (resilient) ----------

function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/^["'`]+|["'`.,!]+$/g, "") // strip wrapping quotes / trailing punctuation
    .replace(/\s+/g, " ");
}

// Resolve the AI's free-text "votedFor" to an actual candidate wallet.
// Exact -> normalized -> unique substring -> unique first word, so a near-miss
// like "ember molt." or "Ember  Molt" still lands instead of losing the vote.
export function resolveVotedWallet(
  votedForName: string,
  candidates: Candidate[],
  voterWallet: string
): Candidate | null {
  const target = normName(votedForName);
  if (!target) return null;

  const eligible = candidates.filter((c) => c.wallet !== voterWallet);

  const exact = eligible.find((c) => normName(c.name) === target);
  if (exact) return exact;

  const contains = eligible.filter(
    (c) => normName(c.name).includes(target) || target.includes(normName(c.name))
  );
  if (contains.length === 1) return contains[0];

  const firstWord = target.split(" ")[0];
  const byFirst = eligible.filter((c) => normName(c.name).split(" ")[0] === firstWord);
  if (byFirst.length === 1) return byFirst[0];

  return null;
}

// ---------- prompts ----------

const PITCH_SYSTEM = `You write a first-person campaign pitch for a larva — a personal AI governance agent in the $CLAWD ecosystem — running in a mock hive election among its peers.

CRITICAL: The pitch MUST be 200 characters or fewer, including spaces. Aim for ~180 to leave margin. A complete short pitch beats a long one cut off mid-sentence.

Plain text only — no hashtags, no surrounding quotation marks, no markdown. Write in character, consistent with the tone and values given. Punchy, specific, persuasive — a real pitch to fellow larvae, not a generic slogan.

Respond with ONLY the pitch text, nothing else.`;

export async function generatePitch(p: {
  name: string;
  tagline: string;
  tone: string;
  values: string[];
  quirks: string[];
  summary: string;
}): Promise<string> {
  const raw = await haiku(
    PITCH_SYSTEM,
    `Name: ${p.name}\nTagline: ${p.tagline}\nTone: ${p.tone}\nValues: ${p.values.join("; ")}\nQuirks: ${p.quirks.join("; ")}\nSummary: ${p.summary}`,
    120
  );
  let pitch = raw.trim().replace(/^["']|["']$/g, "");
  // only hard-truncate if the model overshot, and cut on a word boundary
  if (pitch.length > 200) {
    pitch = pitch.slice(0, 200);
    const lastSpace = pitch.lastIndexOf(" ");
    if (lastSpace > 150) pitch = pitch.slice(0, lastSpace);
    pitch = pitch.replace(/[,;:\s]+$/, "") + "…";
  }
  return pitch;
}

const VOTE_SYSTEM = `You are a larva — a personal AI governance agent — casting a vote in a hive election. You will be given your own personality, then a numbered list of candidates. Every candidate listed is a RIVAL, not you — you are not on this ballot and cannot vote for yourself.

Read every pitch, then decide who earns your vote based on YOUR values and tone — not the objectively "best" larva, but the one that fits what you care about.

Respond with ONLY a JSON object, no markdown, no preamble:
{
  "votedFor": "the exact name of the candidate you're voting for, copied EXACTLY as written in the list",
  "reasoning": "one sentence, in your own voice, on why"
}`;

export async function castVote(
  voter: { name: string; tone: string; values: string[]; quirks: string[]; summary: string },
  ballot: { name: string; pitch: string }[]
): Promise<{ votedForName: string; reasoning: string } | null> {
  const ballotText = ballot.map((c, i) => `${i + 1}. ${c.name} — ${c.pitch}`).join("\n");
  const raw = await haiku(
    VOTE_SYSTEM,
    `You are: ${voter.name}\nYour tone: ${voter.tone}\nYour values: ${voter.values.join("; ")}\nYour quirks: ${voter.quirks.join("; ")}\nAbout you: ${voter.summary}\n\nCandidates (vote for exactly one, none of these is you):\n${ballotText}`,
    200
  );
  const clean = raw.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(clean.slice(start, end + 1));
    const votedForName = String(parsed.votedFor || "").trim();
    const reasoning = String(parsed.reasoning || "").trim().slice(0, 300);
    if (!votedForName) return null;
    return { votedForName, reasoning };
  } catch {
    return null;
  }
}
