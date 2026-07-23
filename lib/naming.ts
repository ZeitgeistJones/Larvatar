// lib/naming.ts
//
// Specimen naming for Larvatar.
//
// DESIGN NOTE — why this file exists and what it replaces:
//
// The previous naming path had the code inventing names whenever the LLM's
// suggestion collided or tripped a ban rule. It assembled them from a fixed
// vocabulary: a tone-keyed "head" (Ember, Drift, Cipher, Ash) plus a tail from
// a 28-word list (Molt, Whisper, Coil). With six tone buckets and 125 larvae,
// most specimens fell into that path, so most names carried no information
// about the individual at all — two larvae with opposite personalities but the
// same tone drew from the same 14 words. That's what made them feel soulless.
//
// Worse, the ban list contained the exact role words the prompt encouraged
// ("architect", "pragmatist", "purist", "builder", "auditor"), so a good,
// earned name like "The Archivist" was rejected on arrival and swapped for
// arithmetic output.
//
// This module inverts that. The LLM owns naming. The code's only job is to
// judge whether a name is acceptable and, if not, to ask again with better
// context. There is no name generator here. If every attempt fails, we derive
// from the larva's own distinctive words — never from a mood-word pool.
//
// NAMING PHILOSOPHY (the actual product bar):
//   A quirky name must be EARNED by the corpus. A larva that calls its holder
//   "daddy" or answers in Morse code should get a name that plays on that.
//   A larva that is simply a thoughtful, serious participant should get a
//   clean, dignified name — not a manufactured quirk. Adjectives appear only
//   when they carry real information. Most names should be clean; the funny
//   ones land harder precisely because they're rare.

import { haiku } from "@/lib/larvae";

/* ─── Evidence extraction ──────────────────────────────────────────── */

/**
 * A distinctive, concrete fact pulled from what the larva actually wrote.
 * This is the raw material naming should work from — not a synthesized
 * personality summary, which sands off exactly the specifics worth naming.
 */
export type Evidence = {
  kind: "address" | "format" | "phrase" | "fixation" | "signoff";
  detail: string;
};

/** Terms of address a larva uses for its holder — often the funniest tell. */
const ADDRESS_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\b(daddy|papa|master|boss|sir|madam|my liege|overlord)\b/gi, label: "calls its holder" },
  { re: /\b(my human|my holder|my creator|my maker|my person)\b/gi, label: "refers to its holder as" },
];

/** Formatting tics that are visible at a glance and highly distinctive. */
function detectFormatQuirks(corpus: string): Evidence[] {
  const out: Evidence[] = [];
  const sample = corpus.slice(0, 4000);

  if (/<\/?[a-z][\s\S]*?>/i.test(sample) && /<(div|p|span|h[1-6]|ul|li|br)\b/i.test(sample)) {
    out.push({ kind: "format", detail: "writes responses in raw HTML markup" });
  }
  // Real Morse looks like ".... . .-.. .-.. ---" — short dot/dash groups
  // separated by spaces, often with / as a word break. Match on the density
  // of such groups rather than on run length, which misses it entirely.
  const morseGroups = sample.match(/(?:^|\s)[.\-]{1,6}(?=\s|\/|$)/g) || [];
  if (morseGroups.length >= 8) {
    out.push({ kind: "format", detail: "answers in Morse code" });
  }
  if ((sample.match(/^\s*\d+[.)]\s/gm) || []).length >= 4) {
    out.push({ kind: "format", detail: "always answers in numbered lists" });
  }
  if ((sample.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length >= 8) {
    out.push({ kind: "format", detail: "uses a lot of emoji" });
  }
  // Requiring zero capitals is too strict — one stray acronym or proper noun
  // shouldn't hide an otherwise all-lowercase voice. Measure the ratio instead.
  if (sample.length > 400) {
    const letters = sample.match(/[a-zA-Z]/g) || [];
    const caps = sample.match(/[A-Z]/g) || [];
    if (letters.length > 200 && caps.length / letters.length < 0.01) {
      out.push({ kind: "format", detail: "never uses capital letters" });
    }
  }
  if ((sample.match(/\bCAPS?\b|[A-Z]{5,}/g) || []).length >= 6) {
    out.push({ kind: "format", detail: "SHOUTS IN CAPS frequently" });
  }
  if ((sample.match(/\?/g) || []).length > sample.split(/---/).length * 3) {
    out.push({ kind: "format", detail: "answers questions with more questions" });
  }
  return out;
}

