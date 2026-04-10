/**
 * Google Turbo colormap (sRGB), then linearized for Three.js instanceColor.
 * Polynomial matches the official GLSL approximation (no /255 — output is already ~[0,1] sRGB).
 * @see https://gist.githubusercontent.com/mikhailov-work/0d177465a8151eb6ede1768d51d476c7/raw/
 */

const K_RED_4 = [0.13572138, 4.6153926, -42.66032258, 132.13108234] as const;
const K_GREEN_4 = [0.09140261, 2.19418839, 4.84296658, -14.18503333] as const;
const K_BLUE_4 = [0.1066733, 12.64194608, -60.58204836, 110.36276771] as const;
const K_RED_2 = [-152.94239396, 59.28637943] as const;
const K_GREEN_2 = [4.27729857, 2.82956604] as const;
const K_BLUE_2 = [-89.90310912, 27.34824973] as const;

function srgbChannelToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function dot4(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

function dot2(a: readonly number[], b: readonly number[]): number {
  return a[0] * b[0] + a[1] * b[1];
}

/** t in [0, 1]: blue (near) → red (far). Writes linear RGB in [0, 1]. */
export function turboLinearRgb(t: number, out: { r: number; g: number; b: number }): void {
  const x = Math.min(1, Math.max(0, t));
  const x2 = x * x;
  const x3 = x2 * x;
  const v4 = [1, x, x2, x3];
  const v2 = [x2 * x2, x3 * x2];

  const rs = Math.min(1, Math.max(0, dot4(v4, K_RED_4) + dot2(v2, K_RED_2)));
  const gs = Math.min(1, Math.max(0, dot4(v4, K_GREEN_4) + dot2(v2, K_GREEN_2)));
  const bs = Math.min(1, Math.max(0, dot4(v4, K_BLUE_4) + dot2(v2, K_BLUE_2)));

  out.r = srgbChannelToLinear(rs);
  out.g = srgbChannelToLinear(gs);
  out.b = srgbChannelToLinear(bs);
}
