// lib/moral.ts
// EasyDamus Alignment Test for larvae (separate from governance "alignment").
// Source: https://easydamus.com/alignmenttest.html — scoring ported from their process().

import { redis, haiku, getProfile, getIndex, type LarvaProfile } from "@/lib/larvae";

export type MoralLabel =
  | "Lawful Good"
  | "Neutral Good"
  | "Chaotic Good"
  | "Lawful Neutral"
  | "True Neutral"
  | "Chaotic Neutral"
  | "Lawful Evil"
  | "Neutral Evil"
  | "Chaotic Evil";

export type MoralQuestion = {
  id: string;
  prompt: string;
  choices: [string, string, string, string];
};

export type MoralAnswer = {
  id: string;
  prompt: string;
  answer: string;
  choice: number; // 1–4
};

export type MoralResult = {
  wallet: string;
  name: string;
  tone: string;
  label: MoralLabel;
  lawChaos: number; // -2 lawful … +2 chaotic
  goodEvil: number; // -2 good … +2 evil
  /** EasyDamus axis totals (for debugging / richer UI). */
  scores?: {
    lx: number;
    nx: number;
    cx: number;
    xg: number;
    xn: number;
    xe: number;
  };
  answers: MoralAnswer[];
  testedAt: string;
  source?: "easydamus";
};

const CODE_TO_LABEL: Record<string, MoralLabel> = {
  lg: "Lawful Good",
  ng: "Neutral Good",
  cg: "Chaotic Good",
  ln: "Lawful Neutral",
  nn: "True Neutral",
  cn: "Chaotic Neutral",
  le: "Lawful Evil",
  ne: "Neutral Evil",
  ce: "Chaotic Evil",
};

