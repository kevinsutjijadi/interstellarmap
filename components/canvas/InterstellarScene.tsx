"use client";

import { useRef, type RefObject } from "react";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { StarsInstanced, type StarPickInfo } from "./StarsInstanced";
import { SunToStarJourneyVisual } from "./SunToStarJourneyVisual";
import { CameraPositionReporter } from "./CameraPositionReporter";
import { ZDropLines } from "./ZDropLines";
import { LyCartesianGrid } from "./LyCartesianGrid";
import { LyRadialGrid } from "./LyRadialGrid";
import type { StarData } from "./useStarData";
import type { FlightMode } from "@/lib/relativisticTravel";
import type { JourneyLineHoverPayload } from "./journeyLineHoverPayload";

export type GridMode = "cartesian" | "radial";

export type { StarPickInfo };
export type { JourneyLineHoverPayload };

export type JourneyPathState = {
  index: number;
  distanceLy: number;
  mode: FlightMode;
  accelerationG: number;
  coastFraction: number;
  showVase: boolean;
};

type Props = {
  data: StarData;
  gridMode: GridMode;
  showGrid: boolean;
  showZLines: boolean;
  selectedStarIndex: number | null;
  journeyPath: JourneyPathState | null;
  journeyLineHover: JourneyLineHoverPayload | null;
  onJourneyLineHover: (payload: JourneyLineHoverPayload | null) => void;
  journeyHoverTooltipRef: RefObject<HTMLDivElement | null>;
  onStarClick: (info: StarPickInfo) => void;
  cameraHudRef: RefObject<HTMLElement | null>;
  hoverTooltipRef: RefObject<HTMLDivElement | null>;
  onHoverStarIndex: (index: number | null) => void;
};

export function InterstellarScene({
  data,
  gridMode,
  showGrid,
  showZLines,
  selectedStarIndex,
  journeyPath,
  journeyLineHover,
  onJourneyLineHover,
  journeyHoverTooltipRef,
  onStarClick,
  cameraHudRef,
  hoverTooltipRef,
  onHoverStarIndex,
}: Props) {
  const orbitRef = useRef<OrbitControlsImpl>(null);

  const showJourney =
    journeyPath !== null &&
    selectedStarIndex !== null &&
    selectedStarIndex === journeyPath.index &&
    selectedStarIndex >= 0 &&
    selectedStarIndex < data.count;

  return (
    <>
      <OrbitControls
        ref={orbitRef}
        makeDefault
        enableDamping
        dampingFactor={0.06}
        minDistance={0.5}
        maxDistance={1e7}
        autoRotate
        autoRotateSpeed={0.15}
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

      {showJourney && journeyPath && (
        <SunToStarJourneyVisual
          positions={data.positions}
          index={journeyPath.index}
          distanceLy={journeyPath.distanceLy}
          mode={journeyPath.mode}
          accelerationG={journeyPath.accelerationG}
          coastFraction={journeyPath.coastFraction}
          showVase={journeyPath.showVase}
          journeyLineHover={journeyLineHover}
          onJourneyLineHover={onJourneyLineHover}
          journeyHoverTooltipRef={journeyHoverTooltipRef}
        />
      )}
      <ZDropLines
        positions={data.positions}
        count={data.count}
        visible={showZLines}
      />
      <CameraPositionReporter labelRef={cameraHudRef} />
    </>
  );
}
