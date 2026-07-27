// POST { text, provider?, voiceId?, style? } → neural TTS audio
// provider: "gemini" (default) | "eleven"
// ElevenLabs reserved for short one-liners (hottest takes). Survey + standup use Gemini.

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/larvae";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const CACHE_KEY = (hash: string) => `lpp:tts:v2:${hash}`;
const CACHE_TTL = 60 * 60 * 24 * 30;

const ELEVEN_VOICE =
  process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5";

const GEMINI_TTS_MODEL =
  process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const GEMINI_VOICE_DEFAULT = process.env.GEMINI_TTS_VOICE || "Aoede";

function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function parseSampleRate(mime: string | undefined): number {
  if (!mime) return 24000;
  const m = /rate=(\d+)/i.exec(mime);
  return m ? Number(m[1]) : 24000;
}

async function elevenLabsTts(
  text: string,
  voiceId: string
): Promise<{ buf: Buffer; mime: string } | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: ELEVEN_MODEL,
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
          style: 0.4,
          use_speaker_boost: true,
        },
      }),
    }
  );
  if (!res.ok) {
    console.error("elevenlabs tts", res.status, await res.text().catch(() => ""));
    return null;
  }
  return { buf: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg" };
}

const STYLE_PROMPTS: Record<string, string> = {
  host: "Say this like a warm game-show host — playful, clear, natural pacing:\n",
  standup:
    "Perform this stand-up comedy bit out loud. Conversational club-comic energy, natural pauses, commit to the punchlines. Do not add extra lines:\n",
  larva: "Say this in character, natural and opinionated, not robotic:\n",
  take: "Deliver this hot take with conviction — short, punchy:\n",
};

async function geminiTts(
  text: string,
  style: string,
  voiceName: string
): Promise<{ buf: Buffer; mime: string } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const prefix = STYLE_PROMPTS[style] || STYLE_PROMPTS.larva;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${prefix}${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    console.error("gemini tts", res.status, await res.text().catch(() => ""));
    return null;
  }

  const json = (await res.json()) as {
    candidates?: {
      content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] };
    }[];
  };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  const b64 = part?.inlineData?.data;
  if (!b64) return null;

  const pcm = Buffer.from(b64, "base64");
  const rate = parseSampleRate(part?.inlineData?.mimeType);
  return { buf: pcmToWav(pcm, rate), mime: "audio/wav" };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const provider = body?.provider === "eleven" ? "eleven" : "gemini";
  const style = String(body?.style || (provider === "eleven" ? "take" : "host"))
    .trim()
    .toLowerCase();
  const geminiVoice = String(body?.geminiVoice || GEMINI_VOICE_DEFAULT).trim() || GEMINI_VOICE_DEFAULT;

  const maxLen = provider === "eleven" ? 220 : 2800;
  const text = String(body?.text || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const rawVoice = String(body?.voiceId || "").trim();
  const voiceId = /^[a-zA-Z0-9]{10,64}$/.test(rawVoice) ? rawVoice : ELEVEN_VOICE;

  const hash = createHash("sha256")
    .update(`${provider}:${style}:${voiceId}:${geminiVoice}:${text}`)
    .digest("hex")
    .slice(0, 32);

  const cached = await redis.get<{ b64: string; mime: string } | string>(CACHE_KEY(hash));
  if (cached) {
    const parsed =
      typeof cached === "string" ? (JSON.parse(cached) as { b64: string; mime: string }) : cached;
    if (parsed?.b64 && parsed?.mime) {
      const bytes = new Uint8Array(Buffer.from(parsed.b64, "base64"));
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": parsed.mime,
          "Cache-Control": "public, max-age=86400",
          "X-Survey-TTS": "cache",
        },
      });
    }
  }

  let audio: { buf: Buffer; mime: string } | null = null;
  if (provider === "eleven") {
    audio = (await elevenLabsTts(text, voiceId)) || (await geminiTts(text, "take", geminiVoice));
  } else {
    audio = await geminiTts(text, style === "standup" || style === "larva" || style === "host" || style === "take" ? style : "host", geminiVoice);
  }

  if (!audio) {
    return NextResponse.json({ error: "tts unavailable" }, { status: 503 });
  }

  await redis.set(
    CACHE_KEY(hash),
    JSON.stringify({ b64: audio.buf.toString("base64"), mime: audio.mime }),
    { ex: CACHE_TTL }
  );

  return new NextResponse(new Uint8Array(audio.buf), {
    headers: {
      "Content-Type": audio.mime,
      "Cache-Control": "public, max-age=86400",
      "X-Survey-TTS": provider === "eleven" && process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "gemini",
    },
  });
}
