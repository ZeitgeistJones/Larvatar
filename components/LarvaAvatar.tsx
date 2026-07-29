import {
  deriveLarvatarTraits,
  larvaLookRecipe,
  walletSeed,
  type LarvatarTraits,
  type AvatarAccessory,
  type AvatarAntenna,
  type AvatarBody,
  type AvatarEyes,
  type AvatarMark,
  type AvatarMouth,
  type AvatarPattern,
  type AvatarPose,
  type AvatarShell,
  type LarvaMoralAxes,
  type LarvaLookRecipe,
} from "@/lib/avatar";

type Props = {
  hue: number;
  tone: string;
  size?: number;
  wallet?: string;
  traits?: Partial<LarvatarTraits> | null;
  label?: string;
  moral?: LarvaMoralAxes | null;
  quirks?: string[];
  conviction?: number | null;
  /** Bounce / squish while TTS is playing. */
  talking?: boolean;
};

/** Size-locked gumdrop — each body is a real silhouette change. */
function bodyGeom(body: AvatarBody) {
  switch (body) {
    case "slim":
      return {
        cx: 0,
        cy: 1,
        rx: 17.5,
        ry: 21.5,
        faceY: -5,
        squish: 0.92,
        tail: { cx: -14, cy: 12, rx: 4.5, ry: 6.5 },
        path: null as string | null,
      };
    case "tall":
      return {
        cx: 0,
        cy: 0,
        rx: 18.5,
        ry: 23.5,
        faceY: -6.5,
        squish: 0.88,
        tail: { cx: -13, cy: 14, rx: 5, ry: 7 },
        path: null as string | null,
      };
    case "round":
      return {
        cx: 0,
        cy: 3,
        rx: 23,
        ry: 19.5,
        faceY: -2,
        squish: 1.05,
        tail: { cx: -18, cy: 8, rx: 7.5, ry: 5.5 },
        path: null as string | null,
      };
    case "pear":
      return {
        cx: 0,
        cy: 4,
        rx: 20,
        ry: 21,
        faceY: -6,
        squish: 0.96,
        tail: { cx: -12, cy: 14, rx: 4, ry: 5 },
        // Narrow top, wide bottom
        path: "M 0 -18 C 12 -18 16 -8 17 2 C 18 12 14 20 0 22 C -14 20 -18 12 -17 2 C -16 -8 -12 -18 0 -18 Z",
      };
    case "bean":
      return {
        cx: 0,
        cy: 2,
        rx: 16,
        ry: 22,
        faceY: -4,
        squish: 0.85,
        tail: { cx: -11, cy: 10, rx: 3.5, ry: 5 },
        path: "M -2 -20 C 10 -22 18 -10 16 4 C 14 16 6 22 -2 20 C -14 18 -18 6 -16 -6 C -14 -16 -10 -18 -2 -20 Z",
      };
    case "squat":
      return {
        cx: 0,
        cy: 5,
        rx: 24,
        ry: 17,
        faceY: 0,
        squish: 1.12,
        tail: { cx: -19, cy: 6, rx: 6, ry: 4.5 },
        path: "M 0 -12 C 16 -14 26 -4 25 6 C 24 14 14 18 0 18 C -14 18 -24 14 -25 6 C -26 -4 -16 -14 0 -12 Z",
      };
    default: // plump
      return {
        cx: 0,
        cy: 2.5,
        rx: 22.5,
        ry: 20,
        faceY: -3,
        squish: 1,
        tail: { cx: -17, cy: 11, rx: 7, ry: 5.5 },
        path: null as string | null,
      };
  }
}

/** Tone mood: color grade, gloss, face spacing — makes same-hue larvae feel different. */
function toneMood(tone: string, seed: number) {
  switch (tone) {
    case "fiery":
      return {
        sat: 78,
        light: 56,
        darkLight: 38,
        gloss: 0.55,
        outline: 0.22,
        eyeGap: 7.4,
        pupilBias: -0.4,
        blush: false,
        wobble: 0,
        accentShift: 18,
      };
    case "chill":
      return {
        sat: 48,
        light: 66,
        darkLight: 50,
        gloss: 0.62,
        outline: 0.08,
        eyeGap: 6.2,
        pupilBias: 0.6,
        blush: true,
        wobble: 0,
        accentShift: -12,
      };
    case "analytical":
      return {
        sat: 52,
        light: 58,
        darkLight: 40,
        gloss: 0.38,
        outline: 0.18,
        eyeGap: 6.8,
        pupilBias: 0,
        blush: false,
        wobble: 0,
        accentShift: 40,
      };
    case "chaotic":
      return {
        sat: 70,
        light: 60,
        darkLight: 42,
        gloss: 0.5,
        outline: 0.15,
        eyeGap: 7.8 + (seed % 3) * 0.4,
        pupilBias: ((seed % 5) - 2) * 0.35,
        blush: seed % 2 === 0,
        wobble: 2 + (seed % 3),
        accentShift: 90 + (seed % 40),
      };
    case "cynical":
      return {
        sat: 36,
        light: 52,
        darkLight: 36,
        gloss: 0.28,
        outline: 0.2,
        eyeGap: 6.4,
        pupilBias: 0.2,
        blush: false,
        wobble: 0,
        accentShift: 160,
      };
    default: // earnest
      return {
        sat: 62,
        light: 62,
        darkLight: 44,
        gloss: 0.48,
        outline: 0.1,
        eyeGap: 6.6,
        pupilBias: 0.15,
        blush: true,
        wobble: 0,
        accentShift: 24,
      };
  }
}

