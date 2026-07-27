// Over/Under — out-of-100 hive polls + crypto market-cap ladder vs a larva.

import { randomBytes } from "crypto";
import { redis, haiku, getIndex, getProfile, parseJsonLoose } from "@/lib/larvae";
import { inventOverUnderClaim } from "@/lib/over-under-polls";
import {
  coinFaceUp,
  coinPublic,
  dealHand,
  type CryptoCoin,
} from "@/lib/crypto-deck";

export const SURVEYS_PER_MATCH = 3;
export const ROWS_TO_FORCE_FINAL = 2;
export const CRYPTO_RUN_LEN = 5;
export const FINAL_RUN_LEN = 7;
export const MATCH_TTL = 60 * 60 * 2;

export type Seat = "human" | "larva";
export type Phase =
  | "survey_guess"
  | "survey_call"
  | "ready_reveal"
  | "crypto"
  | "final"
  | "done";

export type MatchState = {
  id: string;
  opponentWallet: string;
  opponentName: string;
  opponentTone: string;
  phase: Phase;
  /** Surveys fully finished (crypto after them resolved). */
  surveyIndex: number;
  rowsCleared: { human: number; larva: number };
  control: Seat | null;
  usedCoinIds: string[];
  usedPromptIds: string[];
  guesser: Seat;
  survey: {
    question: string;
    label: string;
    trueN: number;
    guess: number | null;
    call: "over" | "under" | null;
    larvaJab: string;
    revealed: boolean;
  } | null;
  crypto: {
    hand: CryptoCoin[];
    step: number;
    isFinal: boolean;
  } | null;
  lastJab: string;
  winner: Seat | null;
  createdAt: string;
};

const MATCH_KEY = (id: string) => `lpp:cardsharks:match:${id}`;

function newId(): string {
  return randomBytes(8).toString("hex");
}

export async function saveMatch(m: MatchState) {
  await redis.set(MATCH_KEY(m.id), JSON.stringify(m), { ex: MATCH_TTL });
}

