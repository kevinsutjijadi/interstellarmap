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
  findStarIndexByProper,
  starDisplayName,
  useStarData,
  type StarCatalogMode,
} from "./useStarData";
import { MapHud } from "@/components/ui/MapHud";
import {
  DEFAULT_TRAVEL_STATE,
  RelativisticTravelPanel,
  type TravelCalculatorState,
} from "@/components/ui/RelativisticTravelPanel";
import { StarSearchBar } from "@/components/ui/StarSearchBar";
import type { GridUnit } from "@/lib/gridLy";
import { turboLinearRgb } from "@/lib/turboColormap";
import { shipProperTimeYears } from "@/lib/relativisticTravel";
import styles from "@/app/ui.module.css";

const DEFAULT_CAMERA_POSITION_LY: [number, number, number] = [7.87, 8.85, 19.8];

/** HYG bf for Tau Ceti (catalog uses `52Tau Cet`). */
const DEFAULT_SELECTED_BF = "52Tau Cet";
const REAL_DIST_GRADIENT_CUTOFF_LY = 500;

const MOBILE_MQ = "(max-width: 768px)";

function formatDistanceLy(ly: number): string {
  if (!Number.isFinite(ly)) return "—";
  if (ly < 1e-6) return `${ly.toExponential(2)} ly`;
  if (ly < 10) return `${ly.toFixed(3)} ly`;
  if (ly < 1000) return `${ly.toFixed(2)} ly`;
  return `${ly.toLocaleString(undefined, { maximumFractionDigits: 1 })} ly`;
}

/** Ship proper time from Sun to hover point, shown in months. */
function formatShipProperTimeMonths(tauShipYr: number): string {
  if (!Number.isFinite(tauShipYr) || tauShipYr < 0) return "—";
  const mo = tauShipYr * 12;
  if (mo === 0) return "0 mo";
  if (mo < 1e-6) return `${mo.toExponential(2)} mo`;
  if (mo < 0.01) return `${mo.toFixed(4)} mo`;
  if (mo < 1e6) return `${mo.toFixed(2)} mo`;
  return `${mo.toExponential(2)} mo`;
}

