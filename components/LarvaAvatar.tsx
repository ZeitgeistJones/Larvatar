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

/** Shared gumdrop footprint — all body variants stay inside this band. */
function bodyGeom(body: AvatarBody) {
  // Baseline: ~rx 22, ry 20, centered so silhouette fills the circle evenly
  switch (body) {
    case "slim":
      return { cx: 0, cy: 2, rx: 19.5, ry: 20, faceY: -4, tail: { cx: -16, cy: 10, rx: 6, ry: 5 } };
    case "tall":
      return { cx: 0, cy: 1, rx: 20, ry: 22, faceY: -5, tail: { cx: -15, cy: 12, rx: 5.5, ry: 5 } };
    case "round":
      return { cx: 0, cy: 2, rx: 21.5, ry: 20.5, faceY: -3, tail: { cx: -17, cy: 9, rx: 6.5, ry: 5.5 } };
    default: // plump
      return { cx: 0, cy: 2, rx: 22.5, ry: 20, faceY: -3.5, tail: { cx: -17.5, cy: 10, rx: 7, ry: 5.5 } };
  }
}

function eyeGeom(eyes: AvatarEyes) {
  // Large white-sclera eyes (reference aesthetic); traits tweak shape within a tight size band
  switch (eyes) {
    case "sharp":
      return { rx: 5.2, ry: 5.8, pupil: 2.7, brow: -8, lids: false, sparkle: false };
    case "wide":
      return { rx: 6.2, ry: 6.0, pupil: 2.9, brow: -2, lids: false, sparkle: true };
    case "sleepy":
      return { rx: 5.6, ry: 4.2, pupil: 2.4, brow: 6, lids: true, sparkle: false };
    case "gleam":
      return { rx: 5.8, ry: 5.6, pupil: 2.8, brow: -3, lids: false, sparkle: true };
    default: // soft
      return { rx: 5.6, ry: 5.5, pupil: 2.6, brow: 2, lids: false, sparkle: false };
  }
}

function mouthPath(mouth: AvatarMouth): string {
  switch (mouth) {
    case "flat":
      return "M -4.5 7.5 L 4.5 7.5";
    case "smirk":
      return "M -4.5 7.2 Q 0 6.5 4.5 8.5";
    case "grin":
      return "M -5 6.2 Q 0 10.5 5 6.2";
    case "frown":
      return "M -4.5 8.5 Q 0 6.2 4.5 8.5";
    default: // smile
      return "M -4.5 6.8 Q 0 9.5 4.5 6.8";
  }
}

function poseTilt(pose: AvatarPose, seed: number): number {
  if (pose === "lean-left") return -3 - (seed % 2);
  if (pose === "lean-right") return 3 + (seed % 2);
  return 0;
}

