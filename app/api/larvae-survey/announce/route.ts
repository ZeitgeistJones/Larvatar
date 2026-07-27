// POST { text } → neural TTS audio (mp3/wav).
// Prefers ElevenLabs when ELEVENLABS_API_KEY is set; otherwise Gemini TTS
// via the existing GEMINI_API_KEY. Caches by text hash in Redis.

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/larvae";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const CACHE_KEY = (hash: string) => `lpp:survey:tts:v1:${hash}`;
const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days

// Soft young female — ElevenLabs "Sarah"
const ELEVEN_VOICE =
  process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL";
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL_ID || "eleven_flash_v2_5";

// Gemini prebuilt female voice (breezy)
const GEMINI_TTS_MODEL =
  process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const GEMINI_VOICE = process.env.GEMINI_TTS_VOICE || "Aoede";

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
  header.writeUInt16LE(1, 20); // PCM
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

async function elevenLabsTts(text: string): Promise<{ buf: Buffer; mime: string } | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE}?output_format=mp3_44100_128`,
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
          stability: 0.35,
          similarity_boost: 0.8,
          style: 0.45,
          use_speaker_boost: true,
        },
      }),
    }
  );
  if (!res.ok) {
    console.error("elevenlabs tts", res.status, await res.text().catch(() => ""));
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { buf, mime: "audio/mpeg" };
}

async function geminiTts(text: string): Promise<{ buf: Buffer; mime: string } | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Say this like a flirty game-show hostess — warm, playful, natural pacing, not robotic:\n${text}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: GEMINI_VOICE },
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
  const wav = pcmToWav(pcm, rate);
  return { buf: wav, mime: "audio/wav" };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const text = String(body?.text || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 220);
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const hash = createHash("sha256").update(text).digest("hex").slice(0, 32);
  const cached = await redis.get<{ b64: string; mime: string } | string>(CACHE_KEY(hash));
  if (cached) {
    const parsed =
      typeof cached === "string" ? (JSON.parse(cached) as { b64: string; mime: string }) : cached;
    if (parsed?.b64 && parsed?.mime) {
      return new NextResponse(Buffer.from(parsed.b64, "base64"), {
        headers: {
          "Content-Type": parsed.mime,
          "Cache-Control": "public, max-age=86400",
          "X-Survey-TTS": "cache",
        },
      });
    }
  }

  const audio = (await elevenLabsTts(text)) || (await geminiTts(text));
  if (!audio) {
    return NextResponse.json({ error: "tts unavailable" }, { status: 503 });
  }

  await redis.set(
    CACHE_KEY(hash),
    JSON.stringify({ b64: audio.buf.toString("base64"), mime: audio.mime }),
    { ex: CACHE_TTL }
  );

  return new NextResponse(audio.buf, {
    headers: {
      "Content-Type": audio.mime,
      "Cache-Control": "public, max-age=86400",
      "X-Survey-TTS": process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "gemini",
    },
  });
}
