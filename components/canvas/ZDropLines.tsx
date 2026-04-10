"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

type Props = {
  positions: Float32Array;
  count: number;
  visible: boolean;
};

export function ZDropLines({ positions, count, visible }: Props) {
  const linesRef = useRef<THREE.LineSegments>(null);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    if (count === 0) return g;
    const pos = new Float32Array(count * 6);
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
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [positions, count]);

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
