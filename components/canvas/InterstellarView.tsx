"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  InterstellarScene,
  type GridMode,
  type JourneyLineHoverPayload,
  type StarPickInfo,
} from "./InterstellarScene";
import {
  distanceFromSunLy,
  findStarIndexByBf,
  starDisplayName,
  useStarData,
} from "./useStarData";
import { MapHud } from "@/components/ui/MapHud";
import {
  DEFAULT_TRAVEL_STATE,
  RelativisticTravelPanel,
  type TravelCalculatorState,
} from "@/components/ui/RelativisticTravelPanel";
import { StarSearchBar } from "@/components/ui/StarSearchBar";
import styles from "@/app/ui.module.css";

const DEFAULT_CAMERA_POSITION_LY: [number, number, number] = [7.87, 8.85, 19.8];

/** HYG bf for Tau Ceti (catalog uses `52Tau Cet`). */
const DEFAULT_SELECTED_BF = "52Tau Cet";

function formatDistanceLy(ly: number): string {
  if (!Number.isFinite(ly)) return "—";
  if (ly < 1e-6) return `${ly.toExponential(2)} ly`;
  if (ly < 10) return `${ly.toFixed(3)} ly`;
  if (ly < 1000) return `${ly.toFixed(2)} ly`;
  return `${ly.toLocaleString(undefined, { maximumFractionDigits: 1 })} ly`;
}

