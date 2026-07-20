// Shared larvatar trait types + normalization (safe for client + server).

export type AvatarBody = "plump" | "slim" | "round" | "tall";
export type AvatarPattern = "plain" | "stripes" | "spots" | "bands";
export type AvatarEyes = "soft" | "sharp" | "wide" | "sleepy" | "gleam";
export type AvatarAntenna = "curl" | "fork" | "droop" | "bolt" | "sway";
export type AvatarMouth = "smile" | "flat" | "smirk" | "grin" | "frown";
export type AvatarPose = "upright" | "lean-left" | "lean-right";
export type AvatarAccessory =
  | "none"
  | "monocle"
  | "bowtie"
  | "cap"
  | "horns"
  | "flower"
  | "badge"
  | "scarf"
  | "goggles"
  | "crown"
  | "clipboard"
  | "leaf";

export type LarvatarTraits = {
  hue: number;
  tone: string;
  body: AvatarBody;
  pattern: AvatarPattern;
  eyes: AvatarEyes;
  antenna: AvatarAntenna;
  accessory: AvatarAccessory;
  mouth: AvatarMouth;
  pose: AvatarPose;
  cheeks: boolean;
  accent: number; // secondary hue 0-359
};

const BODIES: AvatarBody[] = ["plump", "slim", "round", "tall"];
const PATTERNS: AvatarPattern[] = ["plain", "stripes", "spots", "bands"];
const EYES: AvatarEyes[] = ["soft", "sharp", "wide", "sleepy", "gleam"];
const ANTENNAE: AvatarAntenna[] = ["curl", "fork", "droop", "bolt", "sway"];
const MOUTHS: AvatarMouth[] = ["smile", "flat", "smirk", "grin", "frown"];
const POSES: AvatarPose[] = ["upright", "lean-left", "lean-right"];
const ACCESSORIES: AvatarAccessory[] = [
  "none",
  "monocle",
  "bowtie",
  "cap",
  "horns",
  "flower",
  "badge",
  "scarf",
  "goggles",
  "crown",
  "clipboard",
  "leaf",
];

const TONE_LOOK: Record<
  string,
  {
    bodies: AvatarBody[];
    patterns: AvatarPattern[];
    eyes: AvatarEyes[];
    antenna: AvatarAntenna[];
    accessories: AvatarAccessory[];
    mouths: AvatarMouth[];
    poses: AvatarPose[];
    cheeks: boolean;
  }
> = {
  fiery: {
    bodies: ["plump", "tall", "slim"],
    patterns: ["stripes", "bands", "spots"],
    eyes: ["sharp", "wide", "gleam"],
    antenna: ["bolt", "sway", "fork"],
    accessories: ["horns", "badge", "crown", "goggles", "none"],
    mouths: ["grin", "smirk", "flat"],
    poses: ["upright", "lean-right"],
    cheeks: false,
  },
  chill: {
    bodies: ["round", "plump", "tall"],
    patterns: ["plain", "spots", "bands"],
    eyes: ["sleepy", "soft", "gleam"],
    antenna: ["droop", "sway", "curl"],
    accessories: ["flower", "scarf", "leaf", "none", "cap"],
    mouths: ["smile", "flat", "smirk"],
    poses: ["upright", "lean-left"],
    cheeks: true,
  },
  analytical: {
    bodies: ["slim", "tall", "round"],
    patterns: ["bands", "plain", "stripes"],
    eyes: ["sharp", "gleam", "soft"],
    antenna: ["fork", "curl", "bolt"],
    accessories: ["monocle", "goggles", "clipboard", "badge", "cap", "none"],
    mouths: ["flat", "smirk", "smile"],
    poses: ["upright", "lean-left"],
    cheeks: false,
  },
  chaotic: {
    bodies: ["tall", "plump", "round", "slim"],
    patterns: ["spots", "stripes", "bands"],
    eyes: ["wide", "gleam", "sharp", "sleepy"],
    antenna: ["sway", "bolt", "fork", "curl"],
    accessories: ["horns", "flower", "crown", "badge", "leaf", "none"],
    mouths: ["grin", "smirk", "frown", "flat"],
    poses: ["lean-left", "lean-right"],
    cheeks: false,
  },
  earnest: {
    bodies: ["plump", "round", "tall"],
    patterns: ["plain", "spots", "bands"],
    eyes: ["soft", "wide", "gleam"],
    antenna: ["curl", "sway", "droop"],
    accessories: ["bowtie", "flower", "badge", "leaf", "scarf", "none"],
    mouths: ["smile", "grin", "flat"],
    poses: ["upright", "lean-right"],
    cheeks: true,
  },
  cynical: {
    bodies: ["slim", "round", "plump"],
    patterns: ["bands", "plain", "stripes"],
    eyes: ["sharp", "sleepy", "gleam"],
    antenna: ["droop", "fork", "curl"],
    accessories: ["scarf", "monocle", "cap", "goggles", "clipboard", "none"],
    mouths: ["smirk", "frown", "flat"],
    poses: ["upright", "lean-left"],
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

/** Prefer a real prop over "none" so the grid doesn't fill with bare blobs. */
function pickAccessory(options: AvatarAccessory[], seed: number, salt: number): AvatarAccessory {
  const weighted = options.filter((a) => a !== "none");
  const pool = weighted.length > 0 && seed % 5 !== 0 ? weighted : options;
  return pick(pool, seed, salt);
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

  // Spread hues for old hue/tone-only profiles; keep explicit stored hue stable when present with traits
  const hasRichTraits = typeof p.body === "string" || typeof p.eyes === "string";
  const baseHue = ((Number.isFinite(input.hue) ? input.hue : seed % 360) + 360) % 360;
  const hue = hasRichTraits ? baseHue : (baseHue + ((seed % 47) - 23) + 360) % 360;

  return {
    hue,
    tone,
    body: oneOf(p.body, BODIES, pick(look.bodies, seed, 1)),
    pattern: oneOf(p.pattern, PATTERNS, pick(look.patterns, seed, 2)),
    eyes: oneOf(p.eyes, EYES, pick(look.eyes, seed, 3)),
    antenna: oneOf(p.antenna, ANTENNAE, pick(look.antenna, seed, 4)),
    accessory: oneOf(p.accessory, ACCESSORIES, pickAccessory(look.accessories, seed, 5)),
    mouth: oneOf(p.mouth, MOUTHS, pick(look.mouths, seed, 6)),
    pose: oneOf(p.pose, POSES, pick(look.poses, seed, 7)),
    cheeks: typeof p.cheeks === "boolean" ? p.cheeks : look.cheeks || seed % 4 === 0,
    accent:
      typeof p.accent === "number" && Number.isFinite(p.accent)
        ? ((p.accent % 360) + 360) % 360
        : (hue + 40 + (seed % 80)) % 360,
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
      mouth: a.mouth,
      pose: a.pose,
      cheeks: a.cheeks,
      accent: typeof a.accent === "number" ? a.accent : undefined,
    },
  });
}
