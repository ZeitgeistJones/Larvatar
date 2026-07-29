// Shared larvatar trait types + normalization (safe for client + server).

export type AvatarBody = "plump" | "slim" | "round" | "tall" | "pear" | "bean" | "squat";
export type AvatarPattern = "plain" | "stripes" | "spots" | "bands";
export type AvatarEyes = "soft" | "sharp" | "wide" | "sleepy" | "gleam" | "beady" | "cross";
export type AvatarAntenna = "curl" | "fork" | "droop" | "bolt" | "sway";
export type AvatarMouth = "smile" | "flat" | "smirk" | "grin" | "frown" | "o" | "smug";
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
  | "leaf"
  | "patch"
  | "spike"
  | "leaf-crown"
  | "straw-hat";

export type AvatarShell = "smooth" | "ridged" | "spiky" | "fluffy";
export type AvatarMark = "none" | "scar" | "freckles" | "notch" | "blush-heavy" | "stripe";

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
  /** Gemini-generated portrait URL (Vercel Blob). Optional — SVG fallback when missing. */
  portraitUrl?: string;
  portraitAt?: string;
};

export type LarvaMoralAxes = {
  lawChaos: number; // -2 … +2
  goodEvil: number; // -2 … +2
  label?: string;
};

export type LarvaLookRecipe = {
  /** Display silhouette — may remorph stored body for grid variety. */
  displayBody: AvatarBody;
  shell: AvatarShell;
  mark: AvatarMark;
  eyeAsymmetry: number; // 0–0.35 scale delta between eyes
  wobble: number; // extra pose degrees
  patternOpacity: number;
  outlineBoost: number;
  browBoost: number;
  glossBoost: number;
  satShift: number;
  lightShift: number;
  halo: boolean;
  haloWarm: boolean;
  bellyStripes: number;
  antennaKink: boolean;
};

const BODIES: AvatarBody[] = ["plump", "slim", "round", "tall", "pear", "bean", "squat"];
const PATTERNS: AvatarPattern[] = ["plain", "stripes", "spots", "bands"];
const EYES: AvatarEyes[] = ["soft", "sharp", "wide", "sleepy", "gleam", "beady", "cross"];
const ANTENNAE: AvatarAntenna[] = ["curl", "fork", "droop", "bolt", "sway"];
const MOUTHS: AvatarMouth[] = ["smile", "flat", "smirk", "grin", "frown", "o", "smug"];
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
  "patch",
  "spike",
  "leaf-crown",
  "straw-hat",
];