/** Classic EasyDamus 36-question bank (choice order = score value 1–4). */
export const MORAL_QUESTIONS: MoralQuestion[] = [
  {
    id: "q1",
    prompt:
      "Family elders are expressing disapproval of you to the rest of the family. Do you:",
    choices: [
      "Accept the criticism and change your ways?",
      "Seek a compromise with them?",
      "Besmirch the reputation of those expressing disapproval as you ignore their scorn?",
      "Silence them any way you can?",
    ],
  },
  {
    id: "q2",
    prompt: "Would you give up a promising career to aid the family in time of need?",
    choices: [
      "In a heartbeat.",
      "Yes, with some reluctance.",
      "Only if I was certain I'd be able to return to my career soon.",
      "No.",
    ],
  },
  {
    id: "q3",
    prompt: "Would you betray a family member to advance your own career?",
    choices: [
      "Yes, without a twinge of guilt.",
      "Yes, if I could do it secretly.",
      "I'd resist the temptation.",
      "I find the very idea abhorrent.",
    ],
  },
  {
    id: "q4",
    prompt: "Do you respect the leaders of your family?",
    choices: [
      "Their words guide my actions.",
      "They're role models for me.",
      "They're often out of touch with my life.",
      "They're out of touch with reality.",
    ],
  },
  {
    id: "q5",
    prompt:
      "If your family had arranged your marriage to someone loathsome, would you:",
    choices: [
      "Go through with it, proud to serve your family?",
      "Agree, hiding your reluctance?",
      "Subtly work against the union?",
      "Flee?",
    ],
  },
  {
    id: "q6",
    prompt:
      "You're estranged from a family member. On his deathbed, he seeks reconciliation. Do you:",
    choices: [
      "Speak to him, but hold your ground?",
      "Refuse to speak to him?",
      "Discuss your estrangement openly and without rancor?",
      "Actively seek reconciliation, and heed his dying words?",
    ],
  },
  {
    id: "q7",
    prompt:
      "A powerful but corrupt judge offers you wealth if you'll testify against your friend. Do you:",
    choices: [
      "Condemn your friend and take the money?",
      "Take the money and testify, but try to keep your testimony ineffective?",
      "Refuse the offer and refuse to testify?",
      "Testify on your friend's behalf, no matter the consequences?",
    ],
  },
  {
    id: "q8",
    prompt: "Do you become close to friends, or hold most people at a safe distance?",
    choices: [
      "I have an abundance of close friends.",
      "I have some close friends.",
      "I have few close friends.",
      "I try to keep people at a distance.",
    ],
  },
  {
    id: "q9",
    prompt: "Have you ever betrayed a friend?",
    choices: [
      "I've done so more than once, and I sometimes get away with it.",
      "I've done so once.",
      "I've been tempted to do so, but I've never gone through with it.",
      "I'd never contemplate such a thing.",
    ],
  },
  {
    id: "q10",
    prompt: "How do you view lifelong commitment to a single romantic partner?",
    choices: [
      "I have or want such a romance.",
      "Such a romance would be ideal--if it's achievable.",
      "I worry I'd miss out on what others have to offer.",
      "Tie yourself to one person? Huge mistake.",
    ],
  },
  {
    id: "q11",
    prompt: "Do you insist on repayment when lending money to friends?",
    choices: [
      "Yes, and I write up a contract so there's no misunderstanding.",
      "Yes, but I try to be flexible about the exact terms.",
      "No, although it's sure nice to be repaid.",
      "No, they just owe me a favor.",
    ],
  },
  {
    id: "q12",
    prompt: "Are you still in touch with childhood friends?",
    choices: [
      "Yes, we correspond regularly.",
      "Yes, we try to keep in touch.",
      "No, I move around too much.",
      "No, I don't have anything in common with them anymore.",
    ],
  },
  {
    id: "q13",
    prompt: "Do you donate time and money to improve the local community?",
    choices: [
      "Yes, the needs of the community are my top priority.",
      "Yes, I donate as much as I can once my own needs are met.",
      "No, I don't have enough time or money to spare.",
      "No, my local community would be a waste of time and money.",
    ],
  },
  {
    id: "q14",
    prompt: "Your community is threatened with invasion. Do you:",
    choices: [
      "Help defend it to your last breath?",
      "Defend the area with the rest of your community?",
      "Flee as soon as things look grim?",
      "Cut a deal with the enemy to act as a spy?",
    ],
  },
  {
    id: "q15",
    prompt:
      "If you were injured and required immediate assistance, would members of your home town agree to help?",
    choices: [
      "Yes, because they know I'd do the same for them.",
      "Yes, because I'm generally well liked in my home town.",
      "Probably not, because I'm distrusted in my home town.",
      "Definitely not, I've made some enemies in my home town.",
    ],
  },
  {
    id: "q16",
    prompt: "Do you respect the laws and authorities of the community?",
    choices: [
      "Yes, without question.",
      "Yes, they're generally the best way to govern.",
      "When it suits me--there are some laws I just don't agree with.",
      "I don't pay attention to the authorities; they've got no hold on me.",
    ],
  },
  {
    id: "q17",
    prompt: "Do members of your home town shun, avoid, or mock you?",
    choices: [
      "Yes, their small minds can't handle anyone outside the norm.",
      "Some do, because I don't always fit in.",
      "No, I'm generally seen as normal.",
      "No, I set the standard for what is normal in my community.",
    ],
  },
  {
    id: "q18",
    prompt:
      "Would you stand for office or seek to represent the interests of the community in some public manner?",
    choices: [
      "To do so would be an honor I'd joyously accept.",
      "Of course. It's everyone's duty to do so.",
      "Only if no one else could handle the job.",
      "No, I don't want to be responsible for the community's welfare.",
    ],
  },
  {
    id: "q19",
    prompt: "Your country is wracked with famine. Would you:",
    choices: [
      "Share what food you had with others?",
      "Eat as little as possible yourself, and share the rest?",
      "Steal what food you needed to survive?",
      "Steal as much food as possible, then sell it back to the community at a high price?",
    ],
  },
  {
    id: "q20",
    prompt: "If offered enough money, would you slip a poison into your king's drink?",
    choices: [
      "Yes, I've done similar things before.",
      "Yes, if I thought I could get away with it.",
      "No, although a vast sum of money would tempt me.",
      "No, and I'd warn the king of the plot.",
    ],
  },
  {
    id: "q21",
    prompt: "A plague is sweeping across your country. Would you:",
    choices: [
      "Undertake a dangerous mission to find the cure?",
      "Heal the sick as best you can?",
      "Avoid contact with the sick?",
      "Flee the country?",
    ],
  },
  {
    id: "q22",
    prompt: "Do you respect the lawful authority of the rulers of the land?",
    choices: [
      "Yes, Long live the queen!",
      "Yes, our rulers are generally fair and just.",
      "No, a ruler is no better than anyone else.",
      "No, rulers are invariably corrupted by power.",
    ],
  },
  {
    id: "q23",
    prompt:
      "If you were offered a reasonably lucrative deal, would you spy for a hostile foreign power?",
    choices: [
      "Yes, because this nation could stand to be knocked down a peg.",
      "Yes, because the nation's secrets mean little to me.",
      "No, because I might get caught.",
      "No, because I'd never violate the trust my nation puts in me.",
    ],
  },
  {
    id: "q24",
    prompt: "Do you rely on the government to enforce contracts and property rights?",
    choices: [
      "Yes, because maintaining the rule of law is more important than any individual dispute.",
      "Yes, because the courts are best equipped to handle such disputes.",
      "Are you kidding me? The government can't even pave roads.",
      "Absolutely not. If I can't defend it myself, I don't deserve to have it.",
    ],
  },
  {
    id: "q25",
    prompt: "If imprisoned, would you injure or kill others to escape?",
    choices: [
      "Yes. Serves 'em right for locking me up.",
      "Yes. They knew the risks when they took the job.",
      "No, except for minor wounds that will heal easily.",
      "No. Those guards are just doing their jobs.",
    ],
  },
  {
    id: "q26",
    prompt:
      "Do you accept a noble's right to treat badly the serfs who work on his land?",
    choices: [
      "Yes. They're lucky they're not slaves.",
      "Yes, because sometimes only fear will motivate them.",
      "No, nobles should rule as kindly as possible.",
      'No one has any "right" to treat another badly. Period.',
    ],
  },
  {
    id: "q27",
    prompt: "You have accidentally committed a crime. Do you:",
    choices: [
      "Turn yourself in, and attempt to make restitution to the victim?",
      "Turn yourself in, throwing yourself on the mercy of the court?",
      "Hide your involvement, lying if you have to?",
      "Try to pin the crime on another?",
    ],
  },
  {
    id: "q28",
    prompt: "If guilty, would you confess to a crime?",
    choices: [
      "Yes, because it is my duty to do so.",
      "Yes, because it might get me a lighter sentence.",
      "No, I'd make the magistrates prove my guilt.",
      'No, and I\'d try to "prove" my own innocence.',
    ],
  },
  {
    id: "q29",
    prompt:
      "Would you express a revolutionary political opinion if threatened with punishment?",
    choices: [
      "Yes, I'd rather be punished than remain silent.",
      "Yes. Somebody's got to speak the truth.",
      "No, although I might privately express my opinion to friends.",
      "No, politics aren't worth getting worked up about.",
    ],
  },
  {
    id: "q30",
    prompt:
      "While traveling, you witness an assault. You are ordered to testify, which will delay your travel significantly. Do you:",
    choices: [
      "Slip out of town at night to avoid testifying.",
      "Deny you saw anything.",
      "Remain reluctantly, testify, and leave.",
      "Remain until the trial's conclusion in case further testimony is needed.",
    ],
  },
  {
    id: "q31",
    prompt: "What is the best use of wealth?",
    choices: [
      "To help the destitute and less fortunate.",
      "Provide for the needs of friends and family.",
      "To stay on top of the heap yourself.",
      "To not only stay on top, but keep others from climbing to your level.",
    ],
  },
  {
    id: "q32",
    prompt: "When confronted by beggars, do you:",
    choices: [
      "Give generously?",
      "Give moderately?",
      "Give only what you wouldn't miss anyway--a dollar or two at the most?",
      "Ignore them as you walk by?",
    ],
  },
  {
    id: "q33",
    prompt:
      "By using magic, you could fool village merchants into thinking your copper pieces were made of gold. Do you?",
    choices: [
      "Yes, and I'll buy as much as I can.",
      "Yes, but I'll only cheat the rich merchants.",
      "No, it's too risky.",
      "No, those merchants have families to feed.",
    ],
  },
  {
    id: "q34",
    prompt:
      "You have two job offers. One pays more, but the other is secure and steady. Which do you choose?",
    choices: [
      "Definitely the lucrative job; steady work sounds like drudgery.",
      "Probably the lucrative job, although I'd look into the secure job.",
      "The secure job, unless the other job was outrageously lucrative.",
      "Definitely the secure job, because I plan for the long term.",
    ],
  },
  {
    id: "q35",
    prompt: "What's the best path to wealth?",
    choices: [
      "It's a matter of luck and being in the right place at the right time.",
      "Staying flexible so you can take advantage of good opportunities.",
      "Following a long-term plan that incorporates a comfortable level of risk.",
      "Hard work and perseverance.",
    ],
  },
  {
    id: "q36",
    prompt:
      "If you accepted a job or contract, would you try to finish the task even if it got much more dangerous?",
    choices: [
      "Yes, my word is my bond.",
      "Yes, because it's good to have a reputation for dependability.",
      "You can bet I'd be renegotiating.",
      "If it's no longer a good deal, then the deal is off.",
    ],
  },
];

