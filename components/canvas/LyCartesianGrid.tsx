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
  buildPlaneXZGridLines,
  coarseGridLineWidthExtra,
  ensureLineBudget,
  extentForGrid,
  flatSegmentsToLinePoints,
  formatGridAxisLabel,
  type GridUnit,
  GRID_HTML_Z_INDEX_RANGE,
  GRID_LABEL_FONT_MAJOR,
  GRID_LABEL_FONT_MINOR,
  isMultipleStep,
  lyGridLod,
} from "@/lib/gridLy";

type Props = {
  maxDataRadius: number;
  /** When set, `extentForGrid` uses this value (updated every frame during map blend). */
  maxDataRadiusLiveRef?: RefObject<number>;
  orbitRef: RefObject<OrbitControlsImpl | null>;
  visible: boolean;
  gridUnit?: GridUnit;
};

const D_REF = 45;
const COARSE_LINE_BASE_PX = 0.8;
const FINE_OPACITY_PEAK = 0.42;
const COARSE_OPACITY_PEAK = 0.58;

export function LyCartesianGrid({
  maxDataRadius,
  maxDataRadiusLiveRef,
  orbitRef,
  visible,
  gridUnit = "ly",
}: Props) {
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
    const posC = buildPlaneXZGridLines(200, 25);
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
    const posF = buildPlaneXZGridLines(200, 5);
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

    const mdr = maxDataRadiusLiveRef?.current ?? maxDataRadius;

    const lod = lyGridLod(dist, D_REF);
    const stepFine = ensureLineBudget(
      extentForGrid(dist, mdr, lod.stepFine),
      lod.stepFine,
      100,
    );
    const stepCoarse = ensureLineBudget(
      extentForGrid(dist, mdr, lod.stepCoarse),
      lod.stepCoarse,
      100,
    );
    const e = Math.max(
      extentForGrid(dist, mdr, stepFine),
      extentForGrid(dist, mdr, stepCoarse),
    );

    const key = `${stepFine}_${stepCoarse}_${Math.round(e / 20)}`;
    if (key !== lodKey.current) {
      lodKey.current = key;
      const posF = buildPlaneXZGridLines(e, stepFine);
      const posC = buildPlaneXZGridLines(e, stepCoarse);
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
    const primaryVals = axisLabelValues(e, stepCoarse, 26).filter((v) => v !== 0);
    let secondaryVals: number[] = [];
    if (stepCoarse / stepFine >= 4.5) {
      const cap = Math.min(e, stepCoarse * 10);
      secondaryVals = axisLabelValues(cap, stepFine, 40).filter(
        (v) =>
          v !== 0 &&
          !isMultipleStep(v, stepCoarse) &&
          Math.abs(v) <= cap + 1e-6,
      );
    }
    return { primary: primaryVals, secondary: secondaryVals };
  }, [snap, visible]);

  const labelStyleMajor: CSSProperties = {
    color: "rgba(200, 210, 230, 0.88)",
    fontSize: GRID_LABEL_FONT_MAJOR,
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    textShadow: "0 0 6px #000",
  };
  const labelStyleMinor: CSSProperties = {
    ...labelStyleMajor,
    color: "rgba(148, 156, 176, 0.65)",
    fontSize: GRID_LABEL_FONT_MINOR,
  };

  return (
    <group>
      <lineSegments ref={fineLinesRef} geometry={fineGeo} frustumCulled={false}>
        <lineBasicMaterial
          ref={fineMatRef}
          color="#3d4558"
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
        primary.map((v) => (
          <group key={`p-${v}`}>
            <Html
              position={[v, 0, 0]}
              center
              zIndexRange={GRID_HTML_Z_INDEX_RANGE}
              wrapperClass="pointer-events-none"
              style={{ pointerEvents: "none" }}
            >
              <div
                ref={(el) => {
                  const id = `maj-x-${v}`;
                  if (el) coarseLabelEls.current.set(id, el);
                  else coarseLabelEls.current.delete(id);
                }}
                style={{ ...labelStyleMajor, opacity: 0 }}
              >
                {formatGridAxisLabel(v, gridUnit)}
              </div>
            </Html>
            <Html
              position={[0, 0, v]}
              center
              zIndexRange={GRID_HTML_Z_INDEX_RANGE}
              wrapperClass="pointer-events-none"
              style={{ pointerEvents: "none" }}
            >
              <div
                ref={(el) => {
                  const id = `maj-z-${v}`;
                  if (el) coarseLabelEls.current.set(id, el);
                  else coarseLabelEls.current.delete(id);
                }}
                style={{ ...labelStyleMajor, opacity: 0 }}
              >
                {formatGridAxisLabel(v, gridUnit)}
              </div>
            </Html>
          </group>
        ))}
      {visible &&
        secondary.map((v) => (
          <group key={`s-${v}`}>
            <Html
              position={[v, 0, 0]}
              center
              zIndexRange={GRID_HTML_Z_INDEX_RANGE}
              wrapperClass="pointer-events-none"
              style={{ pointerEvents: "none" }}
            >
              <div
                ref={(el) => {
                  const id = `min-x-${v}`;
                  if (el) fineLabelEls.current.set(id, el);
                  else fineLabelEls.current.delete(id);
                }}
                style={{ ...labelStyleMinor, opacity: 0 }}
              >
                {formatGridAxisLabel(v, gridUnit)}
              </div>
            </Html>
            <Html
              position={[0, 0, v]}
              center
              zIndexRange={GRID_HTML_Z_INDEX_RANGE}
              wrapperClass="pointer-events-none"
              style={{ pointerEvents: "none" }}
            >
              <div
                ref={(el) => {
                  const id = `min-z-${v}`;
                  if (el) fineLabelEls.current.set(id, el);
                  else fineLabelEls.current.delete(id);
                }}
                style={{ ...labelStyleMinor, opacity: 0 }}
              >
                {formatGridAxisLabel(v, gridUnit)}
              </div>
            </Html>
          </group>
        ))}
    </group>
  );
}