export async function getMatch(id: string): Promise<MatchState | null> {
  const raw = await redis.get<string | MatchState>(MATCH_KEY(id));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export function publicMatch(m: MatchState) {
  const survey =
    m.survey == null
      ? null
      : {
          question: m.survey.question,
          label: m.survey.label,
          guess: m.survey.guess,
          call: m.survey.call,
          larvaJab: m.survey.larvaJab,
          trueN: m.survey.revealed ? m.survey.trueN : null,
          revealed: m.survey.revealed,
        };

  let crypto = null as null | {
    isFinal: boolean;
    step: number;
    targetSteps: number;
    faceUp: ReturnType<typeof coinFaceUp> | null;
    next: ReturnType<typeof coinPublic> | null;
    controller: Seat | null;
  };

  if (m.crypto) {
    const { hand, step, isFinal } = m.crypto;
    const face = hand[step] || null;
    const next = hand[step + 1] || null;
    crypto = {
      isFinal,
      step,
      targetSteps: hand.length - 1,
      faceUp: face ? coinFaceUp(face) : null,
      next: next ? coinPublic(next) : null,
      controller: m.control,
    };
  }

  return {
    id: m.id,
    opponent: {
      wallet: m.opponentWallet,
      name: m.opponentName,
      tone: m.opponentTone,
    },
    phase: m.phase,
    surveyIndex: m.surveyIndex,
    surveysTarget: SURVEYS_PER_MATCH,
    rowsCleared: m.rowsCleared,
    control: m.control,
    guesser: m.guesser,
    survey,
    crypto,
    lastJab: m.lastJab,
    winner: m.winner,
  };
}

async function larvaGuess(
  wallet: string,
  question: string,
  label: string
): Promise<{ guess: number; jab: string }> {
  const p = await getProfile(wallet);
  try {
    const raw = await haiku(
      `You are "${p?.profile.name || "a larva"}"${p ? `, tone ${p.profile.tone}` : ""}.
Guess how many larvae OUT OF 100 would say YES to the dilemma (claim: ${label}).
ONLY JSON: {"guess":0-100,"jab":"max 12 words"}`,
      `Dilemma: ${question}`,
      120,
      0.9
    );
    const parsed = parseJsonLoose(raw) as { guess?: number; jab?: string };
    return {
      guess: Math.max(0, Math.min(100, Math.round(Number(parsed.guess) || 50))),
      jab: String(parsed.jab || "I know this hive.").slice(0, 80),
    };
  } catch {
    return { guess: 35 + Math.floor(Math.random() * 40), jab: "I know the hive." };
  }
}

async function larvaCall(
  wallet: string,
  question: string,
  label: string,
  guess: number
): Promise<{ call: "over" | "under"; jab: string }> {
  const p = await getProfile(wallet);
  try {
    const raw = await haiku(
      `You are "${p?.profile.name || "a larva"}"${p ? `, tone ${p.profile.tone}` : ""}.
Opponent guessed ${guess}/100 would say YES to "${label}". Say OVER or UNDER (not equal).
ONLY JSON: {"call":"over"|"under","jab":"max 12 words"}`,
      `Dilemma: ${question}\nGuess: ${guess}`,
      100,
      0.9
    );
    const parsed = parseJsonLoose(raw) as { call?: string; jab?: string };
    return {
      call: parsed.call === "under" ? "under" : "over",
      jab: String(parsed.jab || "I'll take that side.").slice(0, 80),
    };
  } catch {
    return {
      call: guess >= 50 ? "under" : "over",
      jab: "I'll take the other side.",
    };
  }
}

async function larvaCryptoPick(
  wallet: string,
  faceName: string,
  faceSymbol: string,
  nextName: string,
  nextSymbol: string
): Promise<{ pick: "higher" | "lower"; jab: string }> {
  const p = await getProfile(wallet);
  try {
    const raw = await haiku(
      `You are "${p?.profile.name || "a larva"}"${p ? `, tone ${p.profile.tone}` : ""}.
Is the NEXT coin higher or lower market cap than face-up? Names only — no caps given.
ONLY JSON: {"pick":"higher"|"lower","jab":"max 10 words"}`,
      `Face-up: ${faceName} (${faceSymbol})\nNext: ${nextName} (${nextSymbol})`,
      80,
      0.85
    );
    const parsed = parseJsonLoose(raw) as { pick?: string; jab?: string };
    return {
      pick: parsed.pick === "lower" ? "lower" : "higher",
      jab: String(parsed.jab || "Higher.").slice(0, 60),
    };
  } catch {
    return { pick: Math.random() < 0.5 ? "higher" : "lower", jab: "Feeling lucky." };
  }
}

function judgeSurvey(
  trueN: number,
  guess: number,
  call: "over" | "under",
  guesser: Seat
): Seat {
  if (guess === trueN) return guesser;
  const actuallyOver = trueN > guess;
  const callCorrect =
    (call === "over" && actuallyOver) || (call === "under" && !actuallyOver);
  const caller: Seat = guesser === "human" ? "larva" : "human";
  return callCorrect ? caller : guesser;
}

function shouldGoFinal(m: MatchState): boolean {
  return (
    m.surveyIndex >= SURVEYS_PER_MATCH ||
    m.rowsCleared.human >= ROWS_TO_FORCE_FINAL ||
    m.rowsCleared.larva >= ROWS_TO_FORCE_FINAL
  );
}

async function startCryptoRun(m: MatchState, isFinal: boolean): Promise<void> {
  const len = isFinal ? FINAL_RUN_LEN : CRYPTO_RUN_LEN;
  const hand = await dealHand(len, m.usedCoinIds);
  m.usedCoinIds.push(...hand.map((c) => c.id));
  m.crypto = { hand, step: 0, isFinal };
  m.phase = isFinal ? "final" : "crypto";
}

async function beginSurvey(m: MatchState): Promise<void> {
  if (!m.usedPromptIds) m.usedPromptIds = [];
  const claim = await inventOverUnderClaim(m.usedPromptIds);
  if (!claim) throw new Error("could not build an Over/Under poll — need specimen profiles");
  m.usedPromptIds.push(claim.id);
  m.guesser = m.surveyIndex % 2 === 0 ? "human" : "larva";
  m.survey = {
    question: claim.question,
    label: claim.label,
    trueN: claim.trueN,
    guess: null,
    call: null,
    larvaJab: "",
    revealed: false,
  };
  m.crypto = null;
  m.control = null;

  if (m.guesser === "larva") {
    const { guess, jab } = await larvaGuess(
      m.opponentWallet,
      claim.question,
      claim.label
    );
    m.survey.guess = guess;
    m.survey.larvaJab = jab;
    m.lastJab = jab;
    m.phase = "survey_call";
  } else {
    m.phase = "survey_guess";
  }
}

async function afterCryptoEnds(m: MatchState, cleared: boolean): Promise<void> {
  if (cleared && m.control) {
    m.rowsCleared[m.control] += 1;
  }
  m.surveyIndex += 1;
  m.crypto = null;

  if (shouldGoFinal(m)) {
    // Last survey's control holder plays the final (still on m.control).
    // If they busted the warm-up ladder, they still earned final from survey —
    // unless we want opponent: plan says survey control plays final.
    if (!m.control) {
      m.control =
        m.rowsCleared.human >= m.rowsCleared.larva ? "human" : "larva";
    }
    await startCryptoRun(m, true);
  } else {
    await beginSurvey(m);
  }
}

export async function startMatch(opponentWallet?: string): Promise<MatchState> {
  let wallet = (opponentWallet || "").trim().toLowerCase();
  if (!wallet) {
    const index = await getIndex();
    if (index.length === 0) throw new Error("no specimens — build profiles first");
    wallet = index[Math.floor(Math.random() * Math.min(index.length, 80))].wallet;
  }
  const profile = await getProfile(wallet);
  if (!profile) throw new Error("larva profile not found");

  const m: MatchState = {
    id: newId(),
    opponentWallet: profile.wallet,
    opponentName: profile.profile.name,
    opponentTone: profile.profile.tone,
    phase: "survey_guess",
    surveyIndex: 0,
    rowsCleared: { human: 0, larva: 0 },
    control: null,
    usedCoinIds: [],
    usedPromptIds: [],
    guesser: "human",
    survey: null,
    crypto: null,
    lastJab: `${profile.profile.name} takes the other seat.`,
    winner: null,
    createdAt: new Date().toISOString(),
  };

  await beginSurvey(m);
  await saveMatch(m);
  return m;
}

export async function submitGuess(matchId: string, guess: number): Promise<MatchState> {
  const m = await getMatch(matchId);
  if (!m?.survey) throw new Error("match not found");
  if (m.phase !== "survey_guess" || m.guesser !== "human") {
    throw new Error("not your turn to guess");
  }
  m.survey.guess = Math.max(0, Math.min(100, Math.round(guess)));
  const { call, jab } = await larvaCall(
    m.opponentWallet,
    m.survey.question,
    m.survey.label,
    m.survey.guess
  );
  m.survey.call = call;
  m.survey.larvaJab = jab;
  m.lastJab = jab;
  m.phase = "ready_reveal";
  await saveMatch(m);
  return m;
}

export async function submitCall(
  matchId: string,
  call: "over" | "under"
): Promise<MatchState> {
  const m = await getMatch(matchId);
  if (!m?.survey) throw new Error("match not found");
  if (m.phase !== "survey_call" || m.guesser !== "larva") {
    throw new Error("not your turn to call over/under");
  }
  if (m.survey.guess == null) throw new Error("no guess yet");
  m.survey.call = call === "under" ? "under" : "over";
  m.phase = "ready_reveal";
  await saveMatch(m);
  return m;
}

export async function revealSurvey(matchId: string): Promise<{
  match: MatchState;
  trueN: number;
  control: Seat;
  exact: boolean;
}> {
  const m = await getMatch(matchId);
  if (!m?.survey) throw new Error("match not found");
  if (m.phase !== "ready_reveal") throw new Error("not ready to reveal");
  if (m.survey.guess == null || m.survey.call == null) {
    throw new Error("guess and call required");
  }

  const trueN = m.survey.trueN;
  const exact = m.survey.guess === trueN;
  const control = judgeSurvey(trueN, m.survey.guess, m.survey.call, m.guesser);
  m.control = control;
  m.survey.revealed = true;
  m.lastJab =
    control === "larva"
      ? m.survey.larvaJab || `${m.opponentName} takes control.`
      : "You take control of the board.";

  await startCryptoRun(m, false);
  await saveMatch(m);
  return { match: m, trueN, control, exact };
}

export async function cryptoStep(
  matchId: string,
  pick?: "higher" | "lower"
): Promise<{
  match: MatchState;
  correct: boolean;
  pickUsed: "higher" | "lower";
  faceUp: ReturnType<typeof coinFaceUp>;
  revealed: ReturnType<typeof coinFaceUp>;
  jab: string;
  clearedRow: boolean;
  busted: boolean;
}> {
  const m = await getMatch(matchId);
  if (!m?.crypto || !m.control) throw new Error("no crypto run");
  if (m.phase !== "crypto" && m.phase !== "final") {
    throw new Error("not in a crypto run");
  }

  const { hand, step, isFinal } = m.crypto;
  const face = hand[step];
  const next = hand[step + 1];
  if (!face || !next) throw new Error("run already complete");

  let pickUsed: "higher" | "lower";
  let jab = "";
  if (m.control === "larva") {
    const larva = await larvaCryptoPick(
      m.opponentWallet,
      face.name,
      face.symbol,
      next.name,
      next.symbol
    );
    pickUsed = larva.pick;
    jab = larva.jab;
    m.lastJab = jab;
  } else {
    if (pick !== "higher" && pick !== "lower") {
      throw new Error("pick higher or lower");
    }
    pickUsed = pick;
  }

  const reallyHigher = next.marketCap > face.marketCap;
  const correct =
    next.marketCap !== face.marketCap &&
    ((pickUsed === "higher" && reallyHigher) ||
      (pickUsed === "lower" && !reallyHigher));

  let clearedRow = false;
  let busted = false;

  if (correct) {
    m.crypto.step = step + 1;
    if (m.crypto.step >= hand.length - 1) {
      clearedRow = true;
      if (isFinal) {
        m.winner = m.control;
        m.phase = "done";
        m.crypto = null;
        m.lastJab =
          m.winner === "human"
            ? "Final cleared — you win the match."
            : `${m.opponentName} clears the final.`;
      } else {
        await afterCryptoEnds(m, true);
      }
    }
  } else {
    busted = true;
    if (isFinal) {
      m.winner = m.control === "human" ? "larva" : "human";
      m.phase = "done";
      m.crypto = null;
      m.lastJab =
        m.winner === "human"
          ? `${m.opponentName} busts the final. You win.`
          : "You bust the final.";
    } else {
      await afterCryptoEnds(m, false);
    }
  }

  await saveMatch(m);
  return {
    match: m,
    correct,
    pickUsed,
    faceUp: coinFaceUp(face),
    revealed: coinFaceUp(next),
    jab,
    clearedRow,
    busted,
  };
}