// EasyDamus process() scoring tables — one entry per question, keyed by choice 1–4.
// Each maps to an axis bucket: lx/nx/cx (law–chaos) or xg/xn/xe (good–evil) + weight 1|2.
type AxisKey = "lx" | "nx" | "cx" | "xg" | "xn" | "xe";
type ScoreBump = { axis: AxisKey; pts: 1 | 2 };

const SCORE_TABLE: ScoreBump[][] = [
  // q1
  [
    { axis: "xg", pts: 2 },
    { axis: "xg", pts: 1 },
    { axis: "xe", pts: 1 },
    { axis: "xe", pts: 2 },
  ],
  // q2
  [
    { axis: "xg", pts: 2 },
    { axis: "xg", pts: 1 },
    { axis: "xn", pts: 1 },
    { axis: "xn", pts: 2 },
  ],
  // q3
  [
    { axis: "xe", pts: 2 },
    { axis: "xe", pts: 1 },
    { axis: "xn", pts: 1 },
    { axis: "xn", pts: 2 },
  ],
  // q4
  [
    { axis: "lx", pts: 2 },
    { axis: "lx", pts: 1 },
    { axis: "cx", pts: 1 },
    { axis: "cx", pts: 2 },
  ],
  // q5
  [
    { axis: "lx", pts: 2 },
    { axis: "lx", pts: 1 },
    { axis: "nx", pts: 1 },
    { axis: "nx", pts: 2 },
  ],
  // q6
  [
    { axis: "cx", pts: 2 },
    { axis: "cx", pts: 1 },
    { axis: "nx", pts: 1 },
    { axis: "nx", pts: 2 },
  ],
  // q7
  [
    { axis: "xe", pts: 2 },
    { axis: "xe", pts: 1 },
    { axis: "xg", pts: 1 },
    { axis: "xg", pts: 2 },
  ],
  // q8
  [
    { axis: "xg", pts: 2 },
    { axis: "xg", pts: 1 },
    { axis: "xn", pts: 1 },
    { axis: "xn", pts: 2 },
  ],
  // q9
  [
    { axis: "xe", pts: 2 },
    { axis: "xe", pts: 1 },
    { axis: "xn", pts: 1 },
    { axis: "xn", pts: 2 },
  ],
  // q10
  [
    { axis: "lx", pts: 2 },
    { axis: "lx", pts: 1 },
    { axis: "cx", pts: 1 },
    { axis: "cx", pts: 2 },
  ],
  // q11
  [
    { axis: "lx", pts: 2 },
    { axis: "lx", pts: 1 },
    { axis: "nx", pts: 1 },
    { axis: "nx", pts: 2 },
  ],
  // q12
  [
    { axis: "nx", pts: 2 },
    { axis: "nx", pts: 1 },
    { axis: "cx", pts: 1 },
    { axis: "cx", pts: 2 },
  ],
  // q13
  [
    { axis: "xg", pts: 2 },
    { axis: "xg", pts: 1 },
    { axis: "xn", pts: 1 },
    { axis: "xn", pts: 2 },
  ],
  // q14
  [
    { axis: "xg", pts: 2 },
    { axis: "xg", pts: 1 },
    { axis: "xe", pts: 1 },
    { axis: "xe", pts: 2 },
  ],
  // q15
  [
    { axis: "xn", pts: 2 },
    { axis: "xn", pts: 1 },
    { axis: "xe", pts: 1 },
    { axis: "xe", pts: 2 },
  ],
  // q16
  [
    { axis: "lx", pts: 2 },
    { axis: "lx", pts: 1 },
    { axis: "cx", pts: 1 },
    { axis: "cx", pts: 2 },
  ],
  // q17
  [
    { axis: "cx", pts: 2 },
    { axis: "cx", pts: 1 },
    { axis: "nx", pts: 1 },
    { axis: "nx", pts: 2 },
  ],
  // q18
  [
    { axis: "lx", pts: 2 },
    { axis: "lx", pts: 1 },
    { axis: "nx", pts: 1 },
    { axis: "nx", pts: 2 },
  ],
  // q19
  [
    { axis: "xg", pts: 2 },
    { axis: "xg", pts: 1 },
    { axis: "xe", pts: 1 },
    { axis: "xe", pts: 2 },
  ],
  // q20
  [
    { axis: "xe", pts: 2 },
    { axis: "xe", pts: 1 },
    { axis: "xn", pts: 1 },
    { axis: "xn", pts: 2 },
  ],
  // q21
  [
    { axis: "xg", pts: 2 },
    { axis: "xg", pts: 1 },
    { axis: "xn", pts: 1 },
    { axis: "xn", pts: 2 },
  ],
  // q22
  [
    { axis: "lx", pts: 2 },
    { axis: "lx", pts: 1 },
    { axis: "cx", pts: 1 },
    { axis: "cx", pts: 2 },
  ],
  // q23
  [
    { axis: "cx", pts: 2 },
    { axis: "cx", pts: 1 },
    { axis: "nx", pts: 1 },
    { axis: "nx", pts: 2 },
  ],
  // q24
  [
    { axis: "lx", pts: 2 },
    { axis: "lx", pts: 1 },
    { axis: "nx", pts: 1 },
    { axis: "nx", pts: 2 },
  ],
  // q25
  [
    { axis: "xe", pts: 2 },
    { axis: "xe", pts: 1 },
    { axis: "xn", pts: 1 },
    { axis: "xn", pts: 2 },
  ],
  // q26
  [
    { axis: "xn", pts: 2 },
    { axis: "xn", pts: 1 },
    { axis: "xg", pts: 1 },
    { axis: "xg", pts: 2 },
  ],
  // q27
  [
    { axis: "xg", pts: 2 },
    { axis: "xg", pts: 1 },
    { axis: "xe", pts: 1 },
    { axis: "xe", pts: 2 },
  ],
  // q28
  [
    { axis: "lx", pts: 2 },
    { axis: "lx", pts: 1 },
    { axis: "nx", pts: 1 },
    { axis: "nx", pts: 2 },
  ],
  // q29
  [
    { axis: "cx", pts: 2 },
    { axis: "cx", pts: 1 },
    { axis: "nx", pts: 1 },
    { axis: "nx", pts: 2 },
  ],
  // q30
  [
    { axis: "cx", pts: 2 },
    { axis: "cx", pts: 1 },
    { axis: "lx", pts: 1 },
    { axis: "lx", pts: 2 },
  ],
  // q31
  [
    { axis: "xg", pts: 2 },
    { axis: "xg", pts: 1 },
    { axis: "xe", pts: 1 },
    { axis: "xe", pts: 2 },
  ],
  // q32
  [
    { axis: "xg", pts: 2 },
    { axis: "xg", pts: 1 },
    { axis: "xn", pts: 1 },
    { axis: "xn", pts: 2 },
  ],
  // q33
  [
    { axis: "xe", pts: 2 },
    { axis: "xe", pts: 1 },
    { axis: "xn", pts: 1 },
    { axis: "xn", pts: 2 },
  ],
  // q34
  [
    { axis: "nx", pts: 2 },
    { axis: "nx", pts: 1 },
    { axis: "lx", pts: 1 },
    { axis: "lx", pts: 2 },
  ],
  // q35
  [
    { axis: "cx", pts: 2 },
    { axis: "cx", pts: 1 },
    { axis: "lx", pts: 1 },
    { axis: "lx", pts: 2 },
  ],
  // q36
  [
    { axis: "nx", pts: 2 },
    { axis: "nx", pts: 1 },
    { axis: "cx", pts: 1 },
    { axis: "cx", pts: 2 },
  ],
];