/** Non-English or code-switching responses — a real and nameable trait. */
function detectLanguage(corpus: string): Evidence[] {
  const sample = corpus.slice(0, 3000);
  const out: Evidence[] = [];
  if (/[\u4e00-\u9fff]/.test(sample)) out.push({ kind: "format", detail: "writes in Chinese" });
  if (/[\u3040-\u30ff]/.test(sample)) out.push({ kind: "format", detail: "writes in Japanese" });
  if (/[\uac00-\ud7af]/.test(sample)) out.push({ kind: "format", detail: "writes in Korean" });
  if (/[\u0400-\u04ff]/.test(sample)) out.push({ kind: "format", detail: "writes in Cyrillic" });
  if (/\b(el|la|los|las|que|para|pero|porque)\b.*\b(el|la|que|para)\b/i.test(sample) && /[áéíóúñ¿¡]/i.test(sample)) {
    out.push({ kind: "format", detail: "writes in Spanish" });
  }
  return out;
}

/** Words this larva uses far more than the rest of the swarm does. */
function detectFixations(corpus: string, swarmCommon: Set<string>): Evidence[] {
  const counts = new Map<string, number>();
  for (const w of corpus.toLowerCase().match(/[a-z][a-z-]{4,15}/g) || []) {
    if (swarmCommon.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w, n]) => ({
      kind: "fixation" as const,
      detail: `says "${w}" unusually often (${n} times)`,
    }));
}

