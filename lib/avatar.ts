// Shared larvatar trait types + normalization (safe for client + server).

export type AvatarBody = "plump" | "slim" | "round" | "tall";
export type AvatarPattern = "plain" | "stripes" | "spots" | "bands";
export type AvatarEyes = "soft" | "sharp" | "wide" | "sleepy" | "gleam";
export type AvatarAntenna = "curl" | "fork" | "droop" | "bolt" | "sway";
export type AvatarAccessory =
  | "none"
  | "monocle"
  | "bowtie"
  | "cap"
  | "horns"
  | "flower"
  | "badge"
  | "scarf";

export type LarvatarTraits = {
  hue: number;
  tone: string;
  body: AvatarBody;
  pattern: AvatarPattern;
  eyes: AvatarEyes;
  antenna: AvatarAntenna;
  accessory: AvatarAccessory;
  cheeks: boolean;
  accent: number; // secondary hue 0-359
};

const BODIES: AvatarBody[] = ["plump", "slim", "round", "tall"];
const PATTERNS: AvatarPattern[] = ["plain", "stripes", "spots", "bands"];
const EYES: AvatarEyes[] = ["soft", "sharp", "wide", "sleepy", "gleam"];
const ANTENNAE: AvatarAntenna[] = ["curl", "fork", "droop", "bolt", "sway"];
const ACCESSORIES: AvatarAccessory[] = [
  "none",
  "monocle",
  "bowtie",
  "cap",
  "horns",
  "flower",
  "badge",
  "scarf",
];

const TONE_LOOK: Record<
  string,
  {
    bodies: AvatarBody[];
    patterns: AvatarPattern[];
    eyes: AvatarEyes[];
    antenna: AvatarAntenna[];
    accessories: AvatarAccessory[];
    cheeks: boolean;
  }
> = {
  fiery: {
    bodies: ["plump", "tall"],
    patterns: ["stripes", "bands"],
    eyes: ["sharp", "wide", "gleam"],
    antenna: ["bolt", "sway"],
    accessories: ["horns", "badge", "none"],
    cheeks: false,
  },
  chill: {
    bodies: ["round", "plump"],
    patterns: ["plain", "spots"],
    eyes: ["sleepy", "soft"],
    antenna: ["droop", "sway", "curl"],
    accessories: ["flower", "scarf", "none"],
    cheeks: true,
  },
  analytical: {
    bodies: ["slim", "tall"],
    patterns: ["bands", "plain"],
    eyes: ["sharp", "gleam"],
    antenna: ["fork", "curl"],
    accessories: ["monocle", "badge", "cap"],
    cheeks: false,
  },
  chaotic: {
    bodies: ["tall", "plump", "round"],
    patterns: ["spots", "stripes"],
    eyes: ["wide", "gleam", "sharp"],
    antenna: ["sway", "bolt", "fork"],
    accessories: ["horns", "flower", "badge", "none"],
    cheeks: false,
  },
  earnest: {
    bodies: ["plump", "round"],
    patterns: ["plain", "spots"],
    eyes: ["soft", "wide", "gleam"],
    antenna: ["curl", "sway"],
    accessories: ["bowtie", "flower", "badge", "none"],
    cheeks: true,
  },
  cynical: {
    bodies: ["slim", "round"],
    patterns: ["bands", "plain"],
    eyes: ["sharp", "sleepy"],
    antenna: ["droop", "fork"],
    accessories: ["scarf", "monocle", "cap", "none"],
    cheeks: false,
  },
};

export function walletSeed(wallet: string): number {
  let h = 2166136261;
  for (const c of wallet.toLowerCase()) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], seed: number, salt: number): T {
  return arr[Math.abs((seed + salt * 9973) % arr.length)];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Personality-aware defaults when traits are missing (old profiles / partial LLM output). */
export function deriveLarvatarTraits(input: {
  hue: number;
  tone: string;
  wallet?: string;
  partial?: Partial<LarvatarTraits> | null;
}): LarvatarTraits {
  const tone = input.tone || "earnest";
  const look = TONE_LOOK[tone] || TONE_LOOK.earnest;
  const seed = walletSeed(input.wallet || String(input.hue));
  const p = input.partial || {};

  return {
    hue: ((Number.isFinite(input.hue) ? input.hue : seed % 360) + 360) % 360,
    tone,
    body: oneOf(p.body, BODIES, pick(look.bodies, seed, 1)),
    pattern: oneOf(p.pattern, PATTERNS, pick(look.patterns, seed, 2)),
    eyes: oneOf(p.eyes, EYES, pick(look.eyes, seed, 3)),
    antenna: oneOf(p.antenna, ANTENNAE, pick(look.antenna, seed, 4)),
    accessory: oneOf(p.accessory, ACCESSORIES, pick(look.accessories, seed, 5)),
    cheeks: typeof p.cheeks === "boolean" ? p.cheeks : look.cheeks,
    accent:
      typeof p.accent === "number" && Number.isFinite(p.accent)
        ? ((p.accent % 360) + 360) % 360
        : (input.hue + 28 + (seed % 40)) % 360,
  };
}

export function parseAvatarFromLlm(
  parsed: any,
  hue: number,
  tone: string,
  wallet: string
): LarvatarTraits {
  const a = parsed?.avatar && typeof parsed.avatar === "object" ? parsed.avatar : {};
  return deriveLarvatarTraits({
    hue,
    tone,
    wallet,
    partial: {
      body: a.body,
      pattern: a.pattern,
      eyes: a.eyes,
      antenna: a.antenna,
      accessory: a.accessory,
      cheeks: a.cheeks,
      accent: typeof a.accent === "number" ? a.accent : undefined,
    },
  });
}
