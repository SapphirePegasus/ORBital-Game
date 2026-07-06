/**
 * Synthesizes every bundled sound as a 16-bit mono WAV — no licensed audio,
 * fully reproducible. Run: `npm run generate-audio`.
 * Replace any file in assets/audio/ with your own to reskin the soundscape.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'audio');
mkdirSync(OUT, { recursive: true });

const RATE = 22050;

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  writeFileSync(join(OUT, name), buf);
  console.log(`wrote ${name} (${(buf.length / 1024).toFixed(1)} kB)`);
}

const seconds = (s) => Math.floor(s * RATE);
const env = (i, n, attack = 0.01, release = 0.3) => {
  const t = i / RATE;
  const dur = n / RATE;
  const a = Math.min(1, t / attack);
  const r = Math.min(1, (dur - t) / release);
  return Math.max(0, Math.min(a, r));
};

// Deterministic noise so builds are reproducible.
let noiseState = 12345;
const noise = () => {
  noiseState = (noiseState * 1103515245 + 12345) & 0x7fffffff;
  return (noiseState / 0x3fffffff) - 1;
};

// ---- ambient-loop: slow evolving pad, seamless loop (~12 s) ----
{
  const n = seconds(12);
  const out = new Float32Array(n);
  const chord = [110, 164.81, 196, 246.94]; // A2 E3 G3 B3 — open, weightless
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let s = 0;
    for (let c = 0; c < chord.length; c++) {
      const f = chord[c];
      const vib = 1 + 0.002 * Math.sin(2 * Math.PI * (0.07 + c * 0.03) * t);
      const amp = 0.16 + 0.08 * Math.sin(2 * Math.PI * (0.05 + c * 0.021) * t + c);
      s += amp * Math.sin(2 * Math.PI * f * vib * t);
      s += amp * 0.35 * Math.sin(2 * Math.PI * f * 2 * vib * t); // soft octave shimmer
    }
    // faint stardust
    s += 0.015 * noise() * (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.11 * t));
    out[i] = s * 0.5;
  }
  // Crossfade tail into head for a click-free loop.
  const xf = seconds(0.8);
  for (let i = 0; i < xf; i++) {
    const t = i / xf;
    out[i] = out[i] * t + out[n - xf + i] * (1 - t);
  }
  writeWav('ambient-loop.wav', out.subarray(0, n - xf));
}

// ---- launch: rising whoosh ----
{
  const n = seconds(0.7);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = 90 + 700 * t * t;
    out[i] = (0.5 * Math.sin(2 * Math.PI * f * t) + 0.35 * noise() * t) * env(i, n, 0.02, 0.25);
  }
  writeWav('launch.wav', out);
}

// ---- boost: short punchy burst ----
{
  const n = seconds(0.3);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    out[i] = (0.5 * Math.sin(2 * Math.PI * (240 + 400 * t) * t) + 0.3 * noise()) * env(i, n, 0.005, 0.15);
  }
  writeWav('boost.wav', out);
}

// ---- coin: bright two-note chime ----
{
  const n = seconds(0.35);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = t < 0.08 ? 1318.5 : 1760; // E6 → A6
    out[i] = 0.45 * Math.sin(2 * Math.PI * f * t) * env(i, n, 0.004, 0.22);
  }
  writeWav('coin.wav', out);
}

// ---- capture: warm resolving triad ----
{
  const n = seconds(0.9);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let s = 0;
    for (const [f, d] of [[440, 0], [554.37, 0.09], [659.25, 0.18]]) {
      if (t > d) s += 0.3 * Math.sin(2 * Math.PI * f * (t - d)) * Math.exp(-3.2 * (t - d));
    }
    out[i] = s * env(i, n, 0.005, 0.3);
  }
  writeWav('capture.wav', out);
}

// ---- explosion: filtered noise thump ----
{
  const n = seconds(1.0);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    lp += (noise() - lp) * Math.max(0.02, 0.4 * Math.exp(-5 * t));
    const thump = 0.6 * Math.sin(2 * Math.PI * (70 * Math.exp(-6 * t)) * t);
    out[i] = (lp * 0.9 + thump) * env(i, n, 0.002, 0.5);
  }
  writeWav('explosion.wav', out);
}

// ---- warning: pulsing alarm tone ----
{
  const n = seconds(0.8);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const gate = Math.sin(2 * Math.PI * 6 * t) > 0 ? 1 : 0;
    out[i] = 0.35 * gate * Math.sin(2 * Math.PI * 880 * t) * env(i, n, 0.01, 0.1);
  }
  writeWav('warning.wav', out);
}

// ---- ui: soft tick ----
{
  const n = seconds(0.12);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    out[i] = 0.35 * Math.sin(2 * Math.PI * 1046.5 * t) * env(i, n, 0.002, 0.09);
  }
  writeWav('ui.wav', out);
}

console.log('All audio generated.');
