// Gemini image portraits for larva cards — unique-ish PNGs stored on Vercel Blob.
// SVG LarvaAvatar remains the fallback when portraitUrl is missing.

import { put } from "@vercel/blob";
import { redis, getIndex, getProfile, saveProfile } from "@/lib/larvae";
import { getMoralResult } from "@/lib/moral";
import { walletSeed } from "@/lib/avatar";

const QUEUE_KEY = "lpp:portrait:queue";
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

export async function clearPortraitQueue() {
  await redis.del(QUEUE_KEY);
}

export async function getPortraitQueue(): Promise<string[]> {
  const raw = await redis.get<string | string[]>(QUEUE_KEY);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

export async function setPortraitQueue(wallets: string[]) {
  await redis.set(QUEUE_KEY, JSON.stringify(wallets));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryMs(body: string): number {
  const m =
    body.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i) ||
    body.match(/Please retry in ([\d.]+)s/i);
  if (!m) return 25_000;
  return Math.min(60_000, Math.max(5_000, Math.ceil(parseFloat(m[1]) * 1000) + 500));
}

function buildPrompt(input: {
  name: string;
  tone: string;
  tagline: string;
  quirks: string[];
  values: string[];
  summary: string;
  hottestTake?: string;
  catchphrase?: string;
  hue: number;
  moralLabel?: string;
  lawChaos?: number;
  goodEvil?: number;
  seed: number;
}): string {
  const moralBit = input.moralLabel
    ? `Moral compass: ${input.moralLabel} (law↔chaos ${input.lawChaos ?? 0}, good↔evil ${input.goodEvil ?? 0}).`
    : "Moral compass: unknown.";
  const quirks = input.quirks.slice(0, 4).join("; ") || "none listed";
  const take = input.hottestTake || input.catchphrase || "(none)";

  return `Create a single character portrait for a mascot called "${input.name}".

STYLE BIBLE (must follow):
- Flat vector illustration, soft gumdrop / larva mascot (the "larvatar" species)
- One creature only, centered, square 1:1 composition, generous padding
- Readable and charming at 64–96px; bold silhouette, simple shapes
- Not photoreal, not human, no text, no logo, no watermark, no UI chrome
- Soft cream or pale tinted background — not busy

PERSONALITY → LOOK:
- Tone: ${input.tone} (fiery=hot/spiky energy; chill=soft/sleepy; analytical=precise/goggles vibe; chaotic=wonky asymmetry; earnest=warm/open; cynical=side-eye/dry)
- Soft color hint around hue ${Math.round(input.hue)}° (HSL) — not a hard lock
- Tagline vibe: ${input.tagline}
- Quirks to show as props/silhouette quirks: ${quirks}
- Hottest take / catchphrase energy (do NOT write the words on the image): ${take}
- ${moralBit}
- Values: ${input.values.slice(0, 3).join("; ") || "n/a"}
- Brief personality: ${input.summary.slice(0, 220)}
- Seed for mild uniqueness (do not draw as text): ${input.seed}

Make this larva look unmistakably different from a generic potato-head blob — distinct silhouette, face, and signature prop — while staying clearly the same species.`;
}

async function generateImageBytes(prompt: string): Promise<{
  bytes: Buffer;
  mimeType: string;
} | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      // Prefer square when supported by the model.
      imageConfig: { aspectRatio: "1:1" },
    },
  };

  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      const errBody = await res.text();
      lastErr = `gemini 429: ${errBody}`;
      await sleep(parseRetryMs(errBody));
      continue;
    }
    if (!res.ok) {
      lastErr = `gemini ${res.status}: ${await res.text()}`;
      throw new Error(lastErr);
    }
    const data = await res.json();
    const parts = (data.candidates || []).flatMap(
      (c: { content?: { parts?: unknown[] } }) => c.content?.parts || []
    );
    for (const part of parts as Array<{
      inlineData?: { mimeType?: string; data?: string };
      inline_data?: { mime_type?: string; data?: string };
    }>) {
      const inline = part.inlineData || part.inline_data;
      const b64 = inline?.data;
      const mime =
        inline && "mimeType" in (inline as object)
          ? (inline as { mimeType?: string }).mimeType
          : (inline as { mime_type?: string } | undefined)?.mime_type;
      if (b64) {
        return {
          bytes: Buffer.from(b64, "base64"),
          mimeType: mime || "image/png",
        };
      }
    }
    lastErr = `gemini returned no image (finishReason=${data.candidates?.[0]?.finishReason || "unknown"})`;
    break;
  }
  throw new Error(lastErr || "gemini image failed");
}

export async function generatePortrait(
  wallet: string
): Promise<{ url: string | null; error?: string }> {
  const p = await getProfile(wallet);
  if (!p) return { url: null, error: "profile missing" };

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      url: null,
      error: "BLOB_READ_WRITE_TOKEN not configured",
    };
  }

  const moral = await getMoralResult(wallet);
  const seed = walletSeed(wallet);

  try {
    const prompt = buildPrompt({
      name: p.profile.name,
      tone: p.profile.tone,
      tagline: p.profile.tagline,
      quirks: p.profile.quirks || [],
      values: p.profile.values || [],
      summary: p.profile.summary || "",
      hottestTake: p.profile.hottestTake,
      catchphrase: p.profile.catchphrase,
      hue: p.avatar?.hue ?? seed % 360,
      moralLabel: moral?.label,
      lawChaos: moral?.lawChaos,
      goodEvil: moral?.goodEvil,
      seed,
    });

    const image = await generateImageBytes(prompt);
    if (!image) return { url: null, error: "no image bytes" };

    const ext = image.mimeType.includes("jpeg") || image.mimeType.includes("jpg")
      ? "jpg"
      : "png";
    const pathname = `larvae-portraits/${wallet.toLowerCase()}.${ext}`;
    const blob = await put(pathname, image.bytes, {
      access: "public",
      contentType: image.mimeType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    p.avatar = {
      ...p.avatar,
      portraitUrl: blob.url,
      portraitAt: new Date().toISOString(),
    };
    p.updatedAt = new Date().toISOString();
    await saveProfile(p);
    return { url: blob.url };
  } catch (e) {
    return {
      url: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function seedPortraitQueue(force: boolean): Promise<number> {
  const index = await getIndex();
  const wallets: string[] = [];
  for (const e of index) {
    const w = e.wallet.toLowerCase();
    if (!force) {
      const p = await getProfile(w);
      if (p?.avatar?.portraitUrl) continue;
    }
    wallets.push(w);
  }
  await setPortraitQueue(wallets);
  return wallets.length;
}
