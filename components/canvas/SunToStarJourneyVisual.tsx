"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import {
  distanceLyForFractionOfTotalShipTime,
  gammaBetaAtDistanceAlongRoute,
  shipProperTimeYears,
  type FlightMode,
  type JourneyKinematicsParams,
  type JourneyKinematicsProfile,
} from "@/lib/relativisticTravel";
import type { JourneyLineHoverPayload } from "./journeyLineHoverPayload";
import { smoothstep01 } from "./MapCoordinateBlend";

export type SunToStarJourneyProps = {
  /** Display-space star position (ly / ship yr / blended while map animates). */
  positions: Float32Array;
  physicalPositions: Float32Array;
  index: number;
  distanceLy: number;
  mode: FlightMode;
  accelerationG: number;
  coastFraction: number;
  showVase: boolean;
  mapByShipProperTime: boolean;
  /** When map mode is animating, used to pick straight vs τ line and to hide vase mid-blend. */
  mapBlendAlphaRef?: RefObject<number>;
  mapTargetShipTime?: boolean;
  /** When true, vase aims at the flattened map position; τ spine is projected to XZ at each ring (mesh stays 3D). */
  flatMapXzPlane?: boolean;
  /** Animated 0↔1 toward flat map; vase/τ polyline wait until settled like {@link mapBlendAlphaRef}. */
  flatMapBlendAlphaRef?: RefObject<number>;
  journeyLineHover: JourneyLineHoverPayload | null;
  onJourneyLineHover: (payload: JourneyLineHoverPayload | null) => void;
  journeyHoverTooltipRef: RefObject<HTMLDivElement | null>;
};

const projWorld = new THREE.Vector3();
const LINE_SEGMENTS = 64;
const BLEND_SETTLE_EPS = 0.02;
const FLAT_XZ_EPS = 1e-18;

/** Same projection as MapFlatXzPlane: keep Sun distance, XZ azimuth, y=0. */
function flatXz(x: number, y: number, z: number): [number, number, number] {
  const r = Math.hypot(x, y, z);
  const rho = Math.hypot(x, z);
  if (rho > FLAT_XZ_EPS) {
    const s = r / rho;
    return [x * s, 0, z * s];
  }
  const sgn = y >= 0 ? 1 : -1;
  return [sgn * r, 0, 0];
}

