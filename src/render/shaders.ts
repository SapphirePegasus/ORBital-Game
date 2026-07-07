/**
 * SkSL runtime shaders (Skia RuntimeEffect) — the "realistic" rendering tier.
 *
 * Design rules:
 *  - Every effect is compiled ONCE at module load; a compile failure logs and
 *    returns null, and every caller must fall back to the vector/gradient
 *    tier. Shaders are an enhancement, never a hard dependency — this is also
 *    the graphics-quality "low" path on weak devices.
 *  - Uniforms are packed as flat number arrays IN DECLARATION ORDER (the
 *    Skia 2.6 `makeShader(uniforms: number[])` contract).
 *  - Planet shaders shade a unit sphere analytically: rotating longitude via
 *    a time uniform, key-lit diffuse, and fresnel-style atmospheric rim.
 */
import { Skia, type SkRuntimeEffect, type SkShader } from '@shopify/react-native-skia';
import { reportError } from '../observability/errorReporter';

const NOISE_LIB = `
float hash(float2 p, float seed) {
  return fract(sin(dot(p, float2(127.1, 311.7)) + seed) * 43758.5453);
}
float vnoise(float2 p, float seed) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i, seed), hash(i + float2(1.0, 0.0), seed), u.x),
    mix(hash(i + float2(0.0, 1.0), seed), hash(i + float2(1.0, 1.0), seed), u.x),
    u.y);
}
float fbm(float2 p, float seed) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p, seed);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}
`;

/** Rocky worlds (planet, dead planet): noisy terrain, terminator, rim glow. */
const ROCKY_SRC = `
uniform float2 u_center;
uniform float  u_radius;
uniform float  u_seed;
uniform float  u_time;
uniform float3 u_base;
uniform float3 u_dark;
uniform float3 u_rim;
${NOISE_LIB}
half4 main(float2 xy) {
  float2 p = (xy - u_center) / u_radius;
  float r2 = dot(p, p);
  if (r2 > 1.0) { return half4(0.0); }
  float z = sqrt(1.0 - r2);
  float lon = atan(p.x, z) + u_time;
  float lat = p.y;
  float n = fbm(float2(lon * 1.7, lat * 2.4), u_seed);
  float3 surf = mix(u_dark, u_base, smoothstep(0.28, 0.78, n));
  // Sparse crater dimples.
  float crater = smoothstep(0.82, 0.98, vnoise(float2(lon * 5.0, lat * 5.0), u_seed + 7.0));
  surf = mix(surf, u_dark * 0.7, crater * 0.6);
  float3 nrm = float3(p.x, p.y, z);
  float diff = clamp(dot(nrm, normalize(float3(-0.55, -0.55, 0.62))), 0.0, 1.0);
  float3 col = surf * (0.24 + 0.9 * diff);
  float rim = pow(1.0 - z, 2.4);
  col += u_rim * rim;
  return half4(col, 1.0);
}`;

/** Gas giants: flowing latitude bands, storms, heavy atmospheric rim. */
const GAS_SRC = `
uniform float2 u_center;
uniform float  u_radius;
uniform float  u_seed;
uniform float  u_time;
uniform float3 u_base;
uniform float3 u_dark;
uniform float3 u_rim;
${NOISE_LIB}
half4 main(float2 xy) {
  float2 p = (xy - u_center) / u_radius;
  float r2 = dot(p, p);
  if (r2 > 1.0) { return half4(0.0); }
  float z = sqrt(1.0 - r2);
  float lon = atan(p.x, z) + u_time * 0.6;
  float lat = p.y;
  // Band flow: latitude stripes warped by drifting noise.
  float warp = fbm(float2(lon * 1.2 + u_time * 0.12, lat * 3.0), u_seed) * 1.6;
  float band = sin(lat * 9.0 + warp * 2.2 + u_seed);
  float storms = smoothstep(0.72, 0.95, vnoise(float2(lon * 3.0, lat * 6.0), u_seed + 3.0));
  float3 surf = mix(u_dark, u_base, band * 0.5 + 0.5);
  surf = mix(surf, u_rim, storms * 0.35);
  float3 nrm = float3(p.x, p.y, z);
  float diff = clamp(dot(nrm, normalize(float3(-0.55, -0.55, 0.62))), 0.0, 1.0);
  float3 col = surf * (0.3 + 0.8 * diff);
  float rim = pow(1.0 - z, 1.8);
  col += u_rim * rim * 1.15;
  return half4(col, 1.0);
}`;