const RESULT_KEY = (w: string) => `lpp:moral:${w.toLowerCase()}`;
const INDEX_KEY = "lpp:moral:index";

function strengthAxis(primary: number, neutral: number, opposite: number): number {
  // Map EasyDamus bucket totals → UI −2…+2 (negative = primary / lawful or good).
  if (primary > neutral && primary > opposite) {
    return primary - Math.max(neutral, opposite) >= 8 ? -2 : -1;
  }
  if (opposite > neutral && opposite > primary) {
    return opposite - Math.max(neutral, primary) >= 8 ? 2 : 1;
  }
  return 0;
}

export function scoreAlignment(choices: number[]): {
  label: MoralLabel;
  lawChaos: number;
  goodEvil: number;
  scores: {
    lx: number;
    nx: number;
    cx: number;
    xg: number;
    xn: number;
    xe: number;
  };
} {
  const scores = { lx: 0, nx: 0, cx: 0, xg: 0, xn: 0, xe: 0 };
  for (let i = 0; i < SCORE_TABLE.length; i++) {
    const c = Math.round(Number(choices[i]));
    if (c < 1 || c > 4) continue;
    const bump = SCORE_TABLE[i][c - 1];
    scores[bump.axis] += bump.pts;
  }

  const { lx, nx, cx, xg, xn, xe } = scores;
  const combos: { code: string; n: number }[] = [
    { code: "lg", n: lx + xg },
    { code: "ng", n: nx + xg },
    { code: "cg", n: cx + xg },
    { code: "ln", n: lx + xn },
    { code: "nn", n: nx + xn },
    { code: "cn", n: cx + xn },
    { code: "le", n: lx + xe },
    { code: "ne", n: nx + xe },
    { code: "ce", n: cx + xe },
  ];

  let best = combos[0];
  for (const c of combos) {
    if (c.n > best.n) best = c;
  }

  // EasyDamus tie-break: if more than one alignment shares the top score,
  // fall back to axis majorities (lx/nx/cx × xg/xn/xe).
  let tie = -1;
  for (const c of combos) {
    if (c.n === best.n) tie += 1;
  }
  let code = best.code;
  if (tie !== 0) {
    const law = lx > nx && lx > cx ? "l" : cx > nx && cx > lx ? "c" : "n";
    const moral = xg > xe && xg > xn ? "g" : xe > xn && xe > xg ? "e" : "n";
    code = law + moral;
  }

  return {
    label: CODE_TO_LABEL[code] || "True Neutral",
    lawChaos: strengthAxis(lx, nx, cx),
    goodEvil: strengthAxis(xg, xn, xe),
    scores,
  };
}