export function InterstellarView() {
  const [catalogMode, setCatalogMode] = useState<StarCatalogMode>("filtered");
  const { data, loading, error } = useStarData(catalogMode);
  const [gridMode, setGridMode] = useState<GridMode>("cartesian");
  const [showGrid, setShowGrid] = useState(true);
  const [showZLines, setShowZLines] = useState(true);
  const [selectedStar, setSelectedStar] = useState<StarPickInfo | null>(null);
  const [travelCalc, setTravelCalc] = useState<TravelCalculatorState>(DEFAULT_TRAVEL_STATE);
  /** When true, stars use turbo colormap by distance (ly or ship years to match map mode). */
  const [starColorByDistance, setStarColorByDistance] = useState(false);
  /** Project stars onto XZ ground plane (y=0) keeping Sun distance and XZ azimuth. */
  const [flatMapXzPlane, setFlatMapXzPlane] = useState(false);
  const [hoverStarIndex, setHoverStarIndex] = useState<number | null>(null);
  const cameraHudRef = useRef<HTMLParagraphElement>(null);
  const hoverTooltipRef = useRef<HTMLDivElement>(null);
  const journeyHoverTooltipRef = useRef<HTMLDivElement>(null);
  const [journeyLineHover, setJourneyLineHover] = useState<JourneyLineHoverPayload | null>(null);
  const appliedDefaultSelectionRef = useRef(false);
  /** Set when changing catalog so the next loaded `data` restores or skips selection. */
  const postCatalogLoadRef = useRef<
    | undefined
    | { kind: "preserve"; bf: string; proper: string }
    | { kind: "stay-empty" }
  >(undefined);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [starAsideCollapsed, setStarAsideCollapsed] = useState(false);
  const [mapHudCollapsed, setMapHudCollapsed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => setIsMobileLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setStarAsideCollapsed(false);
  }, [selectedStar?.index]);

  const handleCatalogModeChange = useCallback(
    (mode: StarCatalogMode) => {
      if (mode === catalogMode) return;
      setHoverStarIndex(null);
      if (selectedStar !== null && data !== null) {
        const i = selectedStar.index;
        postCatalogLoadRef.current = {
          kind: "preserve",
          bf: data.bf[i] ?? "",
          proper: data.proper[i] ?? "",
        };
      } else {
        postCatalogLoadRef.current = { kind: "stay-empty" };
      }
      setCatalogMode(mode);
    },
    [catalogMode, data, selectedStar],
  );

  useEffect(() => {
    if (!data || data.count === 0) return;

    const pending = postCatalogLoadRef.current;
    if (pending?.kind === "preserve") {
      postCatalogLoadRef.current = undefined;
      const bf = pending.bf.trim();
      const proper = pending.proper.trim();
      let idx: number | null = null;
      if (bf) idx = findStarIndexByBf(data, bf);
      if (idx === null && proper) idx = findStarIndexByProper(data, proper);
      if (idx !== null) {
        setSelectedStar({
          index: idx,
          name: starDisplayName(data.proper[idx] ?? "", data.bf[idx] ?? ""),
          distanceLy: distanceFromSunLy(data, idx),
        });
      } else {
        setSelectedStar(null);
        setJourneyLineHover(null);
      }
      return;
    }

    if (pending?.kind === "stay-empty") {
      postCatalogLoadRef.current = undefined;
      return;
    }

    if (appliedDefaultSelectionRef.current) return;
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
      mapByShipProperTime: travelCalc.mapByShipProperTime,
    };
  }, [selectedStar, travelCalc]);

  const mapCoordsShipTime = travelCalc.mapByShipProperTime;
  const coastFrac = travelCalc.coastFractionPct / 100;

  const shipYrPositionsAndMax = useMemo(() => {
    if (!data) return null;
    const n = data.count;
    const out = new Float32Array(n * 3);
    let maxRadius = 0;
    const eps = 1e-15;
    const kin = {
      mode: travelCalc.mode,
      accelerationG: travelCalc.accelerationG,
      coastFraction: coastFrac,
    };
    for (let i = 0; i < n; i++) {
      const x = data.positions[i * 3]!;
      const y = data.positions[i * 3 + 1]!;
      const z = data.positions[i * 3 + 2]!;
      const r = Math.hypot(x, y, z);
      let s = 1;
      if (r > eps) {
        const tauYr = shipProperTimeYears(r, {
          distanceLy: r,
          ...kin,
        });
        s = tauYr !== null && tauYr >= 0 ? tauYr / r : 1;
      }
      const px = x * s;
      const py = y * s;
      const pz = z * s;
      out[i * 3] = px;
      out[i * 3 + 1] = py;
      out[i * 3 + 2] = pz;
      const hr = Math.hypot(px, pz);
      if (hr > maxRadius) maxRadius = hr;
    }
    return {
      positions: out,
      maxRadius: Math.max(maxRadius, 50),
    };
  }, [data, travelCalc.mode, travelCalc.accelerationG, coastFrac]);

  const mapLayout = useMemo(() => {
    if (!data || !shipYrPositionsAndMax) return null;
    return {
      positionsLy: data.positions,
      positionsShipYr: shipYrPositionsAndMax.positions,
      maxRadiusLy: data.maxRadius,
      maxRadiusShipYr: shipYrPositionsAndMax.maxRadius,
      gridUnit: (mapCoordsShipTime ? "shipYr" : "ly") as GridUnit,
      cameraUnitLabel: mapCoordsShipTime ? "ship yr" : "ly",
      mapTargetShipTime: mapCoordsShipTime,
    };
  }, [data, shipYrPositionsAndMax, mapCoordsShipTime]);

  const starInstanceColors = useMemo(() => {
    if (!data || !starColorByDistance) return null;
    const n = data.count;
    const kin = {
      mode: travelCalc.mode,
      accelerationG: travelCalc.accelerationG,
      coastFraction: coastFrac,
    };
    const dists = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = data.positions[i * 3]!;
      const y = data.positions[i * 3 + 1]!;
      const z = data.positions[i * 3 + 2]!;
      const rLy = Math.hypot(x, y, z);
      if (mapCoordsShipTime) {
        const ty = shipProperTimeYears(rLy, { distanceLy: rLy, ...kin });
        dists[i] = ty !== null && ty >= 0 ? ty : rLy;
      } else {
        dists[i] = rLy;
      }
    }
    let dMin = Infinity;
    let dMax = -Infinity;
    for (let i = 0; i < n; i++) {
      const d = dists[i]!;
      if (d < dMin) dMin = d;
      if (d > dMax) dMax = d;
    }
    if (!mapCoordsShipTime) {
      dMax = REAL_DIST_GRADIENT_CUTOFF_LY;
    }
    const span = dMax - dMin || 1;
    const rgb = new Float32Array(n * 3);
    const out = { r: 0, g: 0, b: 0 };
    for (let i = 0; i < n; i++) {
      const t = (dists[i]! - dMin) / span;
      turboLinearRgb(t, out);
      rgb[i * 3] = out.r;
      rgb[i * 3 + 1] = out.g;
      rgb[i * 3 + 2] = out.b;
    }
    return rgb;
  }, [
    data,
    starColorByDistance,
    mapCoordsShipTime,
    travelCalc.mode,
    travelCalc.accelerationG,
    coastFrac,
  ]);

  const instanceRgb =
    data && starInstanceColors ? starInstanceColors : data?.spectralRgb ?? new Float32Array();

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
      {data && data.count > 0 && mapLayout && (
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
                positionsLy={mapLayout.positionsLy}
                positionsShipYr={mapLayout.positionsShipYr}
                maxRadiusLy={mapLayout.maxRadiusLy}
                maxRadiusShipYr={mapLayout.maxRadiusShipYr}
                mapTargetShipTime={mapLayout.mapTargetShipTime}
                gridUnit={mapLayout.gridUnit}
                cameraUnitLabel={mapLayout.cameraUnitLabel}
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
                instanceRgb={instanceRgb}
                flatMapXzPlane={flatMapXzPlane}
                enableAutoRotate={!isMobileLayout}
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
                    <div className={styles.journeyTooltipMuted}>
                      Ship proper {formatShipProperTimeMonths(journeyLineHover.tauShipYr)}
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
              className={[
                styles.starAside,
                isMobileLayout && styles.starAsideMobile,
                isMobileLayout && starAsideCollapsed && styles.starAsideMobileCollapsed,
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label="Selected star"
            >
              <div className={styles.starAsideHeader}>
                <h2 className={styles.starAsideTitle}>
                  {selectedStar.name}
                </h2>
                <div className={styles.starAsideHeaderActions}>
                  {isMobileLayout && (
                    <button
                      type="button"
                      onClick={() => setStarAsideCollapsed((c) => !c)}
                      className={styles.iconButton}
                      aria-expanded={!starAsideCollapsed}
                      aria-label={
                        starAsideCollapsed
                          ? "Expand star details"
                          : "Collapse star details"
                      }
                    >
                      {starAsideCollapsed ? "▲" : "▼"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearSelection}
                    className={styles.iconButton}
                    aria-label="Close star details"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className={styles.starAsideBody}>
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
              </div>
            </aside>
          )}
          <StarSearchBar
            data={data}
            onSelectStar={onStarClick}
            isMobileLayout={isMobileLayout}
          />
          {isMobileLayout && mapHudCollapsed && (
            <button
              type="button"
              className={styles.mapHudMobileExpand}
              onClick={() => setMapHudCollapsed(false)}
              aria-expanded={false}
              aria-label="Show map controls"
            >
              ▲ Map controls
            </button>
          )}
          <MapHud
            gridMode={gridMode}
            onGridMode={setGridMode}
            catalogMode={catalogMode}
            onCatalogMode={handleCatalogModeChange}
            showGrid={showGrid}
            onShowGrid={setShowGrid}
            showZLines={showZLines}
            onShowZLines={setShowZLines}
            mapShipYearsActive={mapCoordsShipTime}
            starColorByDistance={starColorByDistance}
            onStarColorByDistance={setStarColorByDistance}
            flatMapXzPlane={flatMapXzPlane}
            onFlatMapXzPlane={setFlatMapXzPlane}
            isMobileLayout={isMobileLayout}
            mobilePanelCollapsed={isMobileLayout && mapHudCollapsed}
            onMobilePanelCollapse={() => setMapHudCollapsed(true)}
          />
        </>
      )}
    </div>
  );
}
