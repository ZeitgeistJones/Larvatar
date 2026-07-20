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

function bodyGeom(body: AvatarBody) {
  switch (body) {
    case "slim":
      return {
        headR: 13.5,
        headY: -16,
        seg: [
          { cy: 2, rx: 12, ry: 10 },
          { cy: 14, rx: 10, ry: 8 },
          { cy: 24, rx: 8, ry: 6.5 },
        ],
        belly: { cy: 4, rx: 6.5, ry: 7 },
        armX: 14,
      };
    case "tall":
      return {
        headR: 14.5,
        headY: -20,
        seg: [
          { cy: 0, rx: 14, ry: 11 },
          { cy: 13, rx: 12.5, ry: 9 },
          { cy: 24, rx: 10.5, ry: 7.5 },
          { cy: 32, rx: 8, ry: 5.5 },
        ],
        belly: { cy: 2, rx: 7.5, ry: 8 },
        armX: 16,
      };
    case "round":
      return {
        headR: 17,
        headY: -12,
        seg: [
          { cy: 8, rx: 18, ry: 14 },
          { cy: 22, rx: 14, ry: 10 },
        ],
        belly: { cy: 10, rx: 10, ry: 9 },
        armX: 18,
      };
    default: // plump
      return {
        headR: 16,
        headY: -14,
        seg: [
          { cy: 6, rx: 16, ry: 12 },
          { cy: 18, rx: 13, ry: 9 },
          { cy: 26, rx: 10, ry: 7 },
        ],
        belly: { cy: 8, rx: 9, ry: 8 },
        armX: 17,
      };
  }
}

function eyeGeom(eyes: AvatarEyes) {
  switch (eyes) {
    case "sharp":
      return { rx: 2.2, ry: 3.4, brow: -10, sparkle: false, lids: false };
    case "wide":
      return { rx: 3.4, ry: 3.6, brow: -4, sparkle: true, lids: false };
    case "sleepy":
      return { rx: 2.8, ry: 1.5, brow: 10, sparkle: false, lids: true };
    case "gleam":
      return { rx: 2.7, ry: 2.9, brow: -2, sparkle: true, lids: false };
    default: // soft
      return { rx: 2.6, ry: 2.8, brow: 6, sparkle: false, lids: false };
  }
}

function mouthPath(mouth: AvatarMouth): string {
  switch (mouth) {
    case "flat":
      return "M -5 8 L 5 8";
    case "smirk":
      return "M -6 8 Q 0 7 6 10";
    case "grin":
      return "M -7 6 Q 0 13 7 6";
    case "frown":
      return "M -6 9 Q 0 6 6 9";
    default: // smile
      return "M -6 7 Q 0 11 6 7";
  }
}

function poseTilt(pose: AvatarPose, seed: number): number {
  if (pose === "lean-left") return -4 - (seed % 3);
  if (pose === "lean-right") return 4 + (seed % 3);
  return 0;
}

function Antennae({
  style,
  color,
  headY,
  headR,
}: {
  style: AvatarAntenna;
  color: string;
  headY: number;
  headR: number;
}) {
  const baseY = headY - headR + 2;
  const L = -7;
  const R = 7;
  const paths: Record<AvatarAntenna, [string, string]> = {
    curl: [
      `M ${L} ${baseY} Q ${L - 10} ${baseY - 16} ${L - 2} ${baseY - 22}`,
      `M ${R} ${baseY} Q ${R + 10} ${baseY - 16} ${R + 2} ${baseY - 22}`,
    ],
    fork: [
      `M ${L} ${baseY} L ${L - 2} ${baseY - 14} M ${L - 2} ${baseY - 10} L ${L - 7} ${baseY - 18} M ${L - 2} ${baseY - 10} L ${L + 3} ${baseY - 18}`,
      `M ${R} ${baseY} L ${R + 2} ${baseY - 14} M ${R + 2} ${baseY - 10} L ${R + 7} ${baseY - 18} M ${R + 2} ${baseY - 10} L ${R - 3} ${baseY - 18}`,
    ],
    droop: [
      `M ${L} ${baseY} Q ${L - 12} ${baseY - 6} ${L - 10} ${baseY + 4}`,
      `M ${R} ${baseY} Q ${R + 12} ${baseY - 6} ${R + 10} ${baseY + 4}`,
    ],
    bolt: [
      `M ${L} ${baseY} L ${L - 4} ${baseY - 8} L ${L + 1} ${baseY - 10} L ${L - 5} ${baseY - 20}`,
      `M ${R} ${baseY} L ${R + 4} ${baseY - 8} L ${R - 1} ${baseY - 10} L ${R + 5} ${baseY - 20}`,
    ],
    sway: [
      `M ${L} ${baseY} Q ${L - 14} ${baseY - 10} ${L - 4} ${baseY - 20} Q ${L + 4} ${baseY - 26} ${L - 2} ${baseY - 28}`,
      `M ${R} ${baseY} Q ${R + 8} ${baseY - 12} ${R + 12} ${baseY - 18} Q ${R + 2} ${baseY - 24} ${R + 6} ${baseY - 28}`,
    ],
  };
  const [left, right] = paths[style] || paths.curl;
  const tip = (x: number, y: number) => <circle cx={x} cy={y} r="1.8" fill={color} />;
  const tips: Record<AvatarAntenna, [[number, number], [number, number]]> = {
    curl: [
      [L - 2, baseY - 22],
      [R + 2, baseY - 22],
    ],
    fork: [
      [L - 2, baseY - 14],
      [R + 2, baseY - 14],
    ],
    droop: [
      [L - 10, baseY + 4],
      [R + 10, baseY + 4],
    ],
    bolt: [
      [L - 5, baseY - 20],
      [R + 5, baseY - 20],
    ],
    sway: [
      [L - 2, baseY - 28],
      [R + 6, baseY - 28],
    ],
  };
  const [lt, rt] = tips[style] || tips.curl;
  return (
    <g>
      <path d={left} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={right} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {tip(lt[0], lt[1])}
      {tip(rt[0], rt[1])}
    </g>
  );
}

