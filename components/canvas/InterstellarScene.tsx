"use client";

import { useMemo, useRef, type RefObject } from "react";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  InitBlendAlphaOnData,
  MapBlendCompute,
  MapBlendTicker,
  MapFlatXzPlane,
} from "./MapCoordinateBlend";
import { StarsInstanced, type StarPickInfo } from "./StarsInstanced";
import { SunToStarJourneyVisual } from "./SunToStarJourneyVisual";
import { CameraPositionReporter } from "./CameraPositionReporter";
import { ZDropLines } from "./ZDropLines";
import { LyCartesianGrid } from "./LyCartesianGrid";
import { LyRadialGrid } from "./LyRadialGrid";
import type { StarData } from "./useStarData";
import type { FlightMode } from "@/lib/relativisticTravel";
import type { GridUnit } from "@/lib/gridLy";
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
  mapByShipProperTime: boolean;
};

type Props = {
  data: StarData;
  positionsLy: Float32Array;
  positionsShipYr: Float32Array;
  maxRadiusLy: number;
  maxRadiusShipYr: number;
  mapTargetShipTime: boolean;
  gridUnit: GridUnit;
  cameraUnitLabel: string;
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
  instanceRgb: Float32Array;
  flatMapXzPlane: boolean;
};

export function InterstellarScene({
  data,
  positionsLy,
  positionsShipYr,
  maxRadiusLy,
  maxRadiusShipYr,
  mapTargetShipTime,
  gridUnit,
  cameraUnitLabel,
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
  instanceRgb,
  flatMapXzPlane,
}: Props) {
  const orbitRef = useRef<OrbitControlsImpl>(null);
  const mapBlendAlphaRef = useRef(0);
  const maxRadiusLiveRef = useRef(maxRadiusLy);
  const flatMapXzRef = useRef(flatMapXzPlane);
  flatMapXzRef.current = flatMapXzPlane;

  const blendPositionsBuffer = useMemo(() => {
    const b = new Float32Array(data.count * 3);
    b.set(positionsLy);
    return b;
  }, [data.count, positionsLy]);

  const showJourney =
    journeyPath !== null &&
    selectedStarIndex !== null &&
    selectedStarIndex === journeyPath.index &&
    selectedStarIndex >= 0 &&
    selectedStarIndex < data.count;

  return (
    <>
      <InitBlendAlphaOnData
        targetShipTime={mapTargetShipTime}
        alphaRef={mapBlendAlphaRef}
        dataEpoch={data.count}
      />
      <MapBlendTicker targetShipTime={mapTargetShipTime} alphaRef={mapBlendAlphaRef} />
      <MapBlendCompute
        positionsLy={positionsLy}
        positionsShip={positionsShipYr}
        count={data.count}
        alphaRef={mapBlendAlphaRef}
        outPositions={blendPositionsBuffer}
        maxRadiusLy={maxRadiusLy}
        maxRadiusShip={maxRadiusShipYr}
        maxRadiusOutRef={maxRadiusLiveRef}
      />
      <MapFlatXzPlane
        enabledRef={flatMapXzRef}
        count={data.count}
        positions={blendPositionsBuffer}
        maxRadiusOutRef={maxRadiusLiveRef}
      />

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
          maxDataRadius={maxRadiusLy}
          maxDataRadiusLiveRef={maxRadiusLiveRef}
          orbitRef={orbitRef}
          visible={showGrid}
          gridUnit={gridUnit}
        />
      ) : (
        <LyRadialGrid
          maxDataRadius={maxRadiusLy}
          maxDataRadiusLiveRef={maxRadiusLiveRef}
          orbitRef={orbitRef}
          visible={showGrid}
          gridUnit={gridUnit}
        />
      )}

      <StarsInstanced
        positions={blendPositionsBuffer}
        physicalPositions={data.positions}
        mag={data.mag}
        instanceRgb={instanceRgb}
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
          positions={blendPositionsBuffer}
          physicalPositions={data.positions}
          index={journeyPath.index}
          distanceLy={journeyPath.distanceLy}
          mode={journeyPath.mode}
          accelerationG={journeyPath.accelerationG}
          coastFraction={journeyPath.coastFraction}
          showVase={journeyPath.showVase}
          mapByShipProperTime={journeyPath.mapByShipProperTime}
          mapBlendAlphaRef={mapBlendAlphaRef}
          mapTargetShipTime={mapTargetShipTime}
          flatMapXzPlane={flatMapXzPlane}
          journeyLineHover={journeyLineHover}
          onJourneyLineHover={onJourneyLineHover}
          journeyHoverTooltipRef={journeyHoverTooltipRef}
        />
      )}
      <ZDropLines
        positions={blendPositionsBuffer}
        count={data.count}
        visible={showZLines}
        dynamicPositions
      />
      <CameraPositionReporter labelRef={cameraHudRef} unitLabel={cameraUnitLabel} />
    </>
  );
}
