// lib/survey-sfx.ts
// Soft game-show cues for the survey game + Hive Card Sharks (knockoff vibe).
// Web Audio stings + optional speechSynthesis announcer + quiet bed music.

"use client";

type Cue =
  | "hit"
  | "strike"
  | "strikeOut"
  | "tick"
  | "reveal"
  | "fastMoney"
  | "fmHit"
  | "fmMiss"
  | "bonus"
  | "start"
  | "results";

let ctx: AudioContext | null = null;
let muted = false;

/** Master gain for bed so we can duck under announcer. */
let bedGain: GainNode | null = null;
let bedNodes: AudioNode[] = [];
let bedTimer: ReturnType<typeof setInterval> | null = null;
let bedRunning = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from a user gesture (Play / mute toggle) so browsers allow audio. */
export function unlockSurveyAudio() {
  getCtx();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    // Warm voices list on some browsers
    window.speechSynthesis.getVoices();
  }
}

export function setSurveyMuted(next: boolean) {
  muted = next;
  if (typeof window !== "undefined") {
    localStorage.setItem("larvae-survey-muted", next ? "1" : "0");
  }
  if (next) {
    stopBedMusic();
    stopAnnounceAudio();
  }
}

export function getSurveyMuted(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem("larvae-survey-muted") === "1") {
    muted = true;
  }
  return muted;
}

function env(ac: AudioContext, t0: number, attack: number, hold: number, release: number, peak = 0.18) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(peak * 0.7, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  return g;
}