function PatternOverlay({
  pattern,
  hue,
  accent,
  segs,
  seed,
}: {
  pattern: AvatarPattern;
  hue: number;
  accent: number;
  segs: { cy: number; rx: number; ry: number }[];
  seed: number;
}) {
  if (pattern === "plain" || segs.length === 0) return null;
  const ink = `hsl(${accent} 45% 38%)`;
  const mid = segs[0];

  if (pattern === "stripes") {
    const count = 3 + (seed % 2);
    return (
      <g opacity="0.35">
        {Array.from({ length: count }, (_, i) => {
          const y = mid.cy - mid.ry * 0.6 + (i * (mid.ry * 1.2)) / (count - 1 || 1);
          return (
            <ellipse
              key={i}
              cx="0"
              cy={y}
              rx={mid.rx * 0.92}
              ry={1.4}
              fill={ink}
            />
          );
        })}
      </g>
    );
  }

  if (pattern === "bands") {
    return (
      <g opacity="0.4">
        {segs.slice(0, 2).map((s, i) => (
          <ellipse
            key={i}
            cx="0"
            cy={s.cy}
            rx={s.rx * 0.95}
            ry={s.ry * 0.28}
            fill={`hsl(${hue} 40% 42%)`}
          />
        ))}
      </g>
    );
  }

  // spots
  const spots = [
    { cx: -5, cy: mid.cy - 2, r: 2.2 },
    { cx: 6, cy: mid.cy + 3, r: 1.7 },
    { cx: 1, cy: mid.cy + 7, r: 2.0 },
    { cx: -7, cy: mid.cy + 6, r: 1.4 },
  ];
  return (
    <g opacity="0.4">
      {spots.map((s, i) => (
        <circle key={i} cx={s.cx + ((seed >> i) % 3) - 1} cy={s.cy} r={s.r} fill={ink} />
      ))}
    </g>
  );
}

