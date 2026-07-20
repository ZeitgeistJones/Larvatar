import {
  deriveLarvatarTraits,
  walletSeed,
  type LarvatarTraits,
  type AvatarAccessory,
  type AvatarAntenna,
  type AvatarBody,
  type AvatarEyes,
  type AvatarMouth,
  type AvatarPattern,
  type AvatarPose,
} from "@/lib/avatar";

type Props = {
  hue: number;
  tone: string;
  size?: number;
  wallet?: string;
  traits?: Partial<LarvatarTraits> | null;
  label?: string;
};

/** Size-locked gumdrop, but each body reads as a different silhouette. */
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
    default:
      return "M -5 6.5 Q 0 10 5 6.5";
  }
}

function poseTilt(pose: AvatarPose, seed: number, wobble: number): number {
  const base =
    pose === "lean-left" ? -4 - (seed % 2) : pose === "lean-right" ? 4 + (seed % 2) : 0;
  return base + (wobble ? ((seed % 5) - 2) * 0.6 : 0);
}

function Antennae({
  style,
  color,
  tipColor,
  faceY,
}: {
  style: AvatarAntenna;
  color: string;
  tipColor: string;
  faceY: number;
}) {
  const baseY = faceY - 15;
  const L = -7;
  const R = 7;
  const paths: Record<AvatarAntenna, [string, string]> = {
    curl: [
      `M ${L} ${baseY} Q ${L - 7} ${baseY - 10} ${L - 2} ${baseY - 14}`,
      `M ${R} ${baseY} Q ${R + 7} ${baseY - 10} ${R + 2} ${baseY - 14}`,
    ],
    fork: [
      `M ${L} ${baseY} L ${L - 1} ${baseY - 10} M ${L - 1} ${baseY - 6} L ${L - 5} ${baseY - 12} M ${L - 1} ${baseY - 6} L ${L + 3} ${baseY - 12}`,
      `M ${R} ${baseY} L ${R + 1} ${baseY - 10} M ${R + 1} ${baseY - 6} L ${R + 5} ${baseY - 12} M ${R + 1} ${baseY - 6} L ${R - 3} ${baseY - 12}`,
    ],
    droop: [
      `M ${L} ${baseY} Q ${L - 8} ${baseY - 1} ${L - 7} ${baseY + 5}`,
      `M ${R} ${baseY} Q ${R + 8} ${baseY - 1} ${R + 7} ${baseY + 5}`,
    ],
    bolt: [
      `M ${L} ${baseY} L ${L - 3} ${baseY - 5} L ${L + 1} ${baseY - 6} L ${L - 3} ${baseY - 13}`,
      `M ${R} ${baseY} L ${R + 3} ${baseY - 5} L ${R - 1} ${baseY - 6} L ${R + 3} ${baseY - 13}`,
    ],
    sway: [
      `M ${L} ${baseY} Q ${L - 8} ${baseY - 6} ${L - 3} ${baseY - 13} Q ${L + 2} ${baseY - 16} ${L - 1} ${baseY - 17}`,
      `M ${R} ${baseY} Q ${R + 5} ${baseY - 7} ${R + 7} ${baseY - 12} Q ${R + 2} ${baseY - 15} ${R + 5} ${baseY - 17}`,
    ],
  };
  const tips: Record<AvatarAntenna, [[number, number], [number, number]]> = {
    curl: [
      [L - 2, baseY - 14],
      [R + 2, baseY - 14],
    ],
    fork: [
      [L - 1, baseY - 10],
      [R + 1, baseY - 10],
    ],
    droop: [
      [L - 7, baseY + 5],
      [R + 7, baseY + 5],
    ],
    bolt: [
      [L - 3, baseY - 13],
      [R + 3, baseY - 13],
    ],
    sway: [
      [L - 1, baseY - 17],
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
}: {
  pattern: AvatarPattern;
  hue: number;
  accent: number;
  rx: number;
  ry: number;
  cy: number;
  seed: number;
}) {
  if (pattern === "plain") return null;
  const ink = `hsl(${accent} 55% 38%)`;

  if (pattern === "stripes") {
    const count = 4;
    return (
      <g opacity="0.32">
        {Array.from({ length: count }, (_, i) => {
          const y = cy - ry * 0.45 + (i * (ry * 0.9)) / (count - 1);
          return <ellipse key={i} cx="0" cy={y} rx={rx * 0.9} ry={1.6} fill={ink} />;
        })}
      </g>
    );
  }

  if (pattern === "bands") {
    return (
      <g opacity="0.34">
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
    <g opacity="0.36">
      {spots.map((s, i) => (
        <circle key={i} cx={s.cx + ((seed >> i) % 3) - 1} cy={s.cy} r={s.r} fill={ink} />
      ))}
    </g>
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
  return null;
}

function Eye({
  cx,
  cy,
  geom,
  pupilBias,
}: {
  cx: number;
  cy: number;
  geom: ReturnType<typeof eyeGeom>;
  pupilBias: number;
}) {
  const rx = geom.rx * geom.squint;
  const ry = geom.ry;
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
      <circle cx={cx + 0.35 + pupilBias} cy={cy + 0.35} r={geom.pupil} fill="#1c1410" />
      <circle
        cx={cx + geom.pupil * 0.35 + pupilBias * 0.5}
        cy={cy - geom.pupil * 0.4}
        r={geom.pupil * 0.34}
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
        transform={`rotate(${geom.brow * 0.4} ${cx} ${cy - ry})`}
      />
    </g>
  );
}

export default function LarvaAvatar({
  hue,
  tone,
  size = 96,
  wallet,
  traits,
  label,
}: Props) {
  const t = deriveLarvatarTraits({
    hue,
    tone,
    wallet,
    partial: { hue, tone, ...(traits || {}) },
  });
  const seed = walletSeed(wallet || `${t.hue}-${t.tone}`);
  const geom = bodyGeom(t.body);
  const eyes = eyeGeom(t.eyes);
  const mood = toneMood(t.tone, seed);
  const mouth = mouthPath(t.mouth);
  const tilt = poseTilt(t.pose, seed, mood.wobble);

  const accentHue = (t.accent + mood.accentShift + 360) % 360;
  const gid = `larva-${t.hue}-${t.body}-${t.eyes}-${t.accessory}-${seed.toString(36)}`;
  const bodyGradId = `${gid}-body`;
  const bellyGradId = `${gid}-belly`;

  const mid = `hsl(${t.hue} ${mood.sat}% ${mood.light}%)`;
  const dark = `hsl(${t.hue} ${Math.max(mood.sat - 8, 20)}% ${mood.darkLight}%)`;
  const light = `hsl(${t.hue} ${Math.min(mood.sat + 8, 85)}% ${Math.min(mood.light + 14, 78)}%)`;
  const antennaColor = `hsl(${t.hue} ${mood.sat - 10}% ${mood.darkLight - 4}%)`;
  const tipColor = `hsl(${accentHue} 70% 48%)`;
  const bg = `hsl(${t.hue} 26% 96%)`;
  const ring = `hsl(${accentHue} 30% 78%)`;
  const showCheeks = t.cheeks || mood.blush;

  // Seeded micro-variance so wallet twins with same tone still diverge
  const highlightX = -5 - (seed % 5);
  const freckle = seed % 3 === 0;
  const asymmetry = t.tone === "chaotic" ? ((seed % 5) - 2) * 0.5 : 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label || `larvatar, ${t.tone}, ${t.body}, ${t.accessory}`}
    >
      <defs>
        <radialGradient id={bodyGradId} cx="32%" cy="28%" r="72%">
          <stop offset="0%" stopColor={light} />
          <stop offset="48%" stopColor={mid} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
        <radialGradient id={bellyGradId} cx="50%" cy="40%" r="62%">
          <stop offset="0%" stopColor={`hsl(${accentHue} 50% 80%)`} stopOpacity="0.9" />
          <stop offset="100%" stopColor={`hsl(${accentHue} 40% 68%)`} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle r="47" fill={bg} stroke={ring} strokeWidth="1.5" />
      <ellipse cx="0" cy="36" rx="18" ry="4.5" fill={`hsl(${t.hue} 18% 50%)`} opacity="0.22" />

      <g transform={`rotate(${tilt}) scale(${geom.squish} 1)`}>
        <ellipse
          cx={geom.tail.cx}
          cy={geom.tail.cy}
          rx={geom.tail.rx}
          ry={geom.tail.ry}
          fill={`url(#${bodyGradId})`}
        />

        <ellipse
          cx={geom.cx}
          cy={geom.cy}
          rx={geom.rx}
          ry={geom.ry}
          fill={`url(#${bodyGradId})`}
          stroke={dark}
          strokeWidth={mood.outline}
          strokeOpacity="0.35"
        />

        <PatternOverlay
          pattern={t.pattern}
          hue={t.hue}
          accent={accentHue}
          rx={geom.rx}
          ry={geom.ry}
          cy={geom.cy}
          seed={seed}
        />

        <ellipse
          cx={0}
          cy={geom.cy + 4}
          rx={geom.rx * 0.55}
          ry={geom.ry * 0.45}
          fill={`url(#${bellyGradId})`}
        />

        {/* gloss — intensity from tone */}
        <ellipse
          cx={highlightX}
          cy={geom.cy - geom.ry * 0.38}
          rx={geom.rx * 0.4}
          ry={geom.ry * 0.22}
          fill="#fff"
          opacity={mood.gloss}
        />
        <ellipse
          cx={highlightX - 3}
          cy={geom.cy - geom.ry * 0.12}
          rx={geom.rx * 0.14}
          ry={geom.ry * 0.1}
          fill="#fff"
          opacity={mood.gloss * 0.7}
        />

        {freckle && (
          <g opacity="0.28">
            <circle cx={-8} cy={geom.cy + 2} r="1.1" fill={dark} />
            <circle cx={-5} cy={geom.cy + 6} r="0.8" fill={dark} />
            <circle cx={9} cy={geom.cy + 4} r="0.9" fill={dark} />
          </g>
        )}

        <Antennae style={t.antenna} color={antennaColor} tipColor={tipColor} faceY={geom.faceY} />

        <Accessory kind={t.accessory} accent={accentHue} faceY={geom.faceY} rx={geom.rx} />

        <g transform={`translate(${asymmetry} ${geom.faceY})`}>
          {showCheeks && (
            <>
              <ellipse cx={-mood.eyeGap - 4} cy="5.5" rx="3.4" ry="2.1" fill={`hsl(${t.hue} 75% 68%)`} opacity="0.5" />
              <ellipse cx={mood.eyeGap + 4} cy="5.5" rx="3.4" ry="2.1" fill={`hsl(${t.hue} 75% 68%)`} opacity="0.5" />
            </>
          )}
          <Eye cx={-mood.eyeGap} cy={0} geom={eyes} pupilBias={mood.pupilBias} />
          <Eye cx={mood.eyeGap} cy={0} geom={eyes} pupilBias={mood.pupilBias} />
          <path
            d={mouth}
            fill="none"
            stroke="#2a2018"
            strokeWidth="1.55"
            strokeLinecap="round"
            opacity="0.88"
          />
        </g>
      </g>
    </svg>
  );
}
