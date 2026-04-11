"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef, type MutableRefObject } from "react";

const DEFAULT_DURATION_SEC = 0.55;

type MapBlendTickerProps = {
  targetShipTime: boolean;
  alphaRef: MutableRefObject<number>;
  durationSec?: number;
};

/** Linear ramp of alpha toward 0 (ly) or 1 (ship time). */
export function MapBlendTicker({
  targetShipTime,
  alphaRef,
  durationSec = DEFAULT_DURATION_SEC,
}: MapBlendTickerProps) {
  // Run before MapBlendCompute (lower priority value = earlier).
  useFrame((_, dt) => {
    const goal = targetShipTime ? 1 : 0;
    const step = durationSec > 1e-6 ? dt / durationSec : 1;
    if (alphaRef.current < goal) {
      alphaRef.current = Math.min(goal, alphaRef.current + step);
    } else if (alphaRef.current > goal) {
      alphaRef.current = Math.max(goal, alphaRef.current - step);
    }
  }, -100);
  return null;
}

type MapBlendComputeProps = {
  positionsLy: Float32Array;
  positionsShip: Float32Array;
  count: number;
  alphaRef: MutableRefObject<number>;
  outPositions: Float32Array;
  maxRadiusLy: number;
  maxRadiusShip: number;
  maxRadiusOutRef: MutableRefObject<number>;
};

export function smoothstep01(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Runs before stars (negative priority): writes lerped positions and blended grid extent.
 */
export function MapBlendCompute({
  positionsLy,
  positionsShip,
  count,
  alphaRef,
  outPositions,
  maxRadiusLy,
  maxRadiusShip,
  maxRadiusOutRef,
}: MapBlendComputeProps) {
  useFrame(() => {
    const w = smoothstep01(alphaRef.current);
    for (let i = 0; i < count; i++) {
      const j = i * 3;
      const lx = positionsLy[j]!;
      const ly = positionsLy[j + 1]!;
      const lz = positionsLy[j + 2]!;
      const sx = positionsShip[j]!;
      const sy = positionsShip[j + 1]!;
      const sz = positionsShip[j + 2]!;
      outPositions[j] = lx + (sx - lx) * w;
      outPositions[j + 1] = ly + (sy - ly) * w;
      outPositions[j + 2] = lz + (sz - lz) * w;
    }
    maxRadiusOutRef.current = maxRadiusLy + (maxRadiusShip - maxRadiusLy) * w;
  }, -50);
  return null;
}

type InitBlendAlphaProps = {
  targetShipTime: boolean;
  alphaRef: MutableRefObject<number>;
  /** Bump when star catalog reloads. */
  dataEpoch: number;
};

/** Snap alpha when the star catalog loads; map toggles are handled by MapBlendTicker only. */
export function InitBlendAlphaOnData({ targetShipTime, alphaRef, dataEpoch }: InitBlendAlphaProps) {
  const targetRef = useRef(targetShipTime);
  targetRef.current = targetShipTime;
  useLayoutEffect(() => {
    alphaRef.current = targetRef.current ? 1 : 0;
  }, [dataEpoch, alphaRef]);
  return null;
}

type InitFlatBlendAlphaProps = {
  flatMapTarget: boolean;
  alphaRef: MutableRefObject<number>;
  dataEpoch: number;
};

/** Snap flat-map blend when the star catalog reloads. */
export function InitFlatBlendAlphaOnData({ flatMapTarget, alphaRef, dataEpoch }: InitFlatBlendAlphaProps) {
  const targetRef = useRef(flatMapTarget);
  targetRef.current = flatMapTarget;
  useLayoutEffect(() => {
    alphaRef.current = targetRef.current ? 1 : 0;
  }, [dataEpoch, alphaRef]);
  return null;
}

type FlatMapBlendTickerProps = {
  flatMapTarget: boolean;
  alphaRef: MutableRefObject<number>;
  durationSec?: number;
};

/** Same ramp as {@link MapBlendTicker}, for flat XZ projection vs 3D. */
export function FlatMapBlendTicker({
  flatMapTarget,
  alphaRef,
  durationSec = DEFAULT_DURATION_SEC,
}: FlatMapBlendTickerProps) {
  useFrame((_, dt) => {
    const goal = flatMapTarget ? 1 : 0;
    const step = durationSec > 1e-6 ? dt / durationSec : 1;
    if (alphaRef.current < goal) {
      alphaRef.current = Math.min(goal, alphaRef.current + step);
    } else if (alphaRef.current > goal) {
      alphaRef.current = Math.max(goal, alphaRef.current - step);
    }
  }, -100);
  return null;
}

type MapFlatXzPlaneProps = {
  /** 0 = 3D (after ly/ship blend), 1 = full XZ projection; animated by {@link FlatMapBlendTicker}. */
  alphaRef: MutableRefObject<number>;
  count: number;
  positions: Float32Array;
  maxRadiusOutRef: MutableRefObject<number>;
};

/**
 * After ly/ship blend: lerps each star toward projection onto the XZ ground plane (y=0) while keeping
 * Sun distance r = |p| and the azimuth in XZ. Points on the ±Y axis map to (±r, 0, 0) at w=1.
 * Updates `maxRadiusOutRef` from max scene extent (≥ 50 ly) when w > 0.
 */
export function MapFlatXzPlane({
  alphaRef,
  count,
  positions,
  maxRadiusOutRef,
}: MapFlatXzPlaneProps) {
  useFrame(() => {
    const w = smoothstep01(alphaRef.current);
    if (w <= 1e-12) return;
    const eps = 1e-18;
    let maxExtent = 0;
    for (let i = 0; i < count; i++) {
      const j = i * 3;
      const x = positions[j]!;
      const y = positions[j + 1]!;
      const z = positions[j + 2]!;
      const r = Math.hypot(x, y, z);
      const rho = Math.hypot(x, z);
      let fx: number;
      let fy: number;
      let fz: number;
      if (rho > eps) {
        const s = r / rho;
        fx = x * s;
        fy = 0;
        fz = z * s;
      } else {
        const sgn = y >= 0 ? 1 : -1;
        fx = sgn * r;
        fy = 0;
        fz = 0;
      }
      const px = x + (fx - x) * w;
      const py = y + (fy - y) * w;
      const pz = z + (fz - z) * w;
      positions[j] = px;
      positions[j + 1] = py;
      positions[j + 2] = pz;
      const horiz = Math.hypot(px, pz);
      const rad = Math.hypot(px, py, pz);
      const e = Math.max(horiz, rad);
      if (e > maxExtent) maxExtent = e;
    }
    maxRadiusOutRef.current = Math.max(maxExtent, 50);
  }, -45);
  return null;
}

export { DEFAULT_DURATION_SEC as MAP_COORD_BLEND_DURATION_SEC };