/** Stars & supernovae: hot core, granulated surface, animated corona edge. */
const STAR_SRC = `
uniform float2 u_center;
uniform float  u_radius;
uniform float  u_seed;
uniform float  u_time;
uniform float3 u_base;
uniform float3 u_dark;
uniform float3 u_rim;
${NOISE_LIB}
half4 main(float2 xy) {
  float2 p = (xy - u_center) / u_radius;
  float r = length(p);
  if (r > 1.0) { return half4(0.0); }
  float gran = fbm(p * 5.0 + float2(u_time * 0.25, -u_time * 0.18), u_seed);
  float3 col = mix(u_base, u_rim, gran * 0.55);
  col = mix(float3(1.0, 0.98, 0.92), col, smoothstep(0.0, 0.55, r));
  float edge = smoothstep(0.72, 1.0, r);
  float lick = fbm(float2(atan(p.y, p.x) * 2.5 + u_time * 0.4, r * 6.0), u_seed + 11.0);
  col = mix(col, u_dark, edge * (0.35 + 0.4 * lick));
  return half4(col, 1.0);
}`;

/**
 * Nebula field for background BAKING (not per-frame): domain-warped fbm
 * clouds in two palette colors with an alpha-density channel.
 */
const NEBULA_SRC = `
uniform float2 u_size;
uniform float  u_seed;
uniform float3 u_colA;
uniform float3 u_colB;
uniform float  u_density;
uniform float  u_scale;
${NOISE_LIB}
half4 main(float2 xy) {
  float2 uv = xy / u_size.y * u_scale;
  float2 warp = float2(
    fbm(uv * 1.4 + float2(3.7, 1.2), u_seed),
    fbm(uv * 1.4 + float2(8.1, 5.9), u_seed + 5.0));
  float n = fbm(uv * 2.0 + warp * 1.8, u_seed + 9.0);
  float d = smoothstep(0.35, 0.85, n) * u_density;
  float3 col = mix(u_colA, u_colB, fbm(uv * 1.1 + warp, u_seed + 13.0));
  // Premultiplied output: color scaled by coverage.
  return half4(col * d, d);
}`;

const compile = (name: string, src: string): SkRuntimeEffect | null => {
  try {
    const effect = Skia.RuntimeEffect.Make(src);
    if (!effect) reportError(new Error(`shader compile returned null: ${name}`));
    return effect;
  } catch (err) {
    reportError(err, { shader: name });
    return null;
  }
};

export const effects = {
  rocky: compile('rocky', ROCKY_SRC),
  gas: compile('gas', GAS_SRC),
  star: compile('star', STAR_SRC),
  nebula: compile('nebula', NEBULA_SRC),
} as const;

/** Hex "#RRGGBB" → normalized [r, g, b]. Bad input → mid gray (never throws). */
export const hexToRgb01 = (hex: string): [number, number, number] => {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m || !m[1]) return [0.5, 0.5, 0.5];
  const v = parseInt(m[1], 16);
  return [((v >> 16) & 0xff) / 255, ((v >> 8) & 0xff) / 255, (v & 0xff) / 255];
};

/**
 * Planet-family shader instance. Uniform order MUST mirror the declarations:
 * center(2), radius, seed, time, base(3), dark(3), rim(3).
 */
export const makeBodyShader = (
  effect: SkRuntimeEffect | null,
  x: number,
  y: number,
  radius: number,
  seed: number,
  time: number,
  base: readonly [number, number, number],
  dark: readonly [number, number, number],
  rim: readonly [number, number, number],
): SkShader | null => {
  if (!effect) return null;
  return effect.makeShader([x, y, radius, seed, time, ...base, ...dark, ...rim]);
};
