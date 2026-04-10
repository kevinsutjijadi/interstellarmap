"use client";

import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { Line, OrbitControls } from "@react-three/drei";
import type { Line2, LineSegments2, OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { StarsInstanced, type StarPickInfo } from "./StarsInstanced";
import { CameraPositionReporter } from "./CameraPositionReporter";
import { ZDropLines } from "./ZDropLines";
import { LyCartesianGrid } from "./LyCartesianGrid";
import { LyRadialGrid } from "./LyRadialGrid";
import type { StarData } from "./useStarData";

export type GridMode = "cartesian" | "radial";

export type { StarPickInfo };

type Props = {
  data: StarData;
  gridMode: GridMode;
  showGrid: boolean;
  showZLines: boolean;
  selectedStarIndex: number | null;
  onStarClick: (info: StarPickInfo) => void;
  cameraHudRef: RefObject<HTMLElement | null>;
  hoverTooltipRef: RefObject<HTMLDivElement | null>;
  onHoverStarIndex: (index: number | null) => void;
};

function SunToStarLine({
  positions,
  index,
}: {
  positions: Float32Array;
  index: number;
}) {
  const lineRef = useRef<Line2 | LineSegments2 | null>(null);

  const points = useMemo(() => {
    const x = positions[index * 3] ?? 0;
    const y = positions[index * 3 + 1] ?? 0;
    const z = positions[index * 3 + 2] ?? 0;
    return [
      [0, 0, 0] as [number, number, number],
      [x, y, z] as [number, number, number],
    ];
  }, [positions, index]);

  useLayoutEffect(() => {
    const o = lineRef.current;
    if (o) o.raycast = () => {};
  });

  return (
    <Line
      ref={lineRef}
      points={points}
      color="#ff8c00"
      lineWidth={2}
      toneMapped={false}
      depthTest
      transparent
      opacity={0.95}
    />
  );
}

export function InterstellarScene({
  data,
  gridMode,
  showGrid,
  showZLines,
  selectedStarIndex,
  onStarClick,
  cameraHudRef,
  hoverTooltipRef,
  onHoverStarIndex,
}: Props) {
  const orbitRef = useRef<OrbitControlsImpl>(null);

  return (
    <>
      <OrbitControls
        ref={orbitRef}
        makeDefault
        enableDamping
        dampingFactor={0.06}
        minDistance={0.5}
        maxDistance={1e7}
      />

      {gridMode === "cartesian" ? (
        <LyCartesianGrid
          maxDataRadius={data.maxRadius}
          orbitRef={orbitRef}
          visible={showGrid}
        />
      ) : (
        <LyRadialGrid
          maxDataRadius={data.maxRadius}
          orbitRef={orbitRef}
          visible={showGrid}
        />
      )}

      {selectedStarIndex !== null &&
        selectedStarIndex >= 0 &&
        selectedStarIndex < data.count && (
          <SunToStarLine positions={data.positions} index={selectedStarIndex} />
        )}

      <StarsInstanced
        positions={data.positions}
        mag={data.mag}
        spectralRgb={data.spectralRgb}
        proper={data.proper}
        bf={data.bf}
        count={data.count}
        orbitRef={orbitRef}
        onStarClick={onStarClick}
        hoverTooltipRef={hoverTooltipRef}
        onHoverStarIndex={onHoverStarIndex}
      />
      <ZDropLines
        positions={data.positions}
        count={data.count}
        visible={showZLines}
      />
      <CameraPositionReporter labelRef={cameraHudRef} />
    </>
  );
}