function tone(
  ac: AudioContext,
  freq: number,
  t0: number,
  dur: number,
  type: OscillatorType = "sine",
  peak = 0.16,
  dest?: AudioNode
) {
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  const g = env(ac, t0, 0.012, Math.max(0.02, dur * 0.35), Math.max(0.08, dur * 0.55), peak);
  o.connect(g);
  g.connect(dest || ac.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function softFilter(ac: AudioContext) {
  const f = ac.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 3200;
  f.Q.value = 0.7;
  f.connect(ac.destination);
  return f;
}

function playHit(ac: AudioContext) {
  const t = ac.currentTime;
  const out = softFilter(ac);
  tone(ac, 1046.5, t, 0.22, "triangle", 0.14, out);
  tone(ac, 1318.5, t + 0.05, 0.28, "sine", 0.11, out);
}

function playStrike(ac: AudioContext, out = false) {
  const t = ac.currentTime;
  const dest = softFilter(ac);
  tone(ac, out ? 110 : 130, t, 0.28, "triangle", 0.2, dest);
  tone(ac, out ? 116 : 138, t, 0.22, "sine", 0.1, dest);
  if (out) {
    tone(ac, 98, t + 0.18, 0.35, "triangle", 0.16, dest);
  }
}

function playTick(ac: AudioContext) {
  const t = ac.currentTime;
  tone(ac, 880, t, 0.06, "sine", 0.05);
}

function playReveal(ac: AudioContext) {
  const t = ac.currentTime;
  const out = softFilter(ac);
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => tone(ac, f, t + i * 0.07, 0.2, "triangle", 0.09, out));
}

function playFastMoney(ac: AudioContext) {
  const t = ac.currentTime;
  const out = softFilter(ac);
  tone(ac, 698.46, t, 0.18, "triangle", 0.14, out);
  tone(ac, 932.33, t + 0.1, 0.28, "sine", 0.12, out);
}

function playFmHit(ac: AudioContext) {
  const t = ac.currentTime;
  const out = softFilter(ac);
  tone(ac, 1174.7, t, 0.2, "triangle", 0.13, out);
  tone(ac, 1568, t + 0.06, 0.26, "sine", 0.1, out);
}

function playFmMiss(ac: AudioContext) {
  const t = ac.currentTime;
  tone(ac, 185, t, 0.22, "triangle", 0.14);
  tone(ac, 175, t + 0.04, 0.2, "sine", 0.08);
}

function playBonus(ac: AudioContext) {
  const t = ac.currentTime;
  const out = softFilter(ac);
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((f, i) => tone(ac, f, t + i * 0.09, 0.32, i % 2 ? "sine" : "triangle", 0.11, out));
}

function playStart(ac: AudioContext) {
  const t = ac.currentTime;
  const out = softFilter(ac);
  tone(ac, 392, t, 0.2, "triangle", 0.1, out);
  tone(ac, 523.25, t + 0.12, 0.22, "triangle", 0.11, out);
  tone(ac, 659.25, t + 0.24, 0.3, "sine", 0.12, out);
}

function playResults(ac: AudioContext) {
  const t = ac.currentTime;
  const out = softFilter(ac);
  tone(ac, 523.25, t, 0.25, "triangle", 0.1, out);
  tone(ac, 659.25, t + 0.14, 0.28, "sine", 0.1, out);
  tone(ac, 783.99, t + 0.28, 0.4, "triangle", 0.12, out);
}

export function playSurveyCue(cue: Cue) {
  if (muted) return;
  const ac = getCtx();
  if (!ac) return;
  try {
    switch (cue) {
      case "hit":
        playHit(ac);
        break;
      case "strike":
        playStrike(ac, false);
        break;
      case "strikeOut":
        playStrike(ac, true);
        break;
      case "tick":
        playTick(ac);
        break;
      case "reveal":
        playReveal(ac);
        break;
      case "fastMoney":
        playFastMoney(ac);
        break;
      case "fmHit":
        playFmHit(ac);
        break;
      case "fmMiss":
        playFmMiss(ac);
        break;
      case "bonus":
        playBonus(ac);
        break;
      case "start":
        playStart(ac);
        break;
      case "results":
        playResults(ac);
        break;
    }
  } catch {
    // Audio must never break gameplay
  }
}

/* ─── Announcer (neural TTS → browser fallback) ───────────────────── */
// Prefer /api/larvae-survey/announce (ElevenLabs or Gemini neural voice).
// Browser speechSynthesis is only the fallback when the API is unavailable.

const FEMALE_VOICE_RE =
  /samantha|karen|moira|fiona|tessa|victoria|veena|aria|jenny|emma|sara|sonia|hazel|susan|catherine|serena|google uk english female|microsoft (aria|jenny|emma)|female/i;
const MALE_VOICE_RE =
  /male|daniel|david|alex|fred|tom|mark|guy|ravi|george|google us english$|microsoft (david|mark|guy|james|zira)/i;

function scoreVoice(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (/^en/i.test(v.lang)) s += 10;
  if (/en(-|_)US/i.test(v.lang)) s += 3;
  if (/en(-|_)GB/i.test(v.lang)) s += 4;
  if (FEMALE_VOICE_RE.test(v.name)) s += 50;
  if (MALE_VOICE_RE.test(v.name)) s -= 40;
  if (/zira|compact|novelty|whisper|bad news|bells|zarvox|trinoids|boing/i.test(v.name)) s -= 50;
  if (/neural|online|natural|premium/i.test(v.name)) s += 8;
  return s;
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const ranked = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return ranked[0] || null;
}

function duckBed(duck: boolean) {
  if (!bedGain || !ctx) return;
  const t = ctx.currentTime;
  bedGain.gain.cancelScheduledValues(t);
  bedGain.gain.linearRampToValueAtTime(duck ? 0.02 : 0.055, t + 0.12);
}

let announceAudio: HTMLAudioElement | null = null;
let announceToken = 0;

function stopAnnounceAudio() {
  if (announceAudio) {
    try {
      announceAudio.pause();
      announceAudio.src = "";
    } catch {
      /* ignore */
    }
    announceAudio = null;
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function announceBrowser(line: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    duckBed(false);
    return;
  }
  try {
    window.speechSynthesis.cancel();
    duckBed(true);
    const spoken = line
      .replace(/\s*—\s*/g, ". ")
      .replace(/\s*\.\.\.\s*/g, "... ")
      .trim();

    const speak = () => {
      const u = new SpeechSynthesisUtterance(spoken);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 0.95;
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.onend = () => duckBed(false);
      u.onerror = () => duckBed(false);
      window.speechSynthesis.speak(u);
    };

    if (!window.speechSynthesis.getVoices().length) {
      const onReady = () => {
        window.speechSynthesis.removeEventListener("voiceschanged", onReady);
        speak();
      };
      window.speechSynthesis.addEventListener("voiceschanged", onReady);
      window.setTimeout(() => {
        window.speechSynthesis.removeEventListener("voiceschanged", onReady);
        speak();
      }, 300);
      return;
    }
    speak();
  } catch {
    duckBed(false);
  }
}

/** Short game-show line. Neural TTS when available; browser fallback otherwise. */
export function announce(line: string, voiceId?: string) {
  if (muted || typeof window === "undefined") return;
  const spoken = line.trim();
  if (!spoken) return;

  const token = ++announceToken;
  stopAnnounceAudio();
  duckBed(true);

  void (async () => {
    try {
      const res = await fetch("/api/larvae-survey/announce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: spoken,
          ...(voiceId ? { voiceId } : {}),
        }),
      });
      if (token !== announceToken) return;
      if (!res.ok) throw new Error(`tts ${res.status}`);
      const blob = await res.blob();
      if (token !== announceToken) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      announceAudio = audio;
      audio.onended = () => {
        if (token === announceToken) duckBed(false);
        URL.revokeObjectURL(url);
        if (announceAudio === audio) announceAudio = null;
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (announceAudio === audio) announceAudio = null;
        if (token === announceToken) announceBrowser(spoken);
      };
      await audio.play();
    } catch {
      if (token === announceToken) announceBrowser(spoken);
    }
  })();
}

