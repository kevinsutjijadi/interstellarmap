import * as THREE from "three";

export const LN5 = Math.log(5);

export type LyLodResult = {
  /** Continuous log5(d / dRef) */
  L: number;
  kf: number;
  stepFine: number;
  stepCoarse: number;
  /** Weight for fine (5^kf) grid, 0–1 */
  wFine: number;
  /** Weight for coarse (5^(kf+1)) grid, 0–1 */
  wCoarse: number;
};

/** Narrow smoothstep band on fractional octave: handoff without long overlap. */
export const GRID_LOD_BLEND_LO = 0.48;
export const GRID_LOD_BLEND_HI = 0.52;

/**
 * Crossfade weights: wFine + wCoarse === 1.
 * `frac` rises as camera distance rises (zoom out) within a 5^k octave, so coarse must
 * rise with `frac`: zoom out → major lines; zoom in → fine lines.
 */
export function gridLodBlendWeights(frac: number): { wFine: number; wCoarse: number } {
  const wCoarse = THREE.MathUtils.smoothstep(frac, GRID_LOD_BLEND_LO, GRID_LOD_BLEND_HI);
  const wFine = 1 - wCoarse;
  return { wFine, wCoarse };
}

/**
 * Extra screen-space line width (px) for coarse grid while it is fading out (zoom in).
 * Peaks mid–late in the coarse visibility ramp-down.
 */
export function coarseGridLineWidthExtra(wCoarse: number): number {
  const t = THREE.MathUtils.clamp(wCoarse, 0, 1);
  // Thickest while major grid is still visible but on its way out (late in fade).
  return 7.5 * Math.pow(t, 0.55) * Math.pow(1 - t, 0.42) * 2.4;
}

/** Float32 segment pairs → tuple list for drei Line (segments mode). */
export function flatSegmentsToLinePoints(
  positions: Float32Array,
): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i + 5 < positions.length; i += 6) {
    out.push(
      [positions[i]!, positions[i + 1]!, positions[i + 2]!],
      [positions[i + 3]!, positions[i + 4]!, positions[i + 5]!],
    );
  }
  return out;
}

const DEFAULT_K_MIN = -1;
const DEFAULT_K_MAX = 12;

/**
 * Logarithmic (base 5) LOD: zoom in → finer grid dominates; zoom out → coarser.
 * Fine step = 5^kf, coarse = 5^(kf+1) (major lines / labels every 5× fine).
 */
export function lyGridLod(
  distance: number,
  dRef: number,
  kMin = DEFAULT_K_MIN,
  kMax = DEFAULT_K_MAX,
): LyLodResult {
  const d = Math.max(distance, 1e-9);
  const L = Math.log(d / dRef) / LN5;
  const kf = THREE.MathUtils.clamp(Math.floor(L + 1e-10), kMin, kMax);
  const frac = L - Math.floor(L);
  const { wFine, wCoarse } = gridLodBlendWeights(frac);
  const stepFine = Math.pow(5, kf);
  const stepCoarse = Math.pow(5, kf + 1);
  return { L, kf, stepFine, stepCoarse, wFine, wCoarse };
}

/** Cap extent so line count stays bounded; bump step if needed. */
export function extentForGrid(
  cameraDist: number,
  dataExtent: number,
  step: number,
  maxLinesPerAxis = 180,
): number {
  let e = Math.min(
    Math.max(cameraDist * 3.5, dataExtent * 1.2, 20),
    5e6,
  );
  const lines = (2 * e) / step;
  if (lines > maxLinesPerAxis) {
    e = (maxLinesPerAxis / 2) * step;
  }
  return e;
}

/** If step still yields too many lines, use a coarser effective step (next 5^k). */
export function ensureLineBudget(
  extent: number,
  step: number,
  maxLinesPerAxis: number,
): number {
  let s = step;
  while ((2 * extent) / s > maxLinesPerAxis) {
    s *= 5;
  }
  return s;
}

export function buildPlaneXZGridLines(extent: number, step: number): Float32Array {
  const verts: number[] = [];
  const e = extent;
  const n0 = Math.ceil(e / step);
  for (let i = -n0; i <= n0; i++) {
    const x = i * step;
    if (Math.abs(x) > e + 1e-6) continue;
    verts.push(x, 0, -e, x, 0, e);
  }
  for (let j = -n0; j <= n0; j++) {
    const z = j * step;
    if (Math.abs(z) > e + 1e-6) continue;
    verts.push(-e, 0, z, e, 0, z);
  }
  return new Float32Array(verts);
}

/** Major positions along one axis for labeling: multiples of step, excluding 0, capped count. */
export function isMultipleStep(v: number, step: number): boolean {
  if (step < 1e-12) return true;
  const q = v / step;
  return Math.abs(q - Math.round(q)) < 1e-4;
}

export function axisLabelValues(
  extent: number,
  step: number,
  maxCount = 28,
): number[] {
  const out: number[] = [];
  const n = Math.min(Math.ceil(extent / step), maxCount);
  for (let i = 1; i <= n; i++) {
    const v = i * step;
    if (v <= extent + 1e-6) {
      out.push(v);
      out.push(-v);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Screen-space label sizing (Html without distanceFactor uses CSS px at scale 1). */
export const GRID_LABEL_FONT_MAJOR = "clamp(9px, 1.05vmin, 12px)";
export const GRID_LABEL_FONT_MINOR = "clamp(8px, 0.9vmin, 10.5px)";

/** Drei `<Html>` defaults to multi-million z-index; cap so HUD (e.g. z-20) stays on top. */
export const GRID_HTML_Z_INDEX_RANGE: [number, number] = [4, 16];

export function formatLyLabel(v: number): string {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  let body: string;
  if (a >= 1000 && Math.abs(a - Math.round(a / 1000) * 1000) < 1e-2) {
    body = `${Math.round(a / 1000)}k`;
  } else if (a >= 100 || Math.abs(a - Math.round(a)) < 1e-2) {
    body = `${Math.round(a)}`;
  } else if (a >= 10) {
    body = a.toFixed(1);
  } else if (a >= 1) {
    body = a.toFixed(2);
  } else {
    body = a.toFixed(3);
  }
  return `${sign}${body} ly`;
}

/** Grid tick label when scene units are ship proper-time years. */
export function formatShipYearLabel(v: number): string {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  let body: string;
  if (a >= 1000 && Math.abs(a - Math.round(a / 1000) * 1000) < 1e-2) {
    body = `${Math.round(a / 1000)}k`;
  } else if (a >= 100 || Math.abs(a - Math.round(a)) < 1e-2) {
    body = `${Math.round(a)}`;
  } else if (a >= 10) {
    body = a.toFixed(1);
  } else if (a >= 1) {
    body = a.toFixed(2);
  } else {
    body = a.toFixed(3);
  }
  return `${sign}${body} yr`;
}

export type GridUnit = "ly" | "shipYr";

export function formatGridAxisLabel(v: number, unit: GridUnit): string {
  return unit === "shipYr" ? formatShipYearLabel(v) : formatLyLabel(v);
}