function eyeGeom(eyes: AvatarEyes) {
  switch (eyes) {
    case "sharp":
      return { rx: 4.8, ry: 6.2, pupil: 2.5, brow: -10, lids: false, sparkle: false, squint: 0.85 };
    case "wide":
      return { rx: 6.6, ry: 6.4, pupil: 3.1, brow: -1, lids: false, sparkle: true, squint: 1 };
    case "sleepy":
      return { rx: 5.8, ry: 3.6, pupil: 2.2, brow: 8, lids: true, sparkle: false, squint: 0.7 };
    case "gleam":
      return { rx: 5.6, ry: 5.5, pupil: 2.9, brow: -4, lids: false, sparkle: true, squint: 1 };
    case "beady":
      return { rx: 3.6, ry: 3.8, pupil: 2.1, brow: 2, lids: false, sparkle: false, squint: 1 };
    case "cross":
      return { rx: 5.2, ry: 4.8, pupil: 2.4, brow: -12, lids: false, sparkle: false, squint: 0.92 };
    default: // soft
      return { rx: 5.5, ry: 5.4, pupil: 2.55, brow: 3, lids: false, sparkle: false, squint: 1 };
  }
}

function mouthPath(mouth: AvatarMouth): string {
  switch (mouth) {
    case "flat":
      return "M -4.5 7.8 L 4.5 7.8";
    case "smirk":
      return "M -5 7 Q 1 5.5 5.5 9";
    case "grin":
      return "M -6 5.5 Q 0 12 6 5.5";
    case "frown":
      return "M -5 9 Q 0 5.5 5 9";
    case "o":
      return "M -2.2 7.2 A 2.2 2.4 0 1 0 2.2 7.2 A 2.2 2.4 0 1 0 -2.2 7.2";
    case "smug":
      return "M -5.5 6.5 Q 0 8.5 6 5.5";
    default:
      return "M -5 6.5 Q 0 10 5 6.5";
  }
}

function poseTilt(pose: AvatarPose, seed: number, wobble: number): number {
  const base =
    pose === "lean-left" ? -4 - (seed % 2) : pose === "lean-right" ? 4 + (seed % 2) : 0;
  return base + (wobble ? ((seed % 5) - 2) * 0.6 + wobble * 0.35 : 0);
}

