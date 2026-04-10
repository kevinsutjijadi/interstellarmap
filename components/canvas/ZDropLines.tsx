"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type Props = {
  positions: Float32Array;
  count: number;
  visible: boolean;
  /** When true, vertex positions are refreshed from `positions` every frame (map ly ↔ ship-time blend). */
  dynamicPositions?: boolean;
};

function fillDropLinePositions(pos: Float32Array, positions: Float32Array, count: number) {
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    const o = i * 6;
    pos[o] = x;
    pos[o + 1] = y;
    pos[o + 2] = z;
    pos[o + 3] = x;
    pos[o + 4] = 0;
    pos[o + 5] = z;
  }
}

export function ZDropLines({ positions, count, visible, dynamicPositions }: Props) {
  const linesRef = useRef<THREE.LineSegments>(null);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    if (count === 0) return g;
    const pos = new Float32Array(count * 6);
    fillDropLinePositions(pos, positions, count);
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [positions, count]);

  useFrame(() => {
    if (!dynamicPositions || count === 0) return;
    const g = linesRef.current?.geometry;
    const attr = g?.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!attr?.array) return;
    fillDropLinePositions(attr.array as Float32Array, positions, count);
    attr.needsUpdate = true;
  });

  useLayoutEffect(() => {
    const o = linesRef.current;
    if (o) o.raycast = () => {};
  });

  if (count === 0 || !visible) return null;

  return (
    <lineSegments ref={linesRef} geometry={geometry} frustumCulled={false}>
      <lineBasicMaterial color="#3d3a44" transparent opacity={0.35} depthWrite={false} />
    </lineSegments>
  );
}
