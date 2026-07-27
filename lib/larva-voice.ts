// Deterministic larva → ElevenLabs premade voice mapping.
// Pure local lookup — never calls ElevenLabs (assignment costs $0 credits).
// Only TTS playback spends free-tier characters.

export type LarvaTone =
  | "fiery"
  | "chill"
  | "analytical"
  | "chaotic"
  | "earnest"
  | "cynical"
  | string;

export type LarvaVoice = {
  voiceId: string;
  voiceLabel: string;
};

/** Premade default voices available on free API (not Voice Library). */
const TONE_VOICES: Record<string, LarvaVoice[]> = {
  fiery: [
    { voiceId: "AZnzlk1XvdvUeBnXmlld", voiceLabel: "Domi" },
    { voiceId: "VR6AewLTigWG4xSOukaG", voiceLabel: "Arnold" },
    { voiceId: "2EiwWnXFnvU5JabPnv8n", voiceLabel: "Clyde" },
    { voiceId: "TxGEqnHWrfWFTfGW9XjX", voiceLabel: "Josh" },
  ],
  chill: [
    { voiceId: "21m00Tcm4TlvDq8ikWAM", voiceLabel: "Rachel" },
    { voiceId: "EXAVITQu4vr4xnSDxMaL", voiceLabel: "Sarah" },
    { voiceId: "oWAxZDx7w5VEj9dCyTzz", voiceLabel: "Grace" },
    { voiceId: "pFZP5JQG7iQjIQuC4Bku", voiceLabel: "Lily" },
  ],
  analytical: [
    { voiceId: "onwK4e9ZLuTAKqWW03F9", voiceLabel: "Daniel" },
    { voiceId: "pNInz6obpgDQGcFmaJgB", voiceLabel: "Adam" },
    { voiceId: "ErXwobaYiN019PkySvjV", voiceLabel: "Antoni" },
    { voiceId: "JBFqnCBsd6RMkjVDRZzb", voiceLabel: "George" },
  ],
  chaotic: [
    { voiceId: "jsCqWAovK2LkecY7zXl4", voiceLabel: "Freya" },
    { voiceId: "jBpfuIE2acCO8z3wKNLl", voiceLabel: "Gigi" },
    { voiceId: "IKne3meq5aSn9XLyUdCD", voiceLabel: "Charlie" },
    { voiceId: "MF3mGyEYCl7XYWbV9V6P", voiceLabel: "Elli" },
  ],
  earnest: [
    { voiceId: "LcfcDJNUP1GaeZkediLS", voiceLabel: "Emily" },
    { voiceId: "ThT5KcBeYPX3keUQqHPh", voiceLabel: "Dorothy" },
    { voiceId: "XrExE9yKIg1WjnnlVkGX", voiceLabel: "Matilda" },
    { voiceId: "XB0fDUnXU5powFXDhCwa", voiceLabel: "Charlotte" },
  ],
  cynical: [
    { voiceId: "CwhRBWXzGAHq8TQ4Fs17", voiceLabel: "Roger" },
    { voiceId: "GBv7mTt0atIp3Br8iCZE", voiceLabel: "Thomas" },
    { voiceId: "N2lVS1w4EtoT3dr4eOWO", voiceLabel: "Callum" },
    { voiceId: "Zlb1dXrM653N07WRdFW3", voiceLabel: "Joseph" },
  ],
};

const FALLBACK: LarvaVoice[] = [
  { voiceId: "EXAVITQu4vr4xnSDxMaL", voiceLabel: "Sarah" },
  { voiceId: "21m00Tcm4TlvDq8ikWAM", voiceLabel: "Rachel" },
  { voiceId: "pNInz6obpgDQGcFmaJgB", voiceLabel: "Adam" },
  { voiceId: "ErXwobaYiN019PkySvjV", voiceLabel: "Antoni" },
];

function hashWallet(wallet: string): number {
  const s = wallet.toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Stable per-larva voice from tone + wallet. No network / no ElevenLabs credits. */
export function voiceForLarva(opts: {
  wallet: string;
  tone?: LarvaTone;
}): LarvaVoice {
  const tone = String(opts.tone || "")
    .toLowerCase()
    .trim();
  const pool = TONE_VOICES[tone] || FALLBACK;
  const idx = hashWallet(opts.wallet || "unknown") % pool.length;
  return pool[idx];
}
