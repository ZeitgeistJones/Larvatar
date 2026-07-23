// lib/survey-sfx.ts
// Soft Family Feud–style cues for the survey game.
// Web Audio only — no asset files, no harsh buzzers. Meanings stay clear:
//   hit / flip  → bright soft ding
//   strike      → muted low thud + brief dissonance
//   tick        → quiet timer pulse (last 5s)
//   reveal      → short ascending cascade
//   fast money  → brighter two-note sting
//   bonus       → warm major arpeggio
//   fanfare     → soft game-start / results chime

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
}

export function setSurveyMuted(next: boolean) {
  muted = next;
  if (typeof window !== "undefined") {
    localStorage.setItem("larvae-survey-muted", next ? "1" : "0");
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
  // Soft “ding” — C6 → E6, short and clear
  tone(ac, 1046.5, t, 0.22, "triangle", 0.14, out);
  tone(ac, 1318.5, t + 0.05, 0.28, "sine", 0.11, out);
}

function playStrike(ac: AudioContext, out = false) {
  const t = ac.currentTime;
  const dest = softFilter(ac);
  // Muted thud + mild dissonance — reads as “wrong” without a game-show buzzer
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