function Antennae({
  style,
  color,
  tipColor,
  faceY,
  kink,
}: {
  style: AvatarAntenna;
  color: string;
  tipColor: string;
  faceY: number;
  kink?: boolean;
}) {
  const baseY = faceY - 15;
  const L = -7;
  const R = 7;
  const kinkOff = kink ? 3 : 0;
  const paths: Record<AvatarAntenna, [string, string]> = {
    curl: [
      `M ${L} ${baseY} Q ${L - 7} ${baseY - 10} ${L - 2 - kinkOff} ${baseY - 14}`,
      `M ${R} ${baseY} Q ${R + 7 + kinkOff} ${baseY - 10} ${R + 2} ${baseY - 14}`,
    ],
    fork: [
      `M ${L} ${baseY} L ${L - 1} ${baseY - 10} M ${L - 1} ${baseY - 6} L ${L - 5} ${baseY - 12} M ${L - 1} ${baseY - 6} L ${L + 3} ${baseY - 12}`,
      `M ${R} ${baseY} L ${R + 1} ${baseY - 10} M ${R + 1} ${baseY - 6} L ${R + 5} ${baseY - 12} M ${R + 1} ${baseY - 6} L ${R - 3} ${baseY - 12}`,
    ],
    droop: [
      `M ${L} ${baseY} Q ${L - 8} ${baseY - 1} ${L - 7 - kinkOff} ${baseY + 5}`,
      `M ${R} ${baseY} Q ${R + 8} ${baseY - 1} ${R + 7} ${baseY + 5}`,
    ],
    bolt: [
      `M ${L} ${baseY} L ${L - 3} ${baseY - 5} L ${L + 1} ${baseY - 6} L ${L - 3 - kinkOff} ${baseY - 13}`,
      `M ${R} ${baseY} L ${R + 3} ${baseY - 5} L ${R - 1} ${baseY - 6} L ${R + 3} ${baseY - 13}`,
    ],
    sway: [
      `M ${L} ${baseY} Q ${L - 8} ${baseY - 6} ${L - 3} ${baseY - 13} Q ${L + 2} ${baseY - 16} ${L - 1 - kinkOff} ${baseY - 17}`,
      `M ${R} ${baseY} Q ${R + 5} ${baseY - 7} ${R + 7} ${baseY - 12} Q ${R + 2} ${baseY - 15} ${R + 5} ${baseY - 17}`,
    ],
  };
  const tips: Record<AvatarAntenna, [[number, number], [number, number]]> = {
    curl: [
      [L - 2 - kinkOff, baseY - 14],
      [R + 2, baseY - 14],
    ],
    fork: [
      [L - 1, baseY - 10],
      [R + 1, baseY - 10],
    ],
    droop: [
      [L - 7 - kinkOff, baseY + 5],
      [R + 7, baseY + 5],
    ],
    bolt: [
      [L - 3 - kinkOff, baseY - 13],
      [R + 3, baseY - 13],
    ],
    sway: [
      [L - 1 - kinkOff, baseY - 17],
      [R + 5, baseY - 17],
    ],
  };
  const [left, right] = paths[style] || paths.curl;
  const [lt, rt] = tips[style] || tips.curl;
  return (
    <g>
      <path d={left} fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d={right} fill="none" stroke={color} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lt[0]} cy={lt[1]} r="1.7" fill={tipColor} />
      <circle cx={rt[0]} cy={rt[1]} r="1.7" fill={tipColor} />
    </g>
  );
}

function PatternOverlay({
  pattern,
  hue,
  accent,
  rx,
  ry,
  cy,
  seed,
  opacity,
}: {
  pattern: AvatarPattern;
  hue: number;
  accent: number;
  rx: number;
  ry: number;
  cy: number;
  seed: number;
  opacity: number;
}) {
  if (pattern === "plain") return null;
  const ink = `hsl(${accent} 55% 38%)`;
  const op = Math.min(0.55, Math.max(0.15, opacity));

  if (pattern === "stripes") {
    const count = 4;
    return (
      <g opacity={op}>
        {Array.from({ length: count }, (_, i) => {
          const y = cy - ry * 0.45 + (i * (ry * 0.9)) / (count - 1);
          return <ellipse key={i} cx="0" cy={y} rx={rx * 0.9} ry={1.6} fill={ink} />;
        })}
      </g>
    );
  }

  if (pattern === "bands") {
    return (
      <g opacity={op}>
        <ellipse cx="0" cy={cy - ry * 0.2} rx={rx * 0.92} ry={ry * 0.2} fill={`hsl(${hue} 45% 40%)`} />
        <ellipse cx="0" cy={cy + ry * 0.28} rx={rx * 0.82} ry={ry * 0.16} fill={`hsl(${hue} 45% 40%)`} />
      </g>
    );
  }

  const spots = [
    { cx: -7, cy: cy - 3, r: 2.6 },
    { cx: 8, cy: cy + 2, r: 2.1 },
    { cx: 2, cy: cy + 9, r: 2.4 },
    { cx: -9, cy: cy + 8, r: 1.7 },
    { cx: 5, cy: cy - 8, r: 1.5 },
  ];
  return (
    <g opacity={op}>
      {spots.map((s, i) => (
        <circle key={i} cx={s.cx + ((seed >> i) % 3) - 1} cy={s.cy} r={s.r} fill={ink} />
      ))}
    </g>
  );
}

function ShellDecor({
  shell,
  rx,
  ry,
  cy,
  color,
}: {
  shell: AvatarShell;
  rx: number;
  ry: number;
  cy: number;
  color: string;
}) {
  if (shell === "smooth") return null;
  if (shell === "ridged") {
    return (
      <g opacity="0.28" fill="none" stroke={color} strokeWidth="1.1">
        <ellipse cx="0" cy={cy - ry * 0.35} rx={rx * 0.78} ry={ry * 0.12} />
        <ellipse cx="0" cy={cy} rx={rx * 0.88} ry={ry * 0.14} />
        <ellipse cx="0" cy={cy + ry * 0.32} rx={rx * 0.72} ry={ry * 0.11} />
      </g>
    );
  }
  if (shell === "spiky") {
    const spikes = [
      [-14, cy - ry * 0.55],
      [-6, cy - ry * 0.85],
      [6, cy - ry * 0.88],
      [14, cy - ry * 0.5],
      [18, cy],
      [-18, cy + 2],
    ];
    return (
      <g opacity="0.55">
        {spikes.map(([x, y], i) => (
          <path
            key={i}
            d={`M ${x} ${y} L ${x + (i % 2 ? 2.5 : -2.5)} ${y - 5.5} L ${x + (i % 2 ? -1.5 : 1.5)} ${y + 1} Z`}
            fill={color}
          />
        ))}
      </g>
    );
  }
  // fluffy
  return (
    <g opacity="0.35">
      {[
        [-16, cy - 4, 4.2],
        [16, cy - 2, 4],
        [-12, cy + 10, 3.6],
        [12, cy + 11, 3.8],
        [0, cy - ry * 0.7, 3.2],
      ].map(([cx, fy, r], i) => (
        <circle key={i} cx={cx} cy={fy} r={r} fill={color} />
      ))}
    </g>
  );
}

