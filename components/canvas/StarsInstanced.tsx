"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { starDisplayName } from "./useStarData";

export type StarPickInfo = {
  index: number;
  name: string;
  distanceLy: number;
};

type Props = {
  /** Instance / hover positions (may be ship-time scaled). */
  positions: Float32Array;
  /** Physical ly from Sun for picks; defaults to `positions`. */
  physicalPositions?: Float32Array;
  mag: Float32Array;
  /** Linear RGB, 3 floats per instance (spectral type or distance turbo, etc.) */
  instanceRgb: Float32Array;
  proper: string[];
  bf: string[];
  count: number;
  orbitRef: RefObject<{ target: THREE.Vector3 } | null>;
  onStarClick?: (info: StarPickInfo) => void;
  /** Tooltip element rendered outside Canvas; R3F only accepts Three objects under Canvas. */
  hoverTooltipRef?: RefObject<HTMLDivElement | null>;
  onHoverStarIndex?: (index: number | null) => void;
};

const dummy = new THREE.Object3D();
const projWorld = new THREE.Vector3();

function magToScale(mag: number): number {
  const t = THREE.MathUtils.clamp((6.5 - mag) * 0.12, 0.35, 4);
  return t;
}

function distanceFromOriginLy(positions: Float32Array, index: number): number {
  const i = index * 3;
  const x = positions[i] ?? 0;
  const y = positions[i + 1] ?? 0;
  const z = positions[i + 2] ?? 0;
  return Math.hypot(x, y, z);
}

export function StarsInstanced({
  positions,
  physicalPositions,
  mag,
  instanceRgb,
  proper,
  bf,
  count,
  orbitRef,
  onStarClick,
  hoverTooltipRef,
  onHoverStarIndex,
}: Props) {
  const pickPositions = physicalPositions ?? positions;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const { gl, camera } = useThree();

  const instanceColorAttr = useMemo(() => {
    if (count === 0) return null;
    return new THREE.InstancedBufferAttribute(instanceRgb, 3);
  }, [count, instanceRgb]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !instanceColorAttr) return;
    mesh.instanceColor = instanceColorAttr;
    mesh.instanceColor.needsUpdate = true;
  }, [instanceColorAttr]);

  const baseScales = useMemo(() => {
    const a = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      a[i] = magToScale(mag[i] ?? 99);
    }
    return a;
  }, [count, mag]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    const target = orbitRef.current?.target;
    const dist = target
      ? camera.position.distanceTo(target)
      : camera.position.length();
    const zoomScale = THREE.MathUtils.clamp(dist * 0.001, 0.15, 180);

    let maxWorldExtent = 0;
    for (let i = 0; i < count; i++) {
      const bx = positions[i * 3]!;
      const by = positions[i * 3 + 1]!;
      const bz = positions[i * 3 + 2]!;
      const s = zoomScale * (baseScales[i] ?? 1);
      dummy.position.set(bx, by, bz);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const rFromSun = Math.hypot(bx, by, bz);
      const outer = rFromSun + s;
      if (outer > maxWorldExtent) maxWorldExtent = outer;
    }
    mesh.instanceMatrix.needsUpdate = true;

    // InstancedMesh raycast caches boundingSphere after first compute; it must match current
    // instance matrices or the early-out sphere test rejects all hits (breaks hover / click).
    if (!mesh.boundingSphere) mesh.boundingSphere = new THREE.Sphere();
    mesh.boundingSphere.center.set(0, 0, 0);
    mesh.boundingSphere.radius = Math.max(maxWorldExtent, 1);

    const labelEl = hoverTooltipRef?.current ?? null;
    if (!labelEl || hovered === null || hovered < 0 || hovered >= count) {
      if (labelEl) labelEl.style.visibility = "hidden";
      return;
    }
    const hx = positions[hovered * 3]!;
    const hy = positions[hovered * 3 + 1]!;
    const hz = positions[hovered * 3 + 2]!;
    projWorld.set(hx, hy, hz).project(camera);
    const ndcx = projWorld.x;
    const ndcy = projWorld.y;
    const ndcz = projWorld.z;
    const onScreen =
      ndcz >= -1 &&
      ndcz <= 1 &&
      ndcx >= -1 &&
      ndcx <= 1 &&
      ndcy >= -1 &&
      ndcy <= 1;
    if (!onScreen) {
      labelEl.style.visibility = "hidden";
      return;
    }
    const rect = gl.domElement.getBoundingClientRect();
    const vx = (ndcx * 0.5 + 0.5) * rect.width + rect.left;
    const vy = (-ndcy * 0.5 + 0.5) * rect.height + rect.top;
    labelEl.style.visibility = "visible";
    labelEl.style.left = `${vx}px`;
    labelEl.style.top = `${vy}px`;
  });

  const onPointerOut = useCallback(() => {
    setHovered(null);
    onHoverStarIndex?.(null);
    gl.domElement.style.cursor = "default";
  }, [gl, onHoverStarIndex]);

  const onPointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const id = e.instanceId;
      if (id === undefined || id < 0) {
        setHovered(null);
        onHoverStarIndex?.(null);
        gl.domElement.style.cursor = "default";
        return;
      }
      setHovered(id);
      onHoverStarIndex?.(id);
      gl.domElement.style.cursor = "pointer";
    },
    [gl, onHoverStarIndex],
  );

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const id = e.instanceId;
      if (id === undefined || id < 0 || !onStarClick) return;
      const name = starDisplayName(proper[id] ?? "", bf[id] ?? "");
      onStarClick({
        index: id,
        name,
        distanceLy: distanceFromOriginLy(pickPositions, id),
      });
    },
    [onStarClick, proper, bf, pickPositions],
  );

  if (count === 0) return null;

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, count]}
        frustumCulled={false}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
        onPointerDown={onPointerDown}
      >
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