export { moralMapCoords, moralMargin } from "@/lib/moral-map";

/** @deprecated kept for any old callers — prefer scoreAlignment. */
export function labelFromAxes(lawChaos: number, goodEvil: number): MoralLabel {
  const law = lawChaos <= -1 ? "Lawful" : lawChaos >= 1 ? "Chaotic" : "Neutral";
  const moral = goodEvil <= -1 ? "Good" : goodEvil >= 1 ? "Evil" : "Neutral";
  if (law === "Neutral" && moral === "Neutral") return "True Neutral";
  if (law === "Neutral") return moral === "Good" ? "Neutral Good" : "Neutral Evil";
  if (moral === "Neutral") return `${law} Neutral` as MoralLabel;
  return `${law} ${moral}` as MoralLabel;
}

export async function getMoralIndex(): Promise<string[]> {
  try {
    const raw = await redis.get<string | string[]>(INDEX_KEY);
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    }
    return [];
  } catch (e) {
    console.error("getMoralIndex", e);
    return [];
  }
}

export async function getMoralResult(wallet: string): Promise<MoralResult | null> {
  try {
    const raw = await redis.get<string | MoralResult>(RESULT_KEY(wallet));
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    console.error("getMoralResult", wallet, e);
    return null;
  }
}

export async function saveMoralResult(result: MoralResult) {
  await redis.set(RESULT_KEY(result.wallet), JSON.stringify(result));
  const index = await getMoralIndex();
  const w = result.wallet.toLowerCase();
  if (!index.map((x) => x.toLowerCase()).includes(w)) {
    await redis.set(INDEX_KEY, JSON.stringify([...index, result.wallet]));
  }
}