function SignatureMark({
  mark,
  faceY,
  dark,
  hue,
}: {
  mark: AvatarMark;
  faceY: number;
  dark: string;
  hue: number;
}) {
  if (mark === "none") return null;
  if (mark === "scar") {
    return (
      <line
        x1={6}
        y1={faceY - 2}
        x2={11}
        y2={faceY + 5}
        stroke={dark}
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.55"
      />
    );
  }
  if (mark === "freckles") {
    return (
      <g opacity="0.4" fill={dark}>
        <circle cx={-9} cy={faceY + 4} r="1.1" />
        <circle cx={-6} cy={faceY + 7} r="0.85" />
        <circle cx={8} cy={faceY + 5} r="1" />
        <circle cx={10} cy={faceY + 8} r="0.7" />
      </g>
    );
  }
  if (mark === "notch") {
    return (
      <path
        d={`M ${-18} ${faceY + 2} L ${-21} ${faceY - 1} L ${-16} ${faceY - 2}`}
        fill="none"
        stroke={dark}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.5"
      />
    );
  }
  if (mark === "blush-heavy") {
    return (
      <g opacity="0.55">
        <ellipse cx={-10} cy={faceY + 6} rx="4.2" ry="2.4" fill={`hsl(${hue} 75% 68%)`} />
        <ellipse cx={10} cy={faceY + 6} rx="4.2" ry="2.4" fill={`hsl(${hue} 75% 68%)`} />
      </g>
    );
  }
  // stripe
  return (
    <ellipse
      cx="0"
      cy={faceY + 14}
      rx="10"
      ry="2.2"
      fill={dark}
      opacity="0.28"
    />
  );
}