function Antennae({
  style,
  color,
  faceY,
}: {
  style: AvatarAntenna;
  color: string;
  faceY: number;
}) {
  // Short stubs — stay inside the circle, don't dominate the blob
  const baseY = faceY - 16;
  const L = -6;
  const R = 6;
  const paths: Record<AvatarAntenna, [string, string]> = {
    curl: [
      `M ${L} ${baseY} Q ${L - 5} ${baseY - 8} ${L - 1} ${baseY - 11}`,
      `M ${R} ${baseY} Q ${R + 5} ${baseY - 8} ${R + 1} ${baseY - 11}`,
    ],
    fork: [
      `M ${L} ${baseY} L ${L - 1} ${baseY - 8} M ${L - 1} ${baseY - 5} L ${L - 4} ${baseY - 9} M ${L - 1} ${baseY - 5} L ${L + 2} ${baseY - 9}`,
      `M ${R} ${baseY} L ${R + 1} ${baseY - 8} M ${R + 1} ${baseY - 5} L ${R + 4} ${baseY - 9} M ${R + 1} ${baseY - 5} L ${R - 2} ${baseY - 9}`,
    ],
    droop: [
      `M ${L} ${baseY} Q ${L - 6} ${baseY - 2} ${L - 5} ${baseY + 3}`,
      `M ${R} ${baseY} Q ${R + 6} ${baseY - 2} ${R + 5} ${baseY + 3}`,
    ],
    bolt: [
      `M ${L} ${baseY} L ${L - 2} ${baseY - 4} L ${L + 1} ${baseY - 5} L ${L - 2} ${baseY - 10}`,
      `M ${R} ${baseY} L ${R + 2} ${baseY - 4} L ${R - 1} ${baseY - 5} L ${R + 2} ${baseY - 10}`,
    ],
    sway: [
      `M ${L} ${baseY} Q ${L - 6} ${baseY - 5} ${L - 2} ${baseY - 10}`,
      `M ${R} ${baseY} Q ${R + 4} ${baseY - 6} ${R + 5} ${baseY - 10}`,
    ],
  };
  const tips: Record<AvatarAntenna, [[number, number], [number, number]]> = {
    curl: [
      [L - 1, baseY - 11],
      [R + 1, baseY - 11],
    ],
    fork: [
      [L - 1, baseY - 8],
      [R + 1, baseY - 8],
    ],
    droop: [
      [L - 5, baseY + 3],
      [R + 5, baseY + 3],
    ],
    bolt: [
      [L - 2, baseY - 10],
      [R + 2, baseY - 10],
    ],
    sway: [
      [L - 2, baseY - 10],
      [R + 5, baseY - 10],
    ],
  };
  const [left, right] = paths[style] || paths.curl;
  const [lt, rt] = tips[style] || tips.curl;
  return (
    <g opacity="0.85">
      <path d={left} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={right} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lt[0]} cy={lt[1]} r="1.3" fill={color} />
      <circle cx={rt[0]} cy={rt[1]} r="1.3" fill={color} />
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
  const ink = `hsl(${accent} 40% 42%)`;

  if (pattern === "stripes") {
    const count = 3;
    return (
      <g opacity="0.18">
        {Array.from({ length: count }, (_, i) => {
          const y = cy - ry * 0.35 + (i * (ry * 0.7)) / (count - 1);
          return <ellipse key={i} cx="0" cy={y} rx={rx * 0.85} ry={1.3} fill={ink} />;
        })}
      </g>
    );
  }

  if (pattern === "bands") {
    return (
      <g opacity="0.2">
        <ellipse cx="0" cy={cy - ry * 0.15} rx={rx * 0.88} ry={ry * 0.18} fill={`hsl(${hue} 35% 45%)`} />
        <ellipse cx="0" cy={cy + ry * 0.25} rx={rx * 0.8} ry={ry * 0.14} fill={`hsl(${hue} 35% 45%)`} />
      </g>
    );
  }

  const spots = [
    { cx: -6, cy: cy - 2, r: 2.0 },
    { cx: 7, cy: cy + 3, r: 1.6 },
    { cx: 1, cy: cy + 8, r: 1.8 },
    { cx: -8, cy: cy + 7, r: 1.3 },
  ];
  return (
    <g opacity="0.22">
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
  const a = `hsl(${accent} 65% 48%)`;
  const aDark = `hsl(${accent} 60% 36%)`;
  if (kind === "none") return null;

  if (kind === "monocle") {
    return (
      <g>
        <circle cx="7" cy={faceY} r="3.6" fill="none" stroke={aDark} strokeWidth="1.2" />
        <line x1="10.4" y1={faceY + 1.5} x2="12.5" y2={faceY + 7} stroke={aDark} strokeWidth="1" />
      </g>
    );
  }
  if (kind === "bowtie") {
    return (
      <g transform={`translate(0 ${faceY + 16})`}>
        <path d="M -5.5 0 L -1 -2.2 L -1 2.2 Z" fill={a} />
        <path d="M 5.5 0 L 1 -2.2 L 1 2.2 Z" fill={a} />
        <circle cx="0" cy="0" r="1.2" fill={aDark} />
      </g>
    );
  }
  if (kind === "cap") {
    const y = faceY - 14;
    return (
      <g>
        <ellipse cx="0" cy={y + 2} rx={10} ry="3.2" fill={aDark} />
        <path d={`M -8 ${y + 2} Q 0 ${y - 7} 8 ${y + 2}`} fill={a} />
      </g>
    );
  }
  if (kind === "horns") {
    const y = faceY - 12;
    return (
      <g>
        <path
          d={`M -7 ${y} Q -11 ${y - 6} -8 ${y - 10}`}
          fill="none"
          stroke={aDark}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d={`M 7 ${y} Q 11 ${y - 6} 8 ${y - 10}`}
          fill="none"
          stroke={aDark}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (kind === "flower") {
    const cx = rx * 0.55;
    const cy = faceY - 2;
    return (
      <g>
        {[0, 72, 144, 216, 288].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <circle
              key={deg}
              cx={cx + Math.cos(rad) * 2.4}
              cy={cy + Math.sin(rad) * 2.4}
              r="1.6"
              fill={a}
            />
          );
        })}
        <circle cx={cx} cy={cy} r="1.2" fill={`hsl(${(accent + 40) % 360} 70% 62%)`} />
      </g>
    );
  }
  if (kind === "badge") {
    return (
      <g transform={`translate(${rx * 0.45} ${faceY + 12})`}>
        <circle r="3.4" fill={a} stroke={aDark} strokeWidth="0.9" />
        <circle r="1.5" fill="#fff" opacity="0.85" />
      </g>
    );
  }
  if (kind === "scarf") {
    return (
      <g>
        <path
          d={`M -14 ${faceY + 14} Q 0 ${faceY + 18} 14 ${faceY + 14}`}
          fill="none"
          stroke={a}
          strokeWidth="2.6"
          strokeLinecap="round"
        />
        <path
          d={`M 3 ${faceY + 16} Q 6 ${faceY + 22} 5 ${faceY + 25}`}
          fill="none"
          stroke={aDark}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (kind === "goggles") {
    return (
      <g>
        <circle cx="-6" cy={faceY} r="4.8" fill="none" stroke={aDark} strokeWidth="1.4" />
        <circle cx="6" cy={faceY} r="4.8" fill="none" stroke={aDark} strokeWidth="1.4" />
        <line x1="-1.2" y1={faceY} x2="1.2" y2={faceY} stroke={aDark} strokeWidth="1.2" />
        <line x1="-10.8" y1={faceY} x2={-rx + 4} y2={faceY} stroke={a} strokeWidth="1.1" />
        <line x1="10.8" y1={faceY} x2={rx - 4} y2={faceY} stroke={a} strokeWidth="1.1" />
      </g>
    );
  }
  if (kind === "crown") {
    const y = faceY - 15;
    return (
      <g>
        <path
          d={`M -6.5 ${y + 2} L -5 ${y - 5} L -2.5 ${y} L 0 ${y - 7} L 2.5 ${y} L 5 ${y - 5} L 6.5 ${y + 2} Z`}
          fill={a}
          stroke={aDark}
          strokeWidth="0.7"
        />
        <circle cx="0" cy={y - 7} r="1" fill={`hsl(${(accent + 50) % 360} 75% 60%)`} />
      </g>
    );
  }
  if (kind === "clipboard") {
    return (
      <g transform={`translate(${rx * 0.55} ${faceY + 6})`}>
        <rect x="-3" y="-5" width="7" height="10" rx="1" fill={a} stroke={aDark} strokeWidth="0.8" />
        <rect x="-1.5" y="-6.5" width="4" height="2" rx="0.5" fill={aDark} />
        <line x1="-1.5" y1="-1.5" x2="2.5" y2="-1.5" stroke="#fff" strokeWidth="0.9" opacity="0.85" />
        <line x1="-1.5" y1="1" x2="2" y2="1" stroke="#fff" strokeWidth="0.9" opacity="0.7" />
      </g>
    );
  }
  if (kind === "leaf") {
    return (
      <g transform={`translate(${rx * 0.5} ${faceY - 10}) rotate(25)`}>
        <ellipse cx="0" cy="0" rx="2.4" ry="4.5" fill={a} />
        <line x1="0" y1="3.5" x2="0" y2="-3.5" stroke={aDark} strokeWidth="0.8" />
      </g>
    );
  }
  return null;
}

function Eye({
  cx,
  cy,
  geom,
}: {
  cx: number;
  cy: number;
  geom: ReturnType<typeof eyeGeom>;
}) {
  return (
    <g>
      {/* sclera */}
      <ellipse cx={cx} cy={cy} rx={geom.rx} ry={geom.ry} fill="#fffef8" />
      <ellipse
        cx={cx}
        cy={cy}
        rx={geom.rx}
        ry={geom.ry}
        fill="none"
        stroke="rgba(40,30,25,0.12)"
        strokeWidth="0.6"
      />
      {/* pupil */}
      <circle cx={cx + 0.4} cy={cy + 0.3} r={geom.pupil} fill="#1c1410" />
      {/* catchlight */}
      <circle cx={cx + geom.pupil * 0.35} cy={cy - geom.pupil * 0.35} r={geom.pupil * 0.32} fill="#fff" />
      {geom.lids && (
        <path
          d={`M ${cx - geom.rx * 0.9} ${cy - 1} Q ${cx} ${cy - geom.ry * 0.7} ${cx + geom.rx * 0.9} ${cy - 1}`}
          fill="none"
          stroke="#1c1410"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
      )}
      {geom.sparkle && (
        <circle cx={cx + geom.rx * 0.7} cy={cy - geom.ry * 0.85} r="0.7" fill="rgba(255,255,255,0.9)" />
      )}
      {/* subtle brow */}
      <line
        x1={cx - geom.rx * 0.75}
        y1={cy - geom.ry - 1.5}
        x2={cx + geom.rx * 0.35}
        y2={cy - geom.ry - 1.2}
        stroke="#1c1410"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.55"
        transform={`rotate(${geom.brow * 0.35} ${cx} ${cy - geom.ry})`}
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
  const mouth = mouthPath(t.mouth);
  const tilt = poseTilt(t.pose, seed);

  const gid = `larva-${t.hue}-${t.body}-${seed.toString(36)}`;
  const bodyGradId = `${gid}-body`;
  const bellyGradId = `${gid}-belly`;

  const mid = `hsl(${t.hue} 68% 58%)`;
  const dark = `hsl(${t.hue} 62% 42%)`;
  const light = `hsl(${t.hue} 70% 72%)`;
  const antennaColor = `hsl(${t.hue} 55% 38%)`;
  const bg = `hsl(${t.hue} 28% 96%)`;
  const ring = `hsl(${t.accent} 26% 82%)`;

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
        <radialGradient id={bodyGradId} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor={light} />
          <stop offset="45%" stopColor={mid} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
        <radialGradient id={bellyGradId} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={`hsl(${t.accent} 45% 82%)`} stopOpacity="0.85" />
          <stop offset="100%" stopColor={`hsl(${t.accent} 40% 70%)`} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle r="47" fill={bg} stroke={ring} strokeWidth="1.5" />
      <ellipse cx="0" cy="36" rx="18" ry="4.5" fill={`hsl(${t.hue} 20% 55%)`} opacity="0.22" />

      <g transform={`rotate(${tilt})`}>
        {/* rear tail nub */}
        <ellipse
          cx={geom.tail.cx}
          cy={geom.tail.cy}
          rx={geom.tail.rx}
          ry={geom.tail.ry}
          fill={`url(#${bodyGradId})`}
        />

        {/* main gumdrop blob */}
        <ellipse
          cx={geom.cx}
          cy={geom.cy}
          rx={geom.rx}
          ry={geom.ry}
          fill={`url(#${bodyGradId})`}
        />

        <PatternOverlay
          pattern={t.pattern}
          hue={t.hue}
          accent={t.accent}
          rx={geom.rx}
          ry={geom.ry}
          cy={geom.cy}
          seed={seed}
        />

        {/* soft belly undertone */}
        <ellipse
          cx={0}
          cy={geom.cy + 4}
          rx={geom.rx * 0.55}
          ry={geom.ry * 0.45}
          fill={`url(#${bellyGradId})`}
        />

        {/* specular highlight (gummy gloss) */}
        <ellipse
          cx={-6}
          cy={geom.cy - geom.ry * 0.35}
          rx={geom.rx * 0.38}
          ry={geom.ry * 0.22}
          fill="#fff"
          opacity="0.45"
        />
        <ellipse
          cx={-9}
          cy={geom.cy - geom.ry * 0.15}
          rx={geom.rx * 0.14}
          ry={geom.ry * 0.1}
          fill="#fff"
          opacity="0.35"
        />

        <Antennae style={t.antenna} color={antennaColor} faceY={geom.faceY} />

        <Accessory kind={t.accessory} accent={t.accent} faceY={geom.faceY} rx={geom.rx} />

        {/* face */}
        <g transform={`translate(0 ${geom.faceY})`}>
          {t.cheeks && (
            <>
              <ellipse cx="-11" cy="5" rx="3.2" ry="2" fill={`hsl(${t.hue} 70% 68%)`} opacity="0.45" />
              <ellipse cx="11" cy="5" rx="3.2" ry="2" fill={`hsl(${t.hue} 70% 68%)`} opacity="0.45" />
            </>
          )}
          <Eye cx={-6.5} cy={0} geom={eyes} />
          <Eye cx={6.5} cy={0} geom={eyes} />
          <path
            d={mouth}
            fill="none"
            stroke="#2a2018"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.85"
          />
        </g>
      </g>
    </svg>
  );
}