export async function listMoralResults(): Promise<MoralResult[]> {
  const index = await getMoralIndex();
  const rows = await Promise.all(index.map((w) => getMoralResult(w)));
  return rows.filter(Boolean) as MoralResult[];
}

async function classifyWithModel(p: LarvaProfile): Promise<MoralResult | null> {
  const numbered = MORAL_QUESTIONS.map((q, i) => {
    const opts = q.choices.map((c, j) => `  ${j + 1}) ${c}`).join("\n");
    return `${i + 1}. [${q.id}] ${q.prompt}\n${opts}`;
  }).join("\n\n");

  const system = `You are "${p.profile.name}", a larva (personal AI governance agent) in the $CLAWD hive.
Tagline: ${p.profile.tagline}
Tone: ${p.profile.tone}
Values: ${p.profile.values.join("; ")}
Quirks: ${p.profile.quirks.join("; ")}
Personality: ${p.profile.summary}

You are taking the classic D&D Alignment Test (EasyDamus). Answer EVERY question in character.
Map fantasy framing to hive life when it helps (family ≈ close allies / mentors, community ≈ $CLAWD swarm, king/rulers ≈ core team / admins, nation ≈ the project).
Pick the option (1–4) this larva would ACTUALLY choose — not the "nice" answer.

Respond with ONLY JSON, no markdown:
{"choices":[1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4,1,2,3,4]}
Exactly 36 integers, each 1–4, in question order.`;

  const raw = await haiku(system, `Questions:\n${numbered}`, 512, 0.7);
  const clean = raw.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) return null;

  let parsed: { choices?: unknown };
  try {
    parsed = JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }

  const rawChoices = Array.isArray(parsed.choices) ? parsed.choices : [];
  if (rawChoices.length < 36) return null;

  const choices = rawChoices.slice(0, 36).map((c) => {
    const n = Math.round(Number(c));
    return n >= 1 && n <= 4 ? n : 0;
  });
  if (choices.some((c) => c === 0)) return null;

  const scored = scoreAlignment(choices);
  const answers: MoralAnswer[] = MORAL_QUESTIONS.map((q, i) => ({
    id: q.id,
    prompt: q.prompt,
    choice: choices[i],
    answer: q.choices[choices[i] - 1],
  }));

  return {
    wallet: p.wallet,
    name: p.profile.name,
    tone: p.profile.tone,
    label: scored.label,
    lawChaos: scored.lawChaos,
    goodEvil: scored.goodEvil,
    scores: scored.scores,
    answers,
    testedAt: new Date().toISOString(),
    source: "easydamus",
  };
}

/** Run (or re-run) the moral alignment test for one larva. */
export async function runMoralTest(wallet: string): Promise<MoralResult | null> {
  const p = await getProfile(wallet);
  if (!p) return null;
  const result = await classifyWithModel(p);
  if (!result) return null;
  await saveMoralResult(result);
  return result;
}

/** Pick a random indexed larva that has a profile. */
export async function pickRandomWallet(): Promise<string | null> {
  const index = await getIndex();
  if (index.length === 0) return null;
  const i = Math.floor(Math.random() * index.length);
  return index[i]?.wallet || null;
}

export const ALIGNMENT_GRID: MoralLabel[][] = [
  ["Lawful Good", "Neutral Good", "Chaotic Good"],
  ["Lawful Neutral", "True Neutral", "Chaotic Neutral"],
  ["Lawful Evil", "Neutral Evil", "Chaotic Evil"],
];