const BODY_FAMILY: Record<AvatarBody, AvatarBody[]> = {
  plump: ["plump", "pear", "squat", "round"],
  slim: ["slim", "bean", "tall"],
  round: ["round", "squat", "plump", "pear"],
  tall: ["tall", "bean", "slim", "pear"],
  pear: ["pear", "plump", "tall"],
  bean: ["bean", "slim", "tall"],
  squat: ["squat", "round", "plump"],
};

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
    bodies: ["plump", "tall", "slim", "pear"],
    patterns: ["stripes", "bands", "spots"],
    eyes: ["sharp", "wide", "gleam", "cross"],
    antenna: ["bolt", "sway", "fork"],
    accessories: ["horns", "badge", "crown", "goggles", "spike", "none"],
    mouths: ["grin", "smirk", "flat", "smug"],
    poses: ["upright", "lean-right"],
    cheeks: false,
  },
  chill: {
    bodies: ["round", "plump", "tall", "squat", "bean"],
    patterns: ["plain", "spots", "bands"],
    eyes: ["sleepy", "soft", "gleam", "beady"],
    antenna: ["droop", "sway", "curl"],
    accessories: ["flower", "scarf", "leaf", "leaf-crown", "none", "cap"],
    mouths: ["smile", "flat", "smirk", "o"],
    poses: ["upright", "lean-left"],
    cheeks: true,
  },
  analytical: {
    bodies: ["slim", "tall", "round", "bean"],
    patterns: ["bands", "plain", "stripes"],
    eyes: ["sharp", "gleam", "soft", "beady"],
    antenna: ["fork", "curl", "bolt"],
    accessories: ["monocle", "goggles", "clipboard", "badge", "cap", "patch", "none"],
    mouths: ["flat", "smirk", "smile", "o"],
    poses: ["upright", "lean-left"],
    cheeks: false,
  },
  chaotic: {
    bodies: ["tall", "plump", "round", "slim", "pear", "bean", "squat"],
    patterns: ["spots", "stripes", "bands"],
    eyes: ["wide", "gleam", "sharp", "sleepy", "cross"],
    antenna: ["sway", "bolt", "fork", "curl"],
    accessories: ["horns", "flower", "crown", "badge", "leaf", "spike", "none"],
    mouths: ["grin", "smirk", "frown", "flat", "smug"],
    poses: ["lean-left", "lean-right"],
    cheeks: false,
  },
  earnest: {
    bodies: ["plump", "round", "tall", "pear", "squat"],
    patterns: ["plain", "spots", "bands"],
    eyes: ["soft", "wide", "gleam"],
    antenna: ["curl", "sway", "droop"],
    accessories: ["bowtie", "flower", "badge", "leaf", "scarf", "leaf-crown", "none"],
    mouths: ["smile", "grin", "flat", "o"],
    poses: ["upright", "lean-right"],
    cheeks: true,
  },
  cynical: {
    bodies: ["slim", "round", "plump", "bean", "squat"],
    patterns: ["bands", "plain", "stripes"],
    eyes: ["sharp", "sleepy", "gleam", "beady", "cross"],
    antenna: ["droop", "fork", "curl"],
    accessories: ["scarf", "monocle", "cap", "goggles", "clipboard", "patch", "none"],
    mouths: ["smirk", "frown", "flat", "smug"],
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

function quirkSeed(quirks: string[] | undefined, base: number): number {
  if (!quirks?.length) return base;
  let h = base;
  for (const q of quirks) {
    for (const c of q.toLowerCase()) {
      h ^= c.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
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

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Client-side look layer: moral + quirks + seed augment stored traits
 * without requiring a Redis rebuild.
 */
export function larvaLookRecipe(input: {
  body: AvatarBody;
  wallet?: string;
  quirks?: string[];
  moral?: LarvaMoralAxes | null;
  conviction?: number | null;
}): LarvaLookRecipe {
  const seed = quirkSeed(input.quirks, walletSeed(input.wallet || input.body));
  const family = BODY_FAMILY[input.body] || BODY_FAMILY.plump;
  const displayBody = pick(family, seed, 11);

  const law = clamp(Number(input.moral?.lawChaos ?? 0), -2, 2);
  const good = clamp(Number(input.moral?.goodEvil ?? 0), -2, 2);
  const conv = clamp(Number(input.conviction ?? 0.45), 0, 1);

  let shell: AvatarShell = "smooth";
  if (law <= -1) shell = "ridged";
  else if (law >= 1.5) shell = "spiky";
  else if (law >= 0.5) shell = pick(["spiky", "fluffy", "smooth"] as AvatarShell[], seed, 13);
  else if (good <= -1) shell = pick(["spiky", "ridged"] as AvatarShell[], seed, 14);
  else if (good >= 1) shell = pick(["fluffy", "smooth"] as AvatarShell[], seed, 15);

  const marks: AvatarMark[] = ["scar", "freckles", "notch", "blush-heavy", "stripe", "none"];
  const mark = pick(marks, seed, 17);

  const chaos = Math.max(0, law);
  const lawful = Math.max(0, -law);

  return {
    displayBody,
    shell,
    mark,
    eyeAsymmetry: chaos * 0.12 + (seed % 5) * 0.02,
    wobble: chaos * 1.8 + (seed % 3) * 0.4,
    patternOpacity: 0.22 + conv * 0.28 + chaos * 0.06,
    outlineBoost: 0.35 + lawful * 0.35 + conv * 0.4,
    browBoost: Math.max(0, -good) * 4 + (seed % 3),
    glossBoost: Math.max(0, good) * 0.12 - Math.max(0, -good) * 0.08,
    satShift: good * 4 - law * 2,
    lightShift: good * 3 - Math.max(0, -good) * 4,
    halo: good >= 1,
    haloWarm: good >= 0,
    bellyStripes: 1 + (seed % 3) + (lawful > 0.5 ? 1 : 0),
    antennaKink: chaos >= 1 || seed % 4 === 0,
  };
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

  const hasRichTraits = typeof p.body === "string" || typeof p.eyes === "string";
  const baseHue = ((Number.isFinite(input.hue) ? input.hue : seed % 360) + 360) % 360;
  const hue = hasRichTraits ? baseHue : (baseHue + ((seed % 47) - 23) + 360) % 360;

  const traits: LarvatarTraits = {
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
  if (typeof p.portraitUrl === "string" && p.portraitUrl.startsWith("http")) {
    traits.portraitUrl = p.portraitUrl;
  }
  if (typeof p.portraitAt === "string" && p.portraitAt) {
    traits.portraitAt = p.portraitAt;
  }
  return traits;
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
