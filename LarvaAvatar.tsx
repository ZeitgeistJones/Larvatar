// components/LarvaAvatar.tsx
// deterministic procedural larva. hue from wallet hash, features from tone.
// no image-gen, zero cost, same wallet always renders the same little guy.

type Props = { hue: number; tone: string; size?: number };

const TONE_FEATURES: Record<
  string,
  { eyeRy: number; browTilt: number; mouth: string; antennaCurl: number }
> = {
  //                 eye height   brow angle   mouth path (relative)         antenna curl
  fiery:      { eyeRy: 3.2, browTilt: -14, mouth: "M -7 6 Q 0 12 7 6",   antennaCurl: 14 },
  chill:      { eyeRy: 1.6, browTilt: 4,   mouth: "M -6 8 Q 0 10 6 8",   antennaCurl: 4 },
  analytical: { eyeRy: 2.6, browTilt: 0,   mouth: "M -5 8 L 5 8",        antennaCurl: 0 },
  chaotic:    { eyeRy: 3.6, browTilt: -8,  mouth: "M -7 7 Q -3 11 0 7 Q 3 11 7 7", antennaCurl: 22 },
  earnest:    { eyeRy: 3.0, browTilt: 8,   mouth: "M -6 7 Q 0 11 6 7",   antennaCurl: 8 },
  cynical:    { eyeRy: 2.0, browTilt: 12,  mouth: "M -6 9 Q 0 6 6 9",    antennaCurl: -6 },
};

export default function LarvaAvatar({ hue, tone, size = 96 }: Props) {
  const f = TONE_FEATURES[tone] || TONE_FEATURES.earnest;
  const body = `hsl(${hue} 62% 58%)`;
  const bodyDark = `hsl(${hue} 62% 44%)`;
  const belly = `hsl(${hue} 55% 78%)`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`larva avatar, ${tone}`}
    >
      {/* petri dish */}
      <circle r="47" fill={`hsl(${hue} 30% 96%)`} stroke={`hsl(${hue} 25% 82%)`} strokeWidth="1.5" />

      {/* tail segments */}
      <ellipse cx="0" cy="26" rx="10" ry="7" fill={bodyDark} />
      <ellipse cx="0" cy="18" rx="13" ry="9" fill={body} />
      <ellipse cx="0" cy="6" rx="16" ry="12" fill={body} />

      {/* belly */}
      <ellipse cx="0" cy="8" rx="9" ry="8" fill={belly} />

      {/* head */}
      <circle cx="0" cy="-14" r="16" fill={body} />

      {/* antennae */}
      <path
        d={`M -7 -27 Q ${-10 - f.antennaCurl} -40 ${-4 - f.antennaCurl} -44`}
        fill="none" stroke={bodyDark} strokeWidth="2.2" strokeLinecap="round"
      />
      <path
        d={`M 7 -27 Q ${10 + f.antennaCurl} -40 ${4 + f.antennaCurl} -44`}
        fill="none" stroke={bodyDark} strokeWidth="2.2" strokeLinecap="round"
      />

      {/* tiny claws */}
      <ellipse cx="-17" cy="0" rx="5" ry="3.6" fill={bodyDark} transform="rotate(-25 -17 0)" />
      <ellipse cx="17" cy="0" rx="5" ry="3.6" fill={bodyDark} transform="rotate(25 17 0)" />

      {/* face */}
      <g transform="translate(0 -14)">
        <ellipse cx="-6" cy="-1" rx="2.6" ry={f.eyeRy} fill="#1c1c28" />
        <ellipse cx="6" cy="-1" rx="2.6" ry={f.eyeRy} fill="#1c1c28" />
        <circle cx="-5.2" cy="-2" r="0.8" fill="#fff" />
        <circle cx="6.8" cy="-2" r="0.8" fill="#fff" />
        <line
          x1="-9" y1="-6" x2="-3" y2="-6" stroke="#1c1c28" strokeWidth="1.4" strokeLinecap="round"
          transform={`rotate(${f.browTilt} -6 -6)`}
        />
        <line
          x1="3" y1="-6" x2="9" y2="-6" stroke="#1c1c28" strokeWidth="1.4" strokeLinecap="round"
          transform={`rotate(${-f.browTilt} 6 -6)`}
        />
        <path d={f.mouth} fill="none" stroke="#1c1c28" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}
