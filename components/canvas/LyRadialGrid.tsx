"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { LineSegments2 } from "three-stdlib";
import type { LineMaterial, OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  axisLabelValues,
  coarseGridLineWidthExtra,
  ensureLineBudget,
  extentForGrid,
  flatSegmentsToLinePoints,
  formatLyLabel,
  GRID_HTML_Z_INDEX_RANGE,
  GRID_LABEL_FONT_MAJOR,
  GRID_LABEL_FONT_MINOR,
  isMultipleStep,
  lyGridLod,
} from "@/lib/gridLy";

type Props = {
  maxDataRadius: number;
  orbitRef: RefObject<OrbitControlsImpl | null>;
  visible: boolean;
};

const D_REF = 45;
const CIRCLE_SEG = 96;

/** Label positions on the XZ plane: +X, −X, +Z, −Z (ly). */
const RADIAL_LABEL_DIRS: {
  key: string;
  pos: (r: number) => [number, number, number];
}[] = [
  { key: "px", pos: (r) => [r, 0, 0] },
  { key: "nx", pos: (r) => [-r, 0, 0] },
  { key: "pz", pos: (r) => [0, 0, r] },
  { key: "nz", pos: (r) => [0, 0, -r] },
];

const COARSE_LINE_BASE_PX = 0.8;
const FINE_OPACITY_PEAK = 0.36;
const COARSE_OPACITY_PEAK = 0.56;

function buildRadialFine(
  extent: number,
  step: number,
  segments: number,
  spokeEveryRad: number,
): Float32Array {
  const verts: number[] = [];
  const maxN = Math.ceil(extent / step);
  for (let n = 1; n <= maxN; n++) {
    const r = n * step;
    if (r > extent + 1e-6) continue;
    for (let s = 0; s < segments; s++) {
      const t0 = (s / segments) * Math.PI * 2;
      const t1 = ((s + 1) / segments) * Math.PI * 2;
      verts.push(
        r * Math.cos(t0),
        0,
        r * Math.sin(t0),
        r * Math.cos(t1),
        0,
        r * Math.sin(t1),
      );
    }
  }
  for (let a = 0; a < Math.PI * 2 - 1e-6; a += spokeEveryRad) {
    verts.push(0, 0, 0, extent * Math.cos(a), 0, extent * Math.sin(a));
  }
  return new Float32Array(verts);
}

function buildRadialCoarseRingsOnly(
  extent: number,
  step: number,
  segments: number,
): Float32Array {
  const verts: number[] = [];
  const maxN = Math.ceil(extent / step);
  for (let n = 1; n <= maxN; n++) {
    const r = n * step;
    if (r > extent + 1e-6) continue;
    for (let s = 0; s < segments; s++) {
      const t0 = (s / segments) * Math.PI * 2;
      const t1 = ((s + 1) / segments) * Math.PI * 2;
      verts.push(
        r * Math.cos(t0),
        0,
        r * Math.sin(t0),
        r * Math.cos(t1),
        0,
        r * Math.sin(t1),
      );
    }
  }
  return new Float32Array(verts);
}

