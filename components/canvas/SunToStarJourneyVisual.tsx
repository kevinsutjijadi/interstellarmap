"use client";

import { Line } from "@react-three/drei";
import { useEffect, useMemo, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import {
  gammaBetaAtDistanceAlongRoute,
  type FlightMode,
  type JourneyKinematicsParams,
} from "@/lib/relativisticTravel";
import type { JourneyLineHoverPayload } from "./journeyLineHoverPayload";

export type SunToStarJourneyProps = {
  positions: Float32Array;
  index: number;
  distanceLy: number;
  mode: FlightMode;
  accelerationG: number;
  /** 0–1 */
  coastFraction: number;
  showVase: boolean;
  journeyLineHover: JourneyLineHoverPayload | null;
  onJourneyLineHover: (payload: JourneyLineHoverPayload | null) => void;
  journeyHoverTooltipRef: RefObject<HTMLDivElement | null>;
};

const projWorld = new THREE.Vector3();

function buildVaseGeometry(
  start: THREE.Vector3,
  end: THREE.Vector3,
  distanceLy: number,
  kinParams: JourneyKinematicsParams,
  segmentsAlong: number,
  radialSegments: number,
): THREE.BufferGeometry {
  const tan = new THREE.Vector3().subVectors(end, start);
  const chordLen = tan.length();
  tan.normalize();
  const up = Math.abs(tan.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(up, tan).normalize();
  const binorm = new THREE.Vector3().crossVectors(tan, right).normalize();

  const r0Base = Math.min(0.5, 0.08 * chordLen);

  const nRings = segmentsAlong + 1;
  const vertsPerRing = radialSegments + 1;
  const positions = new Float32Array(nRings * vertsPerRing * 3);
  const indices: number[] = [];

  const center = new THREE.Vector3();
  const offset = new THREE.Vector3();

  for (let i = 0; i < nRings; i++) {
    const t = i / segmentsAlong;
    const dLy = t * distanceLy;
    const kin = gammaBetaAtDistanceAlongRoute(dLy, kinParams);
    const gamma = kin?.gamma ?? 1;
    const r = Math.max(r0Base * 0.02, r0Base / Math.max(gamma, 1));
    center.lerpVectors(start, end, t);

    for (let s = 0; s <= radialSegments; s++) {
      const u = (s / radialSegments) * Math.PI * 2;
      const cx = Math.cos(u) * r;
      const sy = Math.sin(u) * r;
      offset.copy(right).multiplyScalar(cx).addScaledVector(binorm, sy);
      const idx = (i * vertsPerRing + s) * 3;
      positions[idx] = center.x + offset.x;
      positions[idx + 1] = center.y + offset.y;
      positions[idx + 2] = center.z + offset.z;
    }
  }

  for (let i = 0; i < segmentsAlong; i++) {
    for (let s = 0; s < radialSegments; s++) {
      const a0 = i * vertsPerRing + s;
      const a1 = a0 + 1;
      const b0 = (i + 1) * vertsPerRing + s;
      const b1 = b0 + 1;
      indices.push(a0, b0, a1, a1, b0, b1);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function SunToStarJourneyVisual({
  positions,
  index,
  distanceLy,
  mode,
  accelerationG,
  coastFraction,
  showVase,
  journeyLineHover,
  onJourneyLineHover,
  journeyHoverTooltipRef,
}: SunToStarJourneyProps) {
  const { gl, camera } = useThree();

  const end = useMemo(() => {
    const x = positions[index * 3] ?? 0;
    const y = positions[index * 3 + 1] ?? 0;
    const z = positions[index * 3 + 2] ?? 0;
    return new THREE.Vector3(x, y, z);
  }, [positions, index]);

  const linePoints = useMemo(
    () =>
      [
        [0, 0, 0] as [number, number, number],
        [end.x, end.y, end.z] as [number, number, number],
      ],
    [end],
  );

  const kinParams: JourneyKinematicsParams = useMemo(
    () => ({
      distanceLy,
      mode,
      accelerationG,
      coastFraction,
    }),
    [distanceLy, mode, accelerationG, coastFraction],
  );

  const vaseGeo = useMemo(() => {
    if (!showVase) return null;
    const s = new THREE.Vector3(0, 0, 0);
    return buildVaseGeometry(s, end, distanceLy, kinParams, 96, 20);
  }, [showVase, end, distanceLy, kinParams]);

  useEffect(() => {
    return () => {
      vaseGeo?.dispose();
    };
  }, [vaseGeo]);

  useFrame(() => {
    const labelEl = journeyHoverTooltipRef?.current ?? null;
    if (!labelEl || journeyLineHover === null) {
      if (labelEl) labelEl.style.visibility = "hidden";
      return;
    }
    const { wx, wy, wz } = journeyLineHover;
    projWorld.set(wx, wy, wz).project(camera);
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

  const pickRadius = useMemo(() => {
    const L = end.length();
    return Math.max(0.08, Math.min(1.2, 0.04 * L));
  }, [end]);

  const cylinderHeight = useMemo(() => end.length(), [end]);
  const midPoint = useMemo(() => end.clone().multiplyScalar(0.5), [end]);
  const cylinderQuat = useMemo(() => {
    const dir = new THREE.Vector3().copy(end).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }, [end]);

  const markerRadius = useMemo(() => {
    const L = end.length();
    return Math.max(0.04, Math.min(0.25, L * 0.012));
  }, [end]);

  const onChordPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const L2 = end.dot(end);
    if (L2 < 1e-18) return;
    const t = Math.min(1, Math.max(0, e.point.dot(end) / L2));
    const dLy = t * distanceLy;
    const kin = gammaBetaAtDistanceAlongRoute(dLy, kinParams);
    if (!kin) return;
    onJourneyLineHover({
      dLy,
      beta: kin.beta,
      gamma: kin.gamma,
      wx: end.x * t,
      wy: end.y * t,
      wz: end.z * t,
    });
  };

  const clearHover = () => onJourneyLineHover(null);

  return (
    <group>
      {showVase && vaseGeo && (
        <mesh geometry={vaseGeo} renderOrder={1}>
          <meshBasicMaterial
            color="#2dd4bf"
            transparent
            opacity={0.42}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      )}

      <Line
        points={linePoints}
        color="#ff8c00"
        lineWidth={2}
        toneMapped={false}
        depthTest
        transparent
        opacity={0.95}
        renderOrder={2}
      />

      <group position={midPoint} quaternion={cylinderQuat}>
        <mesh
          onPointerMove={onChordPointerMove}
          onPointerOut={clearHover}
          onPointerLeave={clearHover}
          renderOrder={0}
        >
          <cylinderGeometry args={[pickRadius, pickRadius, cylinderHeight, 10, 1, false]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            depthTest
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {journeyLineHover !== null && (
        <mesh
          position={[journeyLineHover.wx, journeyLineHover.wy, journeyLineHover.wz]}
          renderOrder={4}
        >
          <sphereGeometry args={[markerRadius, 16, 16]} />
          <meshBasicMaterial color="#fbbf24" toneMapped={false} depthTest />
        </mesh>
      )}
    </group>
  );
}