export function InterstellarView() {
  const { data, loading, error } = useStarData();
  const [gridMode, setGridMode] = useState<GridMode>("cartesian");
  const [showGrid, setShowGrid] = useState(true);
  const [showZLines, setShowZLines] = useState(true);
  const [selectedStar, setSelectedStar] = useState<StarPickInfo | null>(null);
  const [travelCalc, setTravelCalc] = useState<TravelCalculatorState>(DEFAULT_TRAVEL_STATE);
  const [hoverStarIndex, setHoverStarIndex] = useState<number | null>(null);
  const cameraHudRef = useRef<HTMLParagraphElement>(null);
  const hoverTooltipRef = useRef<HTMLDivElement>(null);
  const journeyHoverTooltipRef = useRef<HTMLDivElement>(null);
  const [journeyLineHover, setJourneyLineHover] = useState<JourneyLineHoverPayload | null>(null);
  const appliedDefaultSelectionRef = useRef(false);

  useEffect(() => {
    if (!data || data.count === 0 || appliedDefaultSelectionRef.current) return;
    const idx = findStarIndexByBf(data, DEFAULT_SELECTED_BF);
    if (idx === null) return;
    appliedDefaultSelectionRef.current = true;
    setSelectedStar({
      index: idx,
      name: starDisplayName(data.proper[idx] ?? "", data.bf[idx] ?? ""),
      distanceLy: distanceFromSunLy(data, idx),
    });
  }, [data]);

  const hoverTooltipText = useMemo(() => {
    if (data == null || hoverStarIndex === null) return null;
    if (hoverStarIndex < 0 || hoverStarIndex >= data.count) return null;
    return starDisplayName(
      data.proper[hoverStarIndex] ?? "",
      data.bf[hoverStarIndex] ?? "",
    );
  }, [data, hoverStarIndex]);

  const onHoverStarIndex = useCallback((index: number | null) => {
    setHoverStarIndex(index);
  }, []);

  const onStarClick = useCallback((info: StarPickInfo) => {
    setSelectedStar(info);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedStar(null);
    setJourneyLineHover(null);
  }, []);

  useEffect(() => {
    setJourneyLineHover(null);
  }, [selectedStar?.index]);

  const journeyPath = useMemo(() => {
    if (!selectedStar) return null;
    return {
      index: selectedStar.index,
      distanceLy: selectedStar.distanceLy,
      mode: travelCalc.mode,
      accelerationG: travelCalc.accelerationG,
      coastFraction: travelCalc.coastFractionPct / 100,
      showVase: travelCalc.showDilationVase,
    };
  }, [selectedStar, travelCalc]);

  return (
    <div className={styles.viewRoot}>
      {loading && (
        <div className={styles.overlayCenter}>
          Loading star catalog…
        </div>
      )}
      {error && (
        <div className={styles.overlayError}>
          {error.message}
        </div>
      )}
      {data && data.count === 0 && !loading && !error && (
        <div className={styles.overlayCenter}>
          No stars loaded after filtering.
        </div>
      )}
      {data && data.count > 0 && (
        <>
          <Canvas
            gl={{ antialias: true, alpha: false }}
            camera={{
              fov: 50,
              near: 0.05,
              far: 1e9,
              position: DEFAULT_CAMERA_POSITION_LY,
            }}
            className={styles.canvasFullBleed}
            onPointerMissed={clearSelection}
          >
            <color attach="background" args={["#000000"]} />
            <Suspense fallback={null}>
              <InterstellarScene
                data={data}
                gridMode={gridMode}
                showGrid={showGrid}
                showZLines={showZLines}
                selectedStarIndex={selectedStar?.index ?? null}
                journeyPath={journeyPath}
                journeyLineHover={journeyLineHover}
                onJourneyLineHover={setJourneyLineHover}
                journeyHoverTooltipRef={journeyHoverTooltipRef}
                onStarClick={onStarClick}
                cameraHudRef={cameraHudRef}
                hoverTooltipRef={hoverTooltipRef}
                onHoverStarIndex={onHoverStarIndex}
              />
            </Suspense>
          </Canvas>
          {hoverTooltipText !== null && (
            <div
              className={styles.tooltipOverlay}
              aria-hidden
            >
              <div
                ref={hoverTooltipRef}
                className={styles.starHoverTooltip}
                style={{
                  visibility: "hidden",
                  left: 0,
                  top: 0,
                  transform: "translate(-50%, calc(-100% - 8px))",
                }}
              >
                {hoverTooltipText}
              </div>
            </div>
          )}
          {selectedStar && (
            <div
              className={styles.tooltipOverlay}
              aria-hidden
            >
              <div
                ref={journeyHoverTooltipRef}
                className={styles.journeyHoverTooltip}
                style={{
                  visibility: "hidden",
                  left: 0,
                  top: 0,
                  transform: "translate(-50%, calc(-100% - 8px))",
                }}
              >
                {journeyLineHover !== null && (
                  <>
                    <div className={styles.tabularNums}>v/c {journeyLineHover.beta.toFixed(5)}</div>
                    <div className={styles.journeyTooltipMuted}>
                      Dist {journeyLineHover.dLy.toFixed(4)} ly
                    </div>
                    <div className={styles.journeyTooltipGamma}>
                      γ {journeyLineHover.gamma.toFixed(3)}× vs Earth
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {selectedStar && (
            <aside
              className={styles.starAside}
              aria-label="Selected star"
            >
              <div className={styles.starAsideHeader}>
                <h2 className={styles.starAsideTitle}>
                  {selectedStar.name}
                </h2>
                <button
                  type="button"
                  onClick={clearSelection}
                  className={styles.iconButton}
                  aria-label="Close star details"
                >
                  ✕
                </button>
              </div>
              <dl className={styles.starAsideDl}>
                <div className={styles.starAsideRow}>
                  <dt className={styles.starAsideDt}>Distance from Sun</dt>
                  <dd className={styles.starAsideDd}>
                    {formatDistanceLy(selectedStar.distanceLy)}
                  </dd>
                </div>
              </dl>
              <RelativisticTravelPanel
                distanceLy={selectedStar.distanceLy}
                value={travelCalc}
                onChange={setTravelCalc}
              />
            </aside>
          )}
          <StarSearchBar data={data} onSelectStar={onStarClick} />
          <MapHud
            gridMode={gridMode}
            onGridMode={setGridMode}
            showGrid={showGrid}
            onShowGrid={setShowGrid}
            showZLines={showZLines}
            onShowZLines={setShowZLines}
          />
        </>
      )}
    </div>
  );
}