export function LyRadialGrid({ maxDataRadius, orbitRef, visible }: Props) {
  const fineGeo = useMemo(() => new THREE.BufferGeometry(), []);
  const fineMatRef = useRef<THREE.LineBasicMaterial>(null);
  const fineLinesRef = useRef<THREE.LineSegments>(null);
  const coarseLineRef = useRef<LineSegments2 | null>(null);

  const coarseLabelEls = useRef(new Map<string, HTMLDivElement>());
  const fineLabelEls = useRef(new Map<string, HTMLDivElement>());

  const [snap, setSnap] = useState<{
    e: number;
    stepFine: number;
    stepCoarse: number;
    coarseLinePoints: [number, number, number][];
  }>(() => {
    const posC = buildRadialCoarseRingsOnly(200, 25, CIRCLE_SEG);
    return {
      e: 500,
      stepFine: 1,
      stepCoarse: 5,
      coarseLinePoints: flatSegmentsToLinePoints(posC),
    };
  });

  const lodKey = useRef("");
  const { camera, size } = useThree();

  useLayoutEffect(() => {
    const posF = buildRadialFine(200, 5, CIRCLE_SEG, Math.PI / 12);
    fineGeo.setAttribute("position", new THREE.BufferAttribute(posF, 3));
  }, [fineGeo]);

  useLayoutEffect(() => {
    const fine = fineLinesRef.current;
    const coarse = coarseLineRef.current;
    if (fine) fine.raycast = () => {};
    if (coarse) coarse.raycast = () => {};
  });

  useFrame(() => {
    const target = orbitRef.current?.target;
    const dist = target
      ? camera.position.distanceTo(target)
      : camera.position.length();

    const lod = lyGridLod(dist, D_REF);
    const stepFine = ensureLineBudget(
      extentForGrid(dist, maxDataRadius, lod.stepFine),
      lod.stepFine,
      100,
    );
    const stepCoarse = ensureLineBudget(
      extentForGrid(dist, maxDataRadius, lod.stepCoarse),
      lod.stepCoarse,
      100,
    );
    const e = Math.max(
      extentForGrid(dist, maxDataRadius, stepFine),
      extentForGrid(dist, maxDataRadius, stepCoarse),
    );

    const key = `${stepFine}_${stepCoarse}_${Math.round(e / 20)}`;
    if (key !== lodKey.current) {
      lodKey.current = key;
      const posF = buildRadialFine(e, stepFine, CIRCLE_SEG, Math.PI / 12);
      const posC = buildRadialCoarseRingsOnly(e, stepCoarse, CIRCLE_SEG);
      fineGeo.setAttribute("position", new THREE.BufferAttribute(posF, 3));
      setSnap({
        e,
        stepFine,
        stepCoarse,
        coarseLinePoints: flatSegmentsToLinePoints(posC),
      });
    }

    const base = visible ? 1 : 0;
    const wF = lod.wFine * base;
    const wC = lod.wCoarse * base;

    const fm = fineMatRef.current;
    if (fm) {
      fm.opacity = FINE_OPACITY_PEAK * wF;
    }

    const coarseMesh = coarseLineRef.current;
    if (coarseMesh?.material) {
      const m = coarseMesh.material as LineMaterial;
      m.transparent = true;
      m.depthWrite = false;
      m.opacity = COARSE_OPACITY_PEAK * wC;
      m.linewidth =
        COARSE_LINE_BASE_PX + coarseGridLineWidthExtra(lod.wCoarse) * 0.5 * base;
      m.resolution.set(size.width, size.height);
      m.needsUpdate = true;
    }

    coarseLabelEls.current.forEach((el) => {
      el.style.opacity = String(0.92 * wC);
      el.style.visibility = wC < 0.012 ? "hidden" : "visible";
    });
    fineLabelEls.current.forEach((el) => {
      el.style.opacity = String(0.72 * wF);
      el.style.visibility = wF < 0.012 ? "hidden" : "visible";
    });
  });

  const { primary, secondary } = useMemo(() => {
    const { e, stepFine, stepCoarse } = snap;
    if (!visible || e < 1) {
      return { primary: [] as number[], secondary: [] as number[] };
    }
    const primaryVals = axisLabelValues(e, stepCoarse, 26).filter((v) => v > 0);
    let secondaryVals: number[] = [];
    if (stepCoarse / stepFine >= 4.5) {
      const cap = Math.min(e, stepCoarse * 10);
      secondaryVals = axisLabelValues(cap, stepFine, 40).filter(
        (v) =>
          v > 0 &&
          !isMultipleStep(v, stepCoarse) &&
          v <= cap + 1e-6,
      );
    }
    return { primary: primaryVals, secondary: secondaryVals };
  }, [snap, visible]);

  const labelMajor: CSSProperties = {
    color: "rgba(200, 210, 230, 0.88)",
    fontSize: GRID_LABEL_FONT_MAJOR,
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    textShadow: "0 0 6px #000",
  };
  const labelMinor: CSSProperties = {
    ...labelMajor,
    color: "rgba(148, 156, 176, 0.65)",
    fontSize: GRID_LABEL_FONT_MINOR,
  };

  return (
    <group>
      <lineSegments ref={fineLinesRef} geometry={fineGeo} frustumCulled={false}>
        <lineBasicMaterial
          ref={fineMatRef}
          color="#3d4a58"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </lineSegments>

      <Line
        ref={coarseLineRef}
        segments
        points={snap.coarseLinePoints}
        color="#6a87b5"
        transparent
        opacity={0}
        depthWrite={false}
        lineWidth={COARSE_LINE_BASE_PX}
      />

      {visible &&
        primary.flatMap((r) =>
          RADIAL_LABEL_DIRS.map(({ key, pos }) => (
            <Html
              key={`maj-${key}-${r}`}
              position={pos(r)}
              center
              zIndexRange={GRID_HTML_Z_INDEX_RANGE}
              wrapperClass="pointer-events-none"
              style={{ pointerEvents: "none" }}
            >
              <div
                ref={(el) => {
                  const id = `maj-${key}-${r}`;
                  if (el) coarseLabelEls.current.set(id, el);
                  else coarseLabelEls.current.delete(id);
                }}
                style={{ ...labelMajor, opacity: 0 }}
              >
                {formatLyLabel(r)}
              </div>
            </Html>
          )),
        )}
      {visible &&
        secondary.flatMap((r) =>
          RADIAL_LABEL_DIRS.map(({ key, pos }) => (
            <Html
              key={`min-${key}-${r}`}
              position={pos(r)}
              center
              zIndexRange={GRID_HTML_Z_INDEX_RANGE}
              wrapperClass="pointer-events-none"
              style={{ pointerEvents: "none" }}
            >
              <div
                ref={(el) => {
                  const id = `min-${key}-${r}`;
                  if (el) fineLabelEls.current.set(id, el);
                  else fineLabelEls.current.delete(id);
                }}
                style={{ ...labelMinor, opacity: 0 }}
              >
                {formatLyLabel(r)}
              </div>
            </Html>
          )),
        )}
    </group>
  );
}