function buildVaseGeometry(
  start: THREE.Vector3,
  end: THREE.Vector3,
  distanceLy: number,
  kinParams: JourneyKinematicsParams,
  segmentsAlong: number,
  radialSegments: number,
  mapByShipProperTime: boolean,
  physicalUnitDir: THREE.Vector3,
  flatMapXz: boolean,
): THREE.BufferGeometry {
  const tan = new THREE.Vector3().subVectors(end, start);
  const chordLen = tan.length();
  tan.normalize();
  const up = Math.abs(tan.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(up, tan).normalize();
  const binorm = new THREE.Vector3().crossVectors(tan, right).normalize();

  const r0Base = Math.min(4, 0.08 * chordLen);

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
    if (mapByShipProperTime) {
      const ty = shipProperTimeYears(dLy, kinParams) ?? 0;
      center.copy(physicalUnitDir).multiplyScalar(ty);
      if (flatMapXz) {
        const [fx, fy, fz] = flatXz(center.x, center.y, center.z);
        center.set(fx, fy, fz);
      }
    } else {
      center.lerpVectors(start, end, t);
    }

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
  physicalPositions,
  index,
  distanceLy,
  mode,
  accelerationG,
  coastFraction,
  showVase,
  mapByShipProperTime,
  mapBlendAlphaRef,
  mapTargetShipTime = false,
  flatMapXzPlane = false,
  flatMapBlendAlphaRef,
  journeyLineHover,
  onJourneyLineHover,
  journeyHoverTooltipRef,
}: SunToStarJourneyProps) {
  const { gl, camera } = useThree();

  const endRef = useRef(new THREE.Vector3());
  const cylGroupRef = useRef<THREE.Group>(null);
  const vaseMeshRef = useRef<THREE.Mesh>(null);
  const physicalUnitDir = useMemo(() => {
    const x = physicalPositions[index * 3] ?? 0;
    const y = physicalPositions[index * 3 + 1] ?? 0;
    const z = physicalPositions[index * 3 + 2] ?? 0;
    const v = new THREE.Vector3(x, y, z);
    const len = v.length();
    if (len < 1e-18) return new THREE.Vector3(1, 0, 0);
    return v.normalize();
  }, [physicalPositions, index]);

  const kinParams: JourneyKinematicsParams = useMemo(
    () => ({
      distanceLy,
      mode,
      accelerationG,
      coastFraction,
    }),
    [distanceLy, mode, accelerationG, coastFraction],
  );

  const kinProfile: JourneyKinematicsProfile = useMemo(
    () => ({
      mode,
      accelerationG,
      coastFraction,
    }),
    [mode, accelerationG, coastFraction],
  );

  const lyEndVec = useMemo(() => {
    const x = physicalPositions[index * 3] ?? 0;
    const y = physicalPositions[index * 3 + 1] ?? 0;
    const z = physicalPositions[index * 3 + 2] ?? 0;
    return new THREE.Vector3(x, y, z);
  }, [physicalPositions, index]);

  const shipTauEndVec = useMemo(() => {
    const ty = shipProperTimeYears(distanceLy, kinParams) ?? 0;
    return physicalUnitDir.clone().multiplyScalar(ty);
  }, [distanceLy, kinParams, physicalUnitDir]);

  const vaseGeo = useMemo(() => {
    if (!showVase) return null;
    const s = new THREE.Vector3(0, 0, 0);
    const rawEnd = mapByShipProperTime ? shipTauEndVec : lyEndVec;
    const endForVase = new THREE.Vector3();
    if (flatMapXzPlane) {
      const [ex, ey, ez] = flatXz(rawEnd.x, rawEnd.y, rawEnd.z);
      endForVase.set(ex, ey, ez);
    } else {
      endForVase.copy(rawEnd);
    }
    return buildVaseGeometry(
      s,
      endForVase,
      distanceLy,
      kinParams,
      96,
      20,
      mapByShipProperTime,
      physicalUnitDir,
      flatMapXzPlane,
    );
  }, [
    showVase,
    mapByShipProperTime,
    lyEndVec,
    shipTauEndVec,
    distanceLy,
    kinParams,
    physicalUnitDir,
    flatMapXzPlane,
  ]);

  useEffect(() => {
    return () => {
      vaseGeo?.dispose();
    };
  }, [vaseGeo]);

  const lineGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array((LINE_SEGMENTS + 1) * 3);
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    g.setDrawRange(0, 2);
    return g;
  }, []);

  const lineObject = useMemo(() => {
    const m = new THREE.LineBasicMaterial({
      color: "#ff8c00",
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      toneMapped: false,
    });
    const ln = new THREE.Line(lineGeom, m);
    ln.frustumCulled = false;
    return ln;
  }, [lineGeom]);

  useEffect(() => {
    return () => {
      lineGeom.dispose();
      (lineObject.material as THREE.Material).dispose();
    };
  }, [lineGeom, lineObject]);

  const markerMeshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const j = index * 3;
    endRef.current.set(positions[j] ?? 0, positions[j + 1] ?? 0, positions[j + 2] ?? 0);

    const mapGoal = mapTargetShipTime ? 1 : 0;
    const a = mapBlendAlphaRef?.current ?? mapGoal;
    const mapSettled = Math.abs(a - mapGoal) < BLEND_SETTLE_EPS;
    const flatGoal = flatMapXzPlane ? 1 : 0;
    const fa = flatMapBlendAlphaRef?.current ?? flatGoal;
    const flatSettled = Math.abs(fa - flatGoal) < BLEND_SETTLE_EPS;
    const settled = mapSettled && flatSettled;

    const posAttr = lineGeom.attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    let vertCount = 2;
    if (mapByShipProperTime && settled) {
      vertCount = LINE_SEGMENTS + 1;
      arr[0] = 0;
      arr[1] = 0;
      arr[2] = 0;
      for (let k = 1; k <= LINE_SEGMENTS; k++) {
        const t = k / LINE_SEGMENTS;
        const dLy = t * distanceLy;
        const ty = shipProperTimeYears(dLy, kinParams) ?? 0;
        const o = k * 3;
        let wx = physicalUnitDir.x * ty;
        let wy = physicalUnitDir.y * ty;
        let wz = physicalUnitDir.z * ty;
        if (flatMapXzPlane) {
          [wx, wy, wz] = flatXz(wx, wy, wz);
        }
        arr[o] = wx;
        arr[o + 1] = wy;
        arr[o + 2] = wz;
      }
    } else {
      arr[0] = 0;
      arr[1] = 0;
      arr[2] = 0;
      arr[3] = endRef.current.x;
      arr[4] = endRef.current.y;
      arr[5] = endRef.current.z;
    }
    lineGeom.setDrawRange(0, vertCount);
    posAttr.needsUpdate = true;

    const cyl = cylGroupRef.current;
    if (cyl) {
      const L = Math.max(endRef.current.length(), 1e-9);
      const pr = Math.max(0.08, Math.min(1.2, 0.04 * L));
      cyl.position.copy(endRef.current).normalize().multiplyScalar(L * 0.5);
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), endRef.current.clone().normalize());
      cyl.scale.set(pr, L, pr);
    }

    const Lm = Math.max(endRef.current.length(), 1e-9);
    const mr = Math.max(0.04, Math.min(0.25, Lm * 0.012));
    const marker = markerMeshRef.current;
    if (marker) {
      marker.scale.setScalar(mr / 0.04);
    }

    const vm = vaseMeshRef.current;
    if (vm) {
      vm.visible = showVase && settled;
    }

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

  const onChordPointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const eNow = endRef.current;
    const L2 = eNow.dot(eNow);
    if (L2 < 1e-18) return;

    let dLy: number;
    let wx: number;
    let wy: number;
    let wz: number;

    if (mapByShipProperTime) {
      const u = Math.min(1, Math.max(0, e.point.dot(eNow) / L2));
      const solved = distanceLyForFractionOfTotalShipTime(u, distanceLy, kinProfile);
      if (solved === null) return;
      dLy = solved;
      const ty = shipProperTimeYears(dLy, kinParams) ?? 0;
      wx = physicalUnitDir.x * ty;
      wy = physicalUnitDir.y * ty;
      wz = physicalUnitDir.z * ty;
      const flatGoalH = flatMapXzPlane ? 1 : 0;
      const faH = flatMapBlendAlphaRef?.current ?? flatGoalH;
      const wFlat = smoothstep01(faH);
      if (wFlat > 1e-9) {
        const [fx, fy, fz] = flatXz(wx, wy, wz);
        const om = 1 - wFlat;
        wx = wx * om + fx * wFlat;
        wy = wy * om + fy * wFlat;
        wz = wz * om + fz * wFlat;
      }
    } else {
      const t = Math.min(1, Math.max(0, e.point.dot(eNow) / L2));
      dLy = t * distanceLy;
      wx = eNow.x * t;
      wy = eNow.y * t;
      wz = eNow.z * t;
    }

    const kin = gammaBetaAtDistanceAlongRoute(dLy, kinParams);
    if (!kin) return;
    onJourneyLineHover({
      dLy,
      beta: kin.beta,
      gamma: kin.gamma,
      wx,
      wy,
      wz,
    });
  };

  const clearHover = () => onJourneyLineHover(null);

  return (
    <group>
      {showVase && vaseGeo && (
        <mesh ref={vaseMeshRef} geometry={vaseGeo} renderOrder={1}>
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

      <primitive object={lineObject} renderOrder={2} />

      <group ref={cylGroupRef} renderOrder={0}>
        <mesh
          onPointerMove={onChordPointerMove}
          onPointerOut={clearHover}
          onPointerLeave={clearHover}
          renderOrder={0}
        >
          <cylinderGeometry args={[1, 1, 1, 10, 1, false]} />
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
          ref={markerMeshRef}
          position={[journeyLineHover.wx, journeyLineHover.wy, journeyLineHover.wz]}
          renderOrder={4}
        >
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshBasicMaterial color="#fbbf24" toneMapped={false} depthTest />
        </mesh>
      )}
    </group>
  );
}