function Accessory({
  kind,
  accent,
  faceY,
  rx,
}: {
  kind: AvatarAccessory;
  accent: number;
  faceY: number;
  rx: number;
}) {
  const a = `hsl(${accent} 68% 50%)`;
  const aDark = `hsl(${accent} 62% 34%)`;
  if (kind === "none") return null;

  if (kind === "monocle") {
    return (
      <g>
        <circle cx="7.5" cy={faceY} r="4.2" fill="none" stroke={aDark} strokeWidth="1.5" />
        <line x1="11.5" y1={faceY + 2} x2="14" y2={faceY + 9} stroke={aDark} strokeWidth="1.2" />
      </g>
    );
  }
  if (kind === "bowtie") {
    return (
      <g transform={`translate(0 ${faceY + 17})`}>
        <path d="M -6.5 0 L -1.2 -2.6 L -1.2 2.6 Z" fill={a} />
        <path d="M 6.5 0 L 1.2 -2.6 L 1.2 2.6 Z" fill={a} />
        <circle cx="0" cy="0" r="1.4" fill={aDark} />
      </g>
    );
  }
  if (kind === "cap") {
    const y = faceY - 15;
    return (
      <g>
        <ellipse cx="0" cy={y + 2.5} rx={11.5} ry="3.6" fill={aDark} />
        <path d={`M -9 ${y + 2.5} Q 0 ${y - 8} 9 ${y + 2.5}`} fill={a} />
      </g>
    );
  }
  if (kind === "horns") {
    const y = faceY - 13;
    return (
      <g>
        <path
          d={`M -8 ${y} Q -13 ${y - 8} -10 ${y - 13}`}
          fill="none"
          stroke={aDark}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d={`M 8 ${y} Q 13 ${y - 8} 10 ${y - 13}`}
          fill="none"
          stroke={aDark}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (kind === "flower") {
    const cx = rx * 0.58;
    const cy = faceY - 3;
    return (
      <g>
        {[0, 72, 144, 216, 288].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <circle
              key={deg}
              cx={cx + Math.cos(rad) * 2.8}
              cy={cy + Math.sin(rad) * 2.8}
              r="1.9"
              fill={a}
            />
          );
        })}
        <circle cx={cx} cy={cy} r="1.4" fill={`hsl(${(accent + 40) % 360} 75% 62%)`} />
      </g>
    );
  }
  if (kind === "badge") {
    return (
      <g transform={`translate(${rx * 0.5} ${faceY + 13})`}>
        <circle r="4" fill={a} stroke={aDark} strokeWidth="1" />
        <circle r="1.7" fill="#fff" opacity="0.9" />
      </g>
    );
  }
  if (kind === "scarf") {
    return (
      <g>
        <path
          d={`M -15 ${faceY + 15} Q 0 ${faceY + 20} 15 ${faceY + 15}`}
          fill="none"
          stroke={a}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d={`M 4 ${faceY + 17} Q 8 ${faceY + 25} 6 ${faceY + 28}`}
          fill="none"
          stroke={aDark}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (kind === "goggles") {
    return (
      <g>
        <circle cx="-6.5" cy={faceY} r="5.2" fill="rgba(255,255,255,0.15)" stroke={aDark} strokeWidth="1.6" />
        <circle cx="6.5" cy={faceY} r="5.2" fill="rgba(255,255,255,0.15)" stroke={aDark} strokeWidth="1.6" />
        <line x1="-1.2" y1={faceY} x2="1.2" y2={faceY} stroke={aDark} strokeWidth="1.4" />
        <line x1="-11.7" y1={faceY} x2={-rx + 3} y2={faceY} stroke={a} strokeWidth="1.3" />
        <line x1="11.7" y1={faceY} x2={rx - 3} y2={faceY} stroke={a} strokeWidth="1.3" />
      </g>
    );
  }
  if (kind === "crown") {
    const y = faceY - 16;
    return (
      <g>
        <path
          d={`M -7.5 ${y + 2.5} L -5.5 ${y - 6} L -2.5 ${y} L 0 ${y - 8} L 2.5 ${y} L 5.5 ${y - 6} L 7.5 ${y + 2.5} Z`}
          fill={a}
          stroke={aDark}
          strokeWidth="0.8"
        />
        <circle cx="0" cy={y - 8} r="1.2" fill={`hsl(${(accent + 50) % 360} 80% 60%)`} />
      </g>
    );
  }
  if (kind === "clipboard") {
    return (
      <g transform={`translate(${rx * 0.58} ${faceY + 5})`}>
        <rect x="-3.5" y="-5.5" width="8" height="11" rx="1.1" fill={a} stroke={aDark} strokeWidth="0.9" />
        <rect x="-1.8" y="-7" width="4.5" height="2.2" rx="0.5" fill={aDark} />
        <line x1="-1.6" y1="-1.5" x2="2.8" y2="-1.5" stroke="#fff" strokeWidth="1" opacity="0.85" />
        <line x1="-1.6" y1="1.2" x2="2.2" y2="1.2" stroke="#fff" strokeWidth="1" opacity="0.7" />
      </g>
    );
  }
  if (kind === "leaf") {
    return (
      <g transform={`translate(${rx * 0.52} ${faceY - 11}) rotate(28)`}>
        <ellipse cx="0" cy="0" rx="2.8" ry="5.2" fill={a} />
        <line x1="0" y1="4" x2="0" y2="-4" stroke={aDark} strokeWidth="0.9" />
      </g>
    );
  }
  if (kind === "patch") {
    return (
      <g>
        <circle cx="-6.5" cy={faceY} r="5" fill={aDark} opacity="0.85" />
        <line x1="-11" y1={faceY - 1} x2={-rx + 2} y2={faceY - 4} stroke={a} strokeWidth="1.1" />
        <line x1="-11" y1={faceY + 1} x2={-rx + 2} y2={faceY + 4} stroke={a} strokeWidth="1.1" />
      </g>
    );
  }
  if (kind === "spike") {
    return (
      <g>
        <path
          d={`M 0 ${faceY - 16} L 3 ${faceY - 26} L -3 ${faceY - 26} Z`}
          fill={aDark}
        />
        <path
          d={`M -10 ${faceY - 12} L -14 ${faceY - 20} L -7 ${faceY - 14} Z`}
          fill={a}
        />
        <path
          d={`M 10 ${faceY - 12} L 14 ${faceY - 20} L 7 ${faceY - 14} Z`}
          fill={a}
        />
      </g>
    );
  }
  if (kind === "leaf-crown") {
    const y = faceY - 15;
    return (
      <g>
        {[-8, -3, 3, 8].map((x, i) => (
          <ellipse
            key={i}
            cx={x}
            cy={y - (i % 2) * 2}
            rx="2.4"
            ry="4.5"
            fill={a}
            transform={`rotate(${x * 4} ${x} ${y})`}
          />
        ))}
      </g>
    );
  }
  if (kind === "straw-hat") {
    // Luffy-scale: oversized flat brim, short fat crown, thick red ribbon.
    const y = faceY - 11;
    const straw = "#E8C547";
    const strawMid = "#D4B03A";
    const strawDeep = "#C9A227";
    const strawEdge = "#8B6914";
    const ribbon = "#C41E3A";
    const ribbonDark = "#9B1530";
    return (
      <g>
        {/* Under-brim shadow on the head */}
        <ellipse cx="0" cy={y + 6.5} rx="14" ry="2.4" fill="#000" opacity="0.12" />
        {/* Huge brim — the Luffy silhouette cue */}
        <ellipse
          cx="0"
          cy={y + 4.8}
          rx="22"
          ry="5.6"
          fill={strawDeep}
          stroke={strawEdge}
          strokeWidth="1.1"
        />
        <ellipse cx="0" cy={y + 3.9} rx="21" ry="4.8" fill={straw} />
        <ellipse cx="0" cy={y + 2.8} rx="13" ry="2.4" fill={strawMid} opacity="0.4" />
        {/* Straw weave ticks on brim */}
        {[-14, -7, 0, 7, 14].map((x) => (
          <line
            key={x}
            x1={x}
            y1={y + 2.2}
            x2={x * 0.92}
            y2={y + 6.2}
            stroke={strawEdge}
            strokeWidth="0.55"
            opacity="0.35"
          />
        ))}
        {/* Short fat crown */}
        <path
          d={`M -11 ${y + 2.4} L -10.2 ${y - 8.5} Q 0 ${y - 12.5} 10.2 ${y - 8.5} L 11 ${y + 2.4} Z`}
          fill={straw}
          stroke={strawEdge}
          strokeWidth="1"
        />
        <path
          d={`M -9 ${y - 2} Q 0 ${y - 5} 9 ${y - 2}`}
          fill="none"
          stroke={strawDeep}
          strokeWidth="0.85"
          opacity="0.5"
        />
        {/* Thick red ribbon around crown base */}
        <path
          d={`M -11.2 ${y + 0.2} Q 0 ${y + 2.8} 11.2 ${y + 0.2}`}
          fill="none"
          stroke={ribbon}
          strokeWidth="3.8"
          strokeLinecap="round"
        />
        <path
          d={`M -10.5 ${y + 0.5} Q 0 ${y + 2.5} 10.5 ${y + 0.5}`}
          fill="none"
          stroke={ribbonDark}
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.45"
        />
        {/* Ribbon tails dangling off the side */}
        <path
          d={`M 9.5 ${y + 1.2} Q 16 ${y + 3.5} 14.5 ${y + 10}`}
          fill="none"
          stroke={ribbon}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d={`M 10 ${y + 1.6} Q 14 ${y + 5.5} 12.2 ${y + 9.2}`}
          fill="none"
          stroke={ribbon}
          strokeWidth="2.1"
          strokeLinecap="round"
          opacity="0.9"
        />
      </g>
    );
  }
  return null;
}

function Eye({
  cx,
  cy,
  geom,
  pupilBias,
  scale = 1,
  browBoost = 0,
}: {
  cx: number;
  cy: number;
  geom: ReturnType<typeof eyeGeom>;
  pupilBias: number;
  scale?: number;
  browBoost?: number;
}) {
  const rx = geom.rx * geom.squint * scale;
  const ry = geom.ry * scale;
  const brow = geom.brow + browBoost;
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fffef8" />
      <ellipse
        cx={cx}
        cy={cy}
        rx={rx}
        ry={ry}
        fill="none"
        stroke="rgba(40,30,25,0.14)"
        strokeWidth="0.65"
      />
      <circle cx={cx + 0.35 + pupilBias} cy={cy + 0.35} r={geom.pupil * scale} fill="#1c1410" />
      <circle
        cx={cx + geom.pupil * 0.35 + pupilBias * 0.5}
        cy={cy - geom.pupil * 0.4}
        r={geom.pupil * 0.34 * scale}
        fill="#fff"
      />
      {geom.lids && (
        <path
          d={`M ${cx - rx * 0.95} ${cy - 0.5} Q ${cx} ${cy - ry * 0.75} ${cx + rx * 0.95} ${cy - 0.5}`}
          fill="none"
          stroke="#1c1410"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      )}
      {geom.sparkle && (
        <circle cx={cx + rx * 0.72} cy={cy - ry * 0.9} r="0.85" fill="rgba(255,255,255,0.95)" />
      )}
      <line
        x1={cx - rx * 0.8}
        y1={cy - ry - 1.8}
        x2={cx + rx * 0.4}
        y2={cy - ry - 1.4}
        stroke="#1c1410"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.6"
        transform={`rotate(${brow * 0.4} ${cx} ${cy - ry})`}
      />
    </g>
  );
}

