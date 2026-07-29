// Stable Gemini TTS voice picks from wallet (30 prebuilt voices).

export const GEMINI_TTS_VOICES = [
  "Zephyr",
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Leda",
  "Orus",
  "Aoede",
  "Callirrhoe",
  "Autonoe",
  "Enceladus",
  "Iapetus",
  "Umbriel",
  "Algieba",
  "Despina",
  "Erinome",
  "Algenib",
  "Rasalgethi",
  "Laomedeia",
  "Achernar",
  "Alnilam",
  "Schedar",
  "Gacrux",
  "Pulcherrima",
  "Achird",
  "Zubenelgenubi",
  "Vindemiatrix",
  "Sadachbia",
  "Sadaltager",
  "Sulafat",
] as const;

export type GeminiTtsVoice = (typeof GEMINI_TTS_VOICES)[number];

/** Deterministic voice from a wallet — same larva always sounds the same. */
export function geminiVoiceForWallet(wallet: string, salt = 0): GeminiTtsVoice {
  const w = (wallet || "anon").toLowerCase();
  let h = salt >>> 0;
  for (let i = 0; i < w.length; i++) {
    h = (Math.imul(h, 31) + w.charCodeAt(i)) >>> 0;
  }
  return GEMINI_TTS_VOICES[h % GEMINI_TTS_VOICES.length];
}

/**
 * Pick distinct voices for a small roster (debate corners, jury panel).
 * Falls back to cycling if the roster is larger than the voice list.
 */
export function geminiVoicesForWallets(wallets: string[]): Map<string, GeminiTtsVoice> {
  const out = new Map<string, GeminiTtsVoice>();
  const used = new Set<number>();
  for (const raw of wallets) {
    const key = raw.toLowerCase();
    if (out.has(key)) continue;
    let idx = GEMINI_TTS_VOICES.indexOf(geminiVoiceForWallet(key));
    let guard = 0;
    while (used.has(idx) && guard < GEMINI_TTS_VOICES.length) {
      idx = (idx + 1) % GEMINI_TTS_VOICES.length;
      guard++;
    }
    used.add(idx);
    out.set(key, GEMINI_TTS_VOICES[idx]);
  }
  return out;
}
