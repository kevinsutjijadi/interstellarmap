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

function smoothstep01(t: number): number {
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

type MapFlatXzPlaneProps = {
  enabledRef: MutableRefObject<boolean>;
  count: number;
  positions: Float32Array;
  maxRadiusOutRef: MutableRefObject<number>;
};

/**
 * After ly/ship blend: project onto the Three.js XZ ground plane (y=0) while keeping
 * Sun distance r = |p| and the azimuth in XZ (same angle as (x,z) viewed from above).
 * Points on the ±Y axis map to (±r, 0, 0). Updates `maxRadiusOutRef` from max scene extent (≥ 50 ly).
 */
export function MapFlatXzPlane({
  enabledRef,
  count,
  positions,
  maxRadiusOutRef,
}: MapFlatXzPlaneProps) {
  useFrame(() => {
    if (!enabledRef.current) return;
    const eps = 1e-18;
    let maxExtent = 0;
    for (let i = 0; i < count; i++) {
      const j = i * 3;
      const x = positions[j]!;
      const y = positions[j + 1]!;
      const z = positions[j + 2]!;
      const r = Math.hypot(x, y, z);
      const rho = Math.hypot(x, z);
      if (rho > eps) {
        const s = r / rho;
        positions[j] = x * s;
        positions[j + 1] = 0;
        positions[j + 2] = z * s;
      } else {
        const sgn = y >= 0 ? 1 : -1;
        positions[j] = sgn * r;
        positions[j + 1] = 0;
        positions[j + 2] = 0;
      }
      const rx = positions[j]!;
      const ry = positions[j + 1]!;
      const rz = positions[j + 2]!;
      const horiz = Math.hypot(rx, rz);
      const rad = Math.hypot(rx, ry, rz);
      const e = Math.max(horiz, rad);
      if (e > maxExtent) maxExtent = e;
    }
    maxRadiusOutRef.current = Math.max(maxExtent, 50);
  }, -45);
  return null;
}

export { DEFAULT_DURATION_SEC as MAP_COORD_BLEND_DURATION_SEC };