function BodyShape({
  geom,
  fill,
  stroke,
  strokeWidth,
}: {
  geom: ReturnType<typeof bodyGeom>;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  if (geom.path) {
    return (
      <path
        d={geom.path}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeOpacity="0.35"
        transform={`translate(0 ${geom.cy * 0.15})`}
      />
    );
  }
  return (
    <ellipse
      cx={geom.cx}
      cy={geom.cy}
      rx={geom.rx}
      ry={geom.ry}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeOpacity="0.35"
    />
  );
}

export default function LarvaAvatar({
  hue,
  tone,
  size = 96,
  wallet,
  traits,
  label,
  moral,
  quirks,
  conviction,
  talking = false,
}: Props) {
  const t = deriveLarvatarTraits({
    hue,
    tone,
    wallet,
    partial: { hue, tone, ...(traits || {}) },
  });
  // Flywheel sails with Luffy energy — forced One Piece straw hat.
  const flywheelWallet = "0x36af040970cbb787011e2764b30c4e3f77ef4901";
  const isFlywheel =
    label?.trim().toLowerCase() === "flywheel" ||
    wallet?.trim().toLowerCase() === flywheelWallet;
  const accessory: AvatarAccessory = isFlywheel ? "straw-hat" : t.accessory;
  const recipe: LarvaLookRecipe = larvaLookRecipe({
    body: t.body,
    wallet,
    quirks,
    moral,
    conviction,
  });
  const aria = label || `larvatar, ${t.tone}, ${recipe.displayBody}, ${accessory}`;

  // Fixed size×size box — PNG and SVG share the same footprint so cards never jump.
  if (t.portraitUrl) {
    return (
      <span
        className={talking ? "larva-talking" : undefined}
        style={{
          display: "inline-block",
          width: size,
          height: size,
          overflow: "hidden",
          flexShrink: 0,
          lineHeight: 0,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.portraitUrl}
          alt={aria}
          width={size}
          height={size}
          style={{
            width: size,
            height: size,
            objectFit: "contain",
            display: "block",
          }}
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  }

  const seed = walletSeed(wallet || `${t.hue}-${t.tone}`);
  const geom = bodyGeom(recipe.displayBody);
  const eyes = eyeGeom(t.eyes);
  const mood = toneMood(t.tone, seed);
  const mouth = mouthPath(t.mouth);
  const tilt = poseTilt(t.pose, seed, mood.wobble + recipe.wobble);

  const accentHue = (t.accent + mood.accentShift + 360) % 360;
  const gid = `larva-${t.hue}-${recipe.displayBody}-${t.eyes}-${accessory}-${seed.toString(36)}`;
  const bodyGradId = `${gid}-body`;
  const bellyGradId = `${gid}-belly`;

  const sat = Math.max(18, Math.min(90, mood.sat + recipe.satShift));
  const light = Math.max(36, Math.min(78, mood.light + recipe.lightShift));
  const mid = `hsl(${t.hue} ${sat}% ${light}%)`;
  const dark = `hsl(${t.hue} ${Math.max(sat - 8, 20)}% ${mood.darkLight}%)`;
  const lightC = `hsl(${t.hue} ${Math.min(sat + 8, 85)}% ${Math.min(light + 14, 78)}%)`;
  const antennaColor = `hsl(${t.hue} ${sat - 10}% ${mood.darkLight - 4}%)`;
  const tipColor = `hsl(${accentHue} 70% 48%)`;
  const bg = `hsl(${t.hue} 26% 96%)`;
  const ring = recipe.halo
    ? `hsl(${recipe.haloWarm ? (t.hue + 30) % 360 : (t.hue + 200) % 360} 55% ${recipe.haloWarm ? 72 : 55}%)`
    : `hsl(${accentHue} 30% 78%)`;
  const showCheeks = t.cheeks || mood.blush || recipe.mark === "blush-heavy";
  const gloss = Math.max(0.12, Math.min(0.75, mood.gloss + recipe.glossBoost));
  const outline = mood.outline + recipe.outlineBoost * 0.15;

  const highlightX = -5 - (seed % 5);
  const freckle = seed % 3 === 0;
  const asymmetry = t.tone === "chaotic" ? ((seed % 5) - 2) * 0.5 : 0;
  const leftScale = 1 + recipe.eyeAsymmetry * 0.5;
  const rightScale = 1 - recipe.eyeAsymmetry * 0.5;

  return (
    <span
      className={talking ? "larva-talking" : undefined}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flexShrink: 0,
        lineHeight: 0,
      }}
    >
    <svg
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={aria}
    >
      <defs>
        <radialGradient id={bodyGradId} cx="32%" cy="28%" r="72%">
          <stop offset="0%" stopColor={lightC} />
          <stop offset="48%" stopColor={mid} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
        <radialGradient id={bellyGradId} cx="50%" cy="40%" r="62%">
          <stop offset="0%" stopColor={`hsl(${accentHue} 50% 80%)`} stopOpacity="0.9" />
          <stop offset="100%" stopColor={`hsl(${accentHue} 40% 68%)`} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle
        r="47"
        fill={bg}
        stroke={ring}
        strokeWidth={recipe.halo ? 2.4 : 1.5}
        opacity={recipe.halo ? 0.95 : 1}
      />
      {recipe.halo && (
        <circle r="44" fill="none" stroke={ring} strokeWidth="1" opacity="0.45" />
      )}
      <ellipse cx="0" cy="36" rx="18" ry="4.5" fill={`hsl(${t.hue} 18% 50%)`} opacity="0.22" />

      <g transform={`rotate(${tilt}) scale(${geom.squish} 1)`}>
        <ellipse
          cx={geom.tail.cx}
          cy={geom.tail.cy}
          rx={geom.tail.rx}
          ry={geom.tail.ry}
          fill={`url(#${bodyGradId})`}
        />

        <BodyShape
          geom={geom}
          fill={`url(#${bodyGradId})`}
          stroke={dark}
          strokeWidth={outline}
        />

        <ShellDecor shell={recipe.shell} rx={geom.rx} ry={geom.ry} cy={geom.cy} color={dark} />

        <PatternOverlay
          pattern={t.pattern}
          hue={t.hue}
          accent={accentHue}
          rx={geom.rx}
          ry={geom.ry}
          cy={geom.cy}
          seed={seed}
          opacity={recipe.patternOpacity}
        />

        <ellipse
          cx={0}
          cy={geom.cy + 4}
          rx={geom.rx * 0.55}
          ry={geom.ry * 0.45}
          fill={`url(#${bellyGradId})`}
        />

        {Array.from({ length: recipe.bellyStripes }, (_, i) => (
          <ellipse
            key={i}
            cx={0}
            cy={geom.cy + 2 + i * 3.2}
            rx={geom.rx * (0.42 - i * 0.04)}
            ry={1.1}
            fill={dark}
            opacity={0.12 + i * 0.03}
          />
        ))}

        <ellipse
          cx={highlightX}
          cy={geom.cy - geom.ry * 0.38}
          rx={geom.rx * 0.4}
          ry={geom.ry * 0.22}
          fill="#fff"
          opacity={gloss}
        />
        <ellipse
          cx={highlightX - 3}
          cy={geom.cy - geom.ry * 0.12}
          rx={geom.rx * 0.14}
          ry={geom.ry * 0.1}
          fill="#fff"
          opacity={gloss * 0.7}
        />

        {(freckle || recipe.mark === "freckles") && recipe.mark !== "scar" && (
          <g opacity="0.28">
            <circle cx={-8} cy={geom.cy + 2} r="1.1" fill={dark} />
            <circle cx={-5} cy={geom.cy + 6} r="0.8" fill={dark} />
            <circle cx={9} cy={geom.cy + 4} r="0.9" fill={dark} />
          </g>
        )}

        <Antennae
          style={t.antenna}
          color={antennaColor}
          tipColor={tipColor}
          faceY={geom.faceY}
          kink={recipe.antennaKink}
        />

        <Accessory kind={accessory} accent={accentHue} faceY={geom.faceY} rx={geom.rx} />

        <SignatureMark mark={recipe.mark} faceY={geom.faceY} dark={dark} hue={t.hue} />

        <g transform={`translate(${asymmetry} ${geom.faceY})`}>
          {showCheeks && recipe.mark !== "blush-heavy" && (
            <>
              <ellipse cx={-mood.eyeGap - 4} cy="5.5" rx="3.4" ry="2.1" fill={`hsl(${t.hue} 75% 68%)`} opacity="0.5" />
              <ellipse cx={mood.eyeGap + 4} cy="5.5" rx="3.4" ry="2.1" fill={`hsl(${t.hue} 75% 68%)`} opacity="0.5" />
            </>
          )}
          <Eye
            cx={-mood.eyeGap}
            cy={0}
            geom={eyes}
            pupilBias={mood.pupilBias}
            scale={leftScale}
            browBoost={recipe.browBoost}
          />
          <Eye
            cx={mood.eyeGap}
            cy={0}
            geom={eyes}
            pupilBias={mood.pupilBias}
            scale={rightScale}
            browBoost={recipe.browBoost}
          />
          <path
            d={mouth}
            fill={t.mouth === "o" ? "none" : "none"}
            stroke="#2a2018"
            strokeWidth="1.55"
            strokeLinecap="round"
            opacity="0.88"
          />
        </g>
      </g>
    </svg>
    </span>
  );
}
