"use client";

import { useFrame, useThree } from "@react-three/fiber";
import type { RefObject } from "react";

function formatCoordLy(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e6 || (a > 0 && a < 1e-3)) return n.toExponential(2);
  if (a >= 1000) return n.toFixed(1);
  return n.toFixed(2);
}

type Props = {
  labelRef: RefObject<HTMLElement | null>;
};

export function CameraPositionReporter({ labelRef }: Props) {
  const { camera } = useThree();

  useFrame(() => {
    const el = labelRef.current;
    if (!el) return;
    const { x, y, z } = camera.position;
    el.textContent = `Camera (ly)  x ${formatCoordLy(x)}   y ${formatCoordLy(y)}   z ${formatCoordLy(z)}`;
  });

  return null;
}