/** Play a larva answer in its assigned ElevenLabs voice (manual play — saves credits). */
export function speakLarva(line: string, voiceId?: string) {
  announce(line, voiceId);
}

/* ─── Soft bed music loop ─────────────────────────────────────────── */

function playBedBar(ac: AudioContext, dest: AudioNode) {
  const t = ac.currentTime + 0.02;
  // Warm C major-ish ostinato — quiet, nostalgic without copying any theme
  const pattern: [number, number, number][] = [
    [261.63, 0, 0.35],
    [329.63, 0.35, 0.3],
    [392.0, 0.7, 0.35],
    [329.63, 1.1, 0.3],
    [293.66, 1.5, 0.4],
    [349.23, 2.0, 0.35],
    [392.0, 2.4, 0.45],
  ];
  for (const [freq, offset, dur] of pattern) {
    tone(ac, freq, t + offset, dur, "triangle", 0.045, dest);
    tone(ac, freq * 0.5, t + offset, dur * 1.1, "sine", 0.025, dest);
  }
}

export function startBedMusic() {
  if (muted) return;
  const ac = getCtx();
  if (!ac || bedRunning) return;
  bedRunning = true;

  bedGain = ac.createGain();
  bedGain.gain.value = 0.055;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  bedGain.connect(filter);
  filter.connect(ac.destination);
  bedNodes = [bedGain, filter];

  playBedBar(ac, bedGain);
  bedTimer = setInterval(() => {
    if (!bedRunning || muted || !bedGain) return;
    playBedBar(ac, bedGain);
  }, 2900);
}

export function stopBedMusic() {
  bedRunning = false;
  if (bedTimer) {
    clearInterval(bedTimer);
    bedTimer = null;
  }
  for (const n of bedNodes) {
    try {
      n.disconnect();
    } catch {
      /* ignore */
    }
  }
  bedNodes = [];
  bedGain = null;
}