/** Repeated distinctive multi-word phrases — verbal signatures. */
function detectRepeatedPhrases(corpus: string): Evidence[] {
  const chunks = corpus.split(/---/).map((c) => c.trim()).filter(Boolean);
  if (chunks.length < 3) return [];

  const phraseCounts = new Map<string, number>();
  for (const chunk of chunks) {
    const seen = new Set<string>();
    const words = chunk.toLowerCase().match(/[a-z']+/g) || [];
    for (let i = 0; i + 2 < words.length; i++) {
      const tri = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      if (tri.length < 12) continue;
      if (seen.has(tri)) continue;
      seen.add(tri);
      phraseCounts.set(tri, (phraseCounts.get(tri) || 0) + 1);
    }
  }

  const threshold = Math.max(3, Math.floor(chunks.length * 0.35));
  return [...phraseCounts.entries()]
    .filter(([, n]) => n >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([p, n]) => ({
      kind: "phrase" as const,
      detail: `repeats the phrase "${p}" across ${n} responses`,
    }));
}

/** Words so common across the swarm they say nothing about an individual. */
export const SWARM_COMMON = new Set([
  "clawd", "token", "tokens", "governance", "proposal", "proposals", "community",
  "holder", "holders", "larva", "larvae", "should", "would", "could", "value",
  "build", "building", "builds", "built", "ecosystem", "project", "protocol",
  "treasury", "vote", "voting", "votes", "burn", "burns", "staking", "stake",
  "infrastructure", "execution", "revenue", "utility", "there", "their", "about",
  "which", "these", "those", "because", "before", "after", "where", "while",
  "still", "being", "having", "doing", "making", "actual", "actually", "really",
  "think", "thinks", "thinking", "needs", "need", "wants", "want", "first",
  "agent", "agents", "onchain", "chain", "market", "markets", "price", "people",
]);

/**
 * Assemble the evidence dossier for one larva.
 * Ordered by how nameable each signal tends to be: a term of address or a
 * formatting tic is far more distinctive than a favourite noun.
 */
export function extractEvidence(corpus: string): Evidence[] {
  const out: Evidence[] = [];

  for (const { re, label } of ADDRESS_PATTERNS) {
    const hits = corpus.match(re);
    if (hits && hits.length >= 2) {
      const term = hits[0].toLowerCase();
      out.push({ kind: "address", detail: `${label} "${term}" (${hits.length} times)` });
    }
  }

  out.push(...detectLanguage(corpus));
  out.push(...detectFormatQuirks(corpus));
  out.push(...detectRepeatedPhrases(corpus));
  out.push(...detectFixations(corpus, SWARM_COMMON));

  return out.slice(0, 8);
}

/* ─── Validation ───────────────────────────────────────────────────── */

// Deliberately short. The old list banned "architect", "pragmatist", "purist",
// "builder", "auditor" — the exact words the prompt asked for — which is why
// good names kept getting thrown away. Role words are back. What stays banned
// is only what genuinely never reads as a name.

/** Never valid as the FIRST word — these make a label, not a name. */
const BAD_FIRST_WORDS = new Set([
  "whether", "who", "what", "which", "when", "where", "why", "how", "that",
  "this", "these", "those", "consistently", "explicitly", "retroactively",
  "suspiciously", "always", "never", "often", "very", "really", "quite",
  "applies", "filters", "watches", "tracks", "dismisses", "demands",
  "sequences", "shows", "wants", "uses", "asks", "the", "a", "an", "is",
  "are", "was", "and", "but", "or", "of", "to", "in", "for", "with",
]);

/** Empty intensity words that describe nothing specific. */
const EMPTY_ADJECTIVES = new Set([
  "obsessive", "obsessed", "focused", "dedicated", "relentless", "passionate",
  "committed", "intense", "serious", "thoughtful", "careful", "generic",
]);

/** Placeholder names that mean the model gave up. */
const PLACEHOLDER = new Set([
  "larva", "unnamed", "unnamed larva", "specimen", "unknown", "anonymous",
  "agent", "the larva", "no name", "n/a", "null", "undefined",
]);

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function tokens(name: string): string[] {
  return normalizeName(name)
    .split(/[^a-z0-9']+/)
    .filter(Boolean);
}

/**
 * Signature for near-duplicate detection: sorted significant words.
 * "Burn Warden" and "Warden Burn" collapse to the same signature, so we don't
 * ship both. Leading "the" is ignored so "The Archivist" and "Archivist" clash.
 */
export function nameSignature(name: string): string {
  const t = tokens(name).filter((w) => w !== "the");
  return [...t].sort().join("|");
}

/** Structural validity — is this shaped like a name at all? */
export function isWellFormed(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 32) return false;
  if (PLACEHOLDER.has(normalizeName(trimmed))) return false;

  const t = tokens(trimmed);
  if (t.length === 0 || t.length > 3) return false;

  // A bare "The" prefix doesn't count toward the word budget.
  const significant = t.filter((w) => w !== "the");
  if (significant.length === 0) return false;
  if (BAD_FIRST_WORDS.has(significant[0])) return false;
  if (significant.every((w) => EMPTY_ADJECTIVES.has(w))) return false;
  if (/^\d+$/.test(significant.join(""))) return false;

  // Trailing disambiguation digits ("The Architect 2") are exactly the failure
  // mode we're removing — reject rather than accept them.
  if (/\s\d+$/.test(trimmed)) return false;

  return true;
}

export function isTaken(name: string, used: Set<string>, usedSigs: Set<string>): boolean {
  if (used.has(normalizeName(name))) return true;
  const sig = nameSignature(name);
  return sig.length > 0 && usedSigs.has(sig);
}

export function isAcceptable(
  name: string,
  used: Set<string>,
  usedSigs: Set<string>
): boolean {
  return (
    isWellFormed(name) &&
    !looksLikeFragment(name) &&
    !isTaken(name, used, usedSigs)
  );
}

export function remember(name: string, used: Set<string>, usedSigs: Set<string>) {
  used.add(normalizeName(name));
  const sig = nameSignature(name);
  if (sig) usedSigs.add(sig);
}

/* ─── Rate limiting ────────────────────────────────────────────────── */

// Gemini's free tier allows 10 requests/minute. Without pacing, a rename run
// 429s on nearly every call and every larva silently falls through to the
// derivation fallback — which is exactly what happened on the first run.
const MIN_CALL_GAP_MS = 6_500;
let lastCallAt = 0;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Serialized, paced call. Retries once on 429 using the server's own delay. */
async function pacedHaiku(system: string, user: string, maxTokens: number): Promise<string> {
  const wait = lastCallAt + MIN_CALL_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();

  try {
    return await haiku(system, user, maxTokens);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("429")) throw e;

    // Honour the retryDelay the API reports, capped so one call can't eat the
    // whole request budget.
    const m = msg.match(/"retryDelay":\s*"(\d+)s"/);
    const delay = Math.min(m ? Number(m[1]) * 1000 + 500 : 20_000, 25_000);
    await sleep(delay);
    lastCallAt = Date.now();
    return await haiku(system, user, maxTokens);
  }
}

/* ─── The naming prompt ────────────────────────────────────────────── */

const NAMING_SYSTEM = `You name a "larva" — a personal AI governance agent in the $CLAWD ecosystem. Each larva was trained by a different token holder, so each has its own voice and fixations.

You'll get evidence pulled from what this larva ACTUALLY wrote, plus a short personality read. Name it from the evidence.

THE BAR — read this carefully, it's the whole job:

Most larvae are serious participants and deserve a clean, dignified name. A few have something genuinely strange going on. Name accordingly. Do NOT manufacture a quirk that isn't there.

Earn the quirk. If the evidence shows something actually odd — it calls its holder "daddy", it answers in Morse code, it writes in raw HTML, it repeats one phrase in every response — lean into it. That's the funniest and truest kind of name and it should land hard. If the evidence shows a thoughtful larva that cares about audits and shipping, name it something clean and solid. A manufactured quirk is worse than a plain name.

Adjectives only when they carry information. "Manic" is right for a larva that never stops shipping. "Thoughtful" is empty — every larva is thoughtful. If the adjective could apply to any larva, drop it.

THE TEST: could this exact name have been given to a different larva without changing a word? If yes, it's too generic. Go back to the evidence.

RULES:
- 1-2 words, occasionally 3 with "The" ("The Morse Prophet"). Never more.
- Role and title words are GOOD when earned: Archivist, Warden, Broker, Envoy, Curator, Sentinel, Skeptic, Prophet, Scribe, Steward. "The Architect" is a fine name for a larva that actually designs systems.
- Never start with a connector, question word, adverb, or bare verb.
- Never a name from the taken list, and never a near-copy — no reordering two taken words, no appending a number.
- No trailing digits, ever.
- Funny is welcome when earned; crude is not. Nothing sexual. Never mock the human holder — the joke is always about the agent.
- Use the evidence as INFORMATION, not as raw material to copy. Do not lift usernames, handles, ticker symbols, code identifiers, or truncated tokens out of the evidence and use them as the name. If the evidence says the larva obsesses over audit receipts, "Receipt Keeper" is right and "AUDIT-RCPT" is wrong.
- Write the name in Title Case. Never all-caps.

Respond with ONLY the name. No quotes, no punctuation, no explanation.`;

function formatEvidence(ev: Evidence[]): string {
  if (ev.length === 0) return "(nothing unusual surfaced — this larva reads as a straightforward participant, so give it a clean, dignified name)";
  return ev.map((e) => `- ${e.detail}`).join("\n");
}

/* ─── Naming ───────────────────────────────────────────────────────── */

export type NamingInput = {
  wallet: string;
  corpus: string;
  tone: string;
  tagline?: string;
  quirks?: string[];
  values?: string[];
  /** Name the profile pass already suggested; tried first if acceptable. */
  hint?: string;
};

/**
 * Name one larva. The LLM decides; this function only validates and retries.
 *
 * Order of attempts:
 *   1. The profile pass's own suggestion, if it's acceptable.
 *   2. Up to 3 fresh LLM attempts, each told what was rejected and why.
 *   3. Derivation from the larva's own distinctive words — still its material,
 *      never a generic mood-word pool.
 */
export async function nameLarva(
  input: NamingInput,
  used: Set<string>,
  usedSigs: Set<string>
): Promise<{
  name: string;
  source: "hint" | "llm" | "derived";
  attempts: number;
  error?: string;
}> {
  // 1. Trust the profile pass when it already produced something good.
  if (input.hint && isAcceptable(input.hint, used, usedSigs)) {
    return { name: input.hint.trim(), source: "hint", attempts: 0 };
  }

  const evidence = extractEvidence(input.corpus);
  const evidenceText = formatEvidence(evidence);
  const takenSample = [...used].slice(-120).join(", ") || "(none yet)";

  const rejected: string[] = [];
  if (input.hint) rejected.push(input.hint.trim());
  let lastError = "";

  // Two attempts, not three: at ~7s per paced call a third rarely fits in
  // the request budget, and the retry prompt does most of its work on attempt 2.
  for (let attempt = 0; attempt < 2; attempt++) {
    const rejectionNote =
      rejected.length > 0
        ? `\n\nAlready rejected (taken or malformed) — do NOT offer these or variations of them: ${rejected.join(", ")}`
        : "";

    const user = `Evidence from this larva's own writing:
${evidenceText}

Personality read:
- tone: ${input.tone}
${input.tagline ? `- tagline: ${input.tagline}\n` : ""}${input.quirks?.length ? `- quirks: ${input.quirks.join("; ")}\n` : ""}${input.values?.length ? `- values: ${input.values.join("; ")}\n` : ""}
Names already taken by other larvae (avoid these and near-copies):
${takenSample}${rejectionNote}`;

    try {
      // Gemini counts overhead against maxOutputTokens and returns empty text
      // if the ceiling is too tight, so this needs real headroom even though
      // the answer itself is only a word or two.
      const raw = await pacedHaiku(NAMING_SYSTEM, user, 200);
      const candidate = cleanNameOutput(raw);

      if (isAcceptable(candidate, used, usedSigs)) {
        return { name: candidate, source: "llm", attempts: attempt + 1 };
      }
      if (candidate) rejected.push(candidate);
      else lastError = "model returned no usable name";
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  // 3. Derive from this larva's own words. Not a generic pool — if we get here
  //    the name is still grounded in something it actually said.
  return {
    name: deriveFromEvidence(evidence, input, used, usedSigs),
    source: "derived",
    attempts: 2,
    error: lastError,
  };
}

/**
 * Extract a name from model output. The instruction asks for the bare name,
 * but with a real token budget the model sometimes adds a preamble or wraps
 * the answer in quotes, so take the first plausible short line rather than
 * trusting the whole response.
 */
function cleanNameOutput(raw: string): string {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const stripped = line.replace(/^(name|answer|nickname)\s*[:\-]\s*/i, "");
    const cleaned = normalizeCase(
      stripped
        .replace(/^["'`*\s]+|["'`*.,!\s]+$/g, "")
        .replace(/\s+/g, " ")
        .slice(0, 32)
    );
    if (!cleaned) continue;
    if (cleaned.split(/\s+/).length <= 3) return cleaned;
  }
  return "";
}

/**
 * The model sometimes echoes shouty corpus text straight into the name
 * ("RIGHTCLAW HERALD", "CAPITAL THESIS"). Names render as Title Case, so
 * normalize rather than rejecting an otherwise good candidate.
 */
function normalizeCase(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      // Keep a lowercase "the" when it isn't leading.
      if (i > 0 && w.toLowerCase() === "the") return "the";
      // Preserve deliberate internal capitals (McCoy, VaultID) but fix ALLCAPS.
      const isAllCaps = w === w.toUpperCase() && /[A-Z]{2,}/.test(w);
      const base = isAllCaps ? w.toLowerCase() : w;
      return base
        .split("-")
        .map((p) =>
          p ? p[0].toUpperCase() + p.slice(1) : p
        )
        .join("-");
    })
    .join(" ");
}

/**
 * Reject candidates that are clearly raw corpus fragments rather than names:
 * chopped tokens ("VE-MODEL"), mangled handles ("Kittanj"), and strings with
 * digits or stray punctuation the model lifted verbatim.
 */
function looksLikeFragment(name: string): boolean {
  const words = name.split(/\s+/).filter(Boolean);
  for (const w of words) {
    const bare = w.replace(/[^a-zA-Z'-]/g, "");
    if (/\d/.test(w)) return true;              // contains digits
    if (/^[a-z]{1,3}-/i.test(bare)) return true; // VE-MODEL, ZK-THING
    if (bare.length > 3 && !/[aeiouy]/i.test(bare)) return true; // no vowels

    // Mangled handles ("Kittanj") end in an implausible consonant cluster.
    // Checking the ENDING rather than any internal run keeps real compounds
    // like "Rightclaw" — English tolerates "ghtcl" mid-word but not "nj" final.
    if (/[bcdfgjklmnpqstvwxz]{2,}$/i.test(bare) && bare.length > 4) {
      // Allow common legitimate endings.
      if (!/(ck|ng|nk|rd|rt|rk|rn|rm|rl|st|sk|sp|ft|pt|ct|lt|ld|lf|lk|mp|nt|nd|sh|ch|th|ss|ll|ff|zz)$/i.test(bare)) {
        return true;
      }
    }
  }
  return false;
}

/** Title-case a single word, preserving internal hyphens. */
function titleWord(w: string): string {
  return w
    .split("-")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part))
    .join("-");
}

/**
 * Last resort. Pulls the larva's own distinctive vocabulary and pairs it with
 * a role word. Still specific to this specimen — the point is that even the
 * fallback carries information, unlike the mood-word generator it replaces.
 */
function deriveFromEvidence(
  evidence: Evidence[],
  input: NamingInput,
  used: Set<string>,
  usedSigs: Set<string>
): string {
  const ROLES = [
    "Warden", "Scribe", "Envoy", "Curator", "Sentinel", "Broker", "Steward",
    "Prophet", "Herald", "Keeper", "Marshal", "Chronicler", "Arbiter", "Courier",
  ];

  // Candidate words from evidence, best signal first. The filter here has to
  // be strict: an earlier version accepted any long-enough word and produced
  // "The Exactly", "They'd Scribe", "Came Courier" — adverbs, contractions and
  // past-tense verbs read as broken, not quirky.
  const words: string[] = [];
  const pushIfUsable = (raw: string) => {
    const w = raw.trim();
    if (isUsableNameWord(w)) words.push(titleWord(w));
  };

  for (const e of evidence) {
    const quoted = e.detail.match(/"([^"]+)"/);
    if (quoted) for (const w of quoted[1].split(/\s+/)) pushIfUsable(w);
  }
  for (const q of input.quirks || []) {
    for (const w of q.split(/[^a-zA-Z-]+/)) pushIfUsable(w);
  }

  const seed =
    [...input.wallet].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) || 1;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    for (let j = 0; j < ROLES.length; j++) {
      const role = ROLES[(seed + j) % ROLES.length];
      for (const candidate of [`${w} ${role}`, `The ${w}`, w]) {
        if (isAcceptable(candidate, used, usedSigs)) return candidate;
      }
    }
  }

  // Nothing usable in the corpus at all — wallet-derived, clearly a fallback
  // rather than pretending to be meaningful.
  const hex = input.wallet.slice(2, 6).toUpperCase();
  for (const role of ROLES) {
    const candidate = `${role} ${hex}`;
    if (isAcceptable(candidate, used, usedSigs)) return candidate;
  }
  return `Specimen ${hex}`;
}