function Accessory({
  kind,
  accent,
  headY,
  headR,
}: {
  kind: AvatarAccessory;
  accent: number;
  headY: number;
  headR: number;
}) {
  const a = `hsl(${accent} 65% 48%)`;
  const aDark = `hsl(${accent} 60% 36%)`;
  if (kind === "none") return null;

  if (kind === "monocle") {
    return (
      <g>
        <circle cx="6.5" cy={headY - 1} r="4.2" fill="none" stroke={aDark} strokeWidth="1.4" />
        <line x1="10.5" y1={headY + 1} x2="14" y2={headY + 10} stroke={aDark} strokeWidth="1.1" />
      </g>
    );
  }
  if (kind === "bowtie") {
    return (
      <g transform={`translate(0 ${headY + headR - 1})`}>
        <path d="M -7 0 L -1 -3 L -1 3 Z" fill={a} />
        <path d="M 7 0 L 1 -3 L 1 3 Z" fill={a} />
        <circle cx="0" cy="0" r="1.6" fill={aDark} />
      </g>
    );
  }
  if (kind === "cap") {
    return (
      <g>
        <ellipse cx="0" cy={headY - headR + 2} rx={headR * 0.95} ry="4" fill={aDark} />
        <path
          d={`M ${-headR * 0.7} ${headY - headR + 2} Q 0 ${headY - headR - 10} ${headR * 0.7} ${headY - headR + 2}`}
          fill={a}
        />
      </g>
    );
  }
  if (kind === "horns") {
    return (
      <g>
        <path
          d={`M -8 ${headY - headR + 4} Q -14 ${headY - headR - 6} -10 ${headY - headR - 12}`}
          fill="none"
          stroke={aDark}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d={`M 8 ${headY - headR + 4} Q 14 ${headY - headR - 6} 10 ${headY - headR - 12}`}
          fill="none"
          stroke={aDark}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (kind === "flower") {
    const cx = 12;
    const cy = headY - 2;
    return (
      <g>
        {[0, 72, 144, 216, 288].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <circle
              key={deg}
              cx={cx + Math.cos(rad) * 3.2}
              cy={cy + Math.sin(rad) * 3.2}
              r="2.1"
              fill={a}
            />
          );
        })}
        <circle cx={cx} cy={cy} r="1.6" fill={`hsl(${(accent + 40) % 360} 70% 62%)`} />
      </g>
    );
  }
  if (kind === "badge") {
    return (
      <g transform={`translate(10 ${headY + headR + 2})`}>
        <circle r="4.5" fill={a} stroke={aDark} strokeWidth="1" />
        <circle r="2" fill="#fff" opacity="0.85" />
      </g>
    );
  }
  if (kind === "scarf") {
    return (
      <g>
        <path
          d={`M -12 ${headY + headR - 2} Q 0 ${headY + headR + 4} 12 ${headY + headR - 2}`}
          fill="none"
          stroke={a}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d={`M 4 ${headY + headR} Q 8 ${headY + headR + 10} 6 ${headY + headR + 14}`}
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
        <circle cx="-6" cy={headY - 1} r="4.4" fill="none" stroke={aDark} strokeWidth="1.6" />
        <circle cx="6" cy={headY - 1} r="4.4" fill="none" stroke={aDark} strokeWidth="1.6" />
        <line x1="-1.6" y1={headY - 1} x2="1.6" y2={headY - 1} stroke={aDark} strokeWidth="1.4" />
        <line
          x1="-10.4"
          y1={headY - 1}
          x2={-headR + 1}
          y2={headY - 1}
          stroke={a}
          strokeWidth="1.2"
        />
        <line
          x1="10.4"
          y1={headY - 1}
          x2={headR - 1}
          y2={headY - 1}
          stroke={a}
          strokeWidth="1.2"
        />
      </g>
    );
  }
  if (kind === "crown") {
    const y = headY - headR + 1;
    return (
      <g>
        <path
          d={`M -8 ${y + 2} L -6 ${y - 7} L -3 ${y} L 0 ${y - 9} L 3 ${y} L 6 ${y - 7} L 8 ${y + 2} Z`}
          fill={a}
          stroke={aDark}
          strokeWidth="0.8"
        />
        <circle cx="0" cy={y - 9} r="1.2" fill={`hsl(${(accent + 50) % 360} 75% 60%)`} />
      </g>
    );
  }
  if (kind === "clipboard") {
    return (
      <g transform={`translate(${headR + 2} ${headY + 4})`}>
        <rect x="-4" y="-6" width="9" height="12" rx="1.2" fill={a} stroke={aDark} strokeWidth="0.9" />
        <rect x="-2" y="-8" width="5" height="2.4" rx="0.6" fill={aDark} />
        <line x1="-2" y1="-2" x2="3" y2="-2" stroke="#fff" strokeWidth="1" opacity="0.85" />
        <line x1="-2" y1="1" x2="2.5" y2="1" stroke="#fff" strokeWidth="1" opacity="0.7" />
        <line x1="-2" y1="4" x2="1.5" y2="4" stroke="#fff" strokeWidth="1" opacity="0.55" />
      </g>
    );
  }
  if (kind === "leaf") {
    return (
      <g transform={`translate(${headR - 2} ${headY - headR + 6}) rotate(25)`}>
        <ellipse cx="0" cy="0" rx="3.2" ry="6" fill={a} />
        <line x1="0" y1="5" x2="0" y2="-5" stroke={aDark} strokeWidth="0.9" />
      </g>
    );
  }
  return null;
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
  const body = `hsl(${t.hue} 62% 58%)`;
  const bodyDark = `hsl(${t.hue} 62% 44%)`;
  const belly = `hsl(${t.accent} 50% 78%)`;
  const bg = `hsl(${t.hue} 32% 96%)`;
  const ring = `hsl(${t.accent} 28% 80%)`;
  const mouth = mouthPath(t.mouth);
  const tilt = poseTilt(t.pose, seed);

  return (
    <svg
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={label || `larvatar, ${t.tone}, ${t.body}, ${t.accessory}`}
    >
      <circle r="47" fill={bg} stroke={ring} strokeWidth="1.5" />
      {/* soft ground shadow */}
      <ellipse cx="0" cy="38" rx="16" ry="5" fill={`hsl(${t.hue} 25% 70%)`} opacity="0.35" />

      <g transform={`rotate(${tilt})`}>
        {/* body segments back-to-front */}
        {[...geom.seg].reverse().map((s, i) => (
          <ellipse
            key={`seg-${i}`}
            cx="0"
            cy={s.cy}
            rx={s.rx}
            ry={s.ry}
            fill={i === geom.seg.length - 1 ? body : i % 2 === 0 ? bodyDark : body}
          />
        ))}

        <PatternOverlay
          pattern={t.pattern}
          hue={t.hue}
          accent={t.accent}
          segs={geom.seg}
          seed={seed}
        />

        <ellipse
          cx="0"
          cy={geom.belly.cy}
          rx={geom.belly.rx}
          ry={geom.belly.ry}
          fill={belly}
          opacity="0.95"
        />

        {/* little arms */}
        <ellipse
          cx={-geom.armX}
          cy={geom.seg[0].cy}
          rx="5"
          ry="3.4"
          fill={bodyDark}
          transform={`rotate(-28 ${-geom.armX} ${geom.seg[0].cy})`}
        />
        <ellipse
          cx={geom.armX}
          cy={geom.seg[0].cy}
          rx="5"
          ry="3.4"
          fill={bodyDark}
          transform={`rotate(28 ${geom.armX} ${geom.seg[0].cy})`}
        />

        {/* head */}
        <circle cx="0" cy={geom.headY} r={geom.headR} fill={body} />

        <Antennae style={t.antenna} color={bodyDark} headY={geom.headY} headR={geom.headR} />

        <Accessory kind={t.accessory} accent={t.accent} headY={geom.headY} headR={geom.headR} />

        {/* face */}
        <g transform={`translate(0 ${geom.headY})`}>
          {t.cheeks && (
            <>
              <ellipse cx="-9" cy="3" rx="2.8" ry="1.8" fill={`hsl(${t.hue} 70% 70%)`} opacity="0.55" />
              <ellipse cx="9" cy="3" rx="2.8" ry="1.8" fill={`hsl(${t.hue} 70% 70%)`} opacity="0.55" />
            </>
          )}
          <ellipse cx="-6" cy="-1" rx={eyes.rx} ry={eyes.ry} fill="#1c1c28" />
          <ellipse cx="6" cy="-1" rx={eyes.rx} ry={eyes.ry} fill="#1c1c28" />
          {eyes.lids && (
            <>
              <path d="M -9 -2 Q -6 -4 -3 -2" fill="none" stroke="#1c1c28" strokeWidth="1.2" />
              <path d="M 3 -2 Q 6 -4 9 -2" fill="none" stroke="#1c1c28" strokeWidth="1.2" />
            </>
          )}
          <circle cx={-6 + eyes.rx * 0.25} cy={-1 - eyes.ry * 0.35} r="0.85" fill="#fff" />
          <circle cx={6 + eyes.rx * 0.25} cy={-1 - eyes.ry * 0.35} r="0.85" fill="#fff" />
          {eyes.sparkle && (
            <>
              <circle cx="-3.5" cy="-4.5" r="0.7" fill={`hsl(${t.accent} 80% 60%)`} />
              <circle cx="9" cy="-5" r="0.55" fill={`hsl(${t.accent} 80% 60%)`} />
            </>
          )}
          <line
            x1="-9.5"
            y1="-6"
            x2="-3"
            y2="-6"
            stroke="#1c1c28"
            strokeWidth="1.4"
            strokeLinecap="round"
            transform={`rotate(${eyes.brow} -6 -6)`}
          />
          <line
            x1="3"
            y1="-6"
            x2="9.5"
            y2="-6"
            stroke="#1c1c28"
            strokeWidth="1.4"
            strokeLinecap="round"
            transform={`rotate(${-eyes.brow} 6 -6)`}
          />
          <path d={mouth} fill="none" stroke="#1c1c28" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