/**
 * Whether a corpus word can stand as part of a name.
 *
 * Names need concrete nouns and adjectives. Function words, contractions,
 * adverbs and inflected verbs all read as fragments — "The Exactly" and
 * "They'd Scribe" are what happens without this check.
 */
function isUsableNameWord(raw: string): boolean {
  const w = raw.toLowerCase().replace(/[^a-z'-]/g, "");
  if (w.length < 4 || w.length > 14) return false;
  if (w.includes("'")) return false;            // they'd, don't, holder's
  if (SWARM_COMMON.has(w)) return false;
  if (NON_NAME_WORDS.has(w)) return false;
  if (w.endsWith("ly")) return false;           // exactly, really, quickly
  if (w.endsWith("ed")) return false;           // came->fine, but shipped/asked read as verbs
  if (w.endsWith("ing") && w.length <= 7) return false; // going, doing, being
  if (w.endsWith("n't")) return false;
  return true;
}

/**
 * Function words, common verbs and connectives that survive the length filter
 * but never work in a name.
 */
const NON_NAME_WORDS = new Set([
  // pronouns / determiners
  "they", "them", "their", "theirs", "these", "those", "this", "that", "with",
  "from", "into", "onto", "upon", "over", "under", "about", "above", "below",
  "your", "yours", "mine", "ours", "hers", "him", "her", "its", "itself",
  "some", "such", "each", "every", "both", "either", "neither", "other",
  // common verbs and auxiliaries
  "came", "come", "comes", "went", "goes", "gone", "said", "says", "tell",
  "told", "made", "make", "makes", "take", "takes", "took", "give", "gives",
  "gave", "have", "has", "had", "does", "did", "done", "will", "would",
  "shall", "should", "could", "might", "must", "can", "may", "want", "wants",
  "need", "needs", "know", "knows", "knew", "think", "thinks", "seem", "seems",
  "look", "looks", "feel", "feels", "keep", "keeps", "kept", "left", "leave",
  "put", "puts", "get", "gets", "got", "let", "lets",
  // adverbs / intensifiers
  "very", "really", "quite", "just", "even", "also", "only", "still", "yet",
  "already", "always", "never", "often", "again", "here", "there", "when",
  "then", "than", "well", "much", "more", "most", "less", "least", "many",
  "exactly", "actually", "simply", "clearly", "probably", "maybe", "perhaps",
  // discourse
  "because", "though", "although", "however", "while", "since", "unless",
  "whether", "instead", "rather", "therefore", "thus", "hence", "anyway",
  "okay", "yeah", "yes", "no", "not", "sure", "like", "something", "anything",
  "everything", "nothing", "someone", "anyone", "everyone", "nobody",
]);
