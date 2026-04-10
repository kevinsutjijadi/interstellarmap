"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { InterstellarScene, type GridMode, type StarPickInfo } from "./InterstellarScene";
import { starDisplayName, useStarData } from "./useStarData";
import { MapHud } from "@/components/ui/MapHud";
import { StarSearchBar } from "@/components/ui/StarSearchBar";

const DEFAULT_CAMERA_POSITION_LY: [number, number, number] = [7.87, 8.85, 19.8];

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
  const [hoverStarIndex, setHoverStarIndex] = useState<number | null>(null);
  const cameraHudRef = useRef<HTMLParagraphElement>(null);
  const hoverTooltipRef = useRef<HTMLDivElement>(null);

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
  }, []);

  return (
    <div className="relative h-dvh w-full bg-black">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-zinc-400">
          Loading star catalog…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center px-4 text-center text-sm text-red-400">
          {error.message}
        </div>
      )}
      {data && data.count === 0 && !loading && !error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-sm text-zinc-400">
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
            style={{ position: "absolute", inset: 0 }}
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
                onStarClick={onStarClick}
                cameraHudRef={cameraHudRef}
                hoverTooltipRef={hoverTooltipRef}
                onHoverStarIndex={onHoverStarIndex}
              />
            </Suspense>
          </Canvas>
          {hoverTooltipText !== null && (
            <div
              className="pointer-events-none fixed inset-0 z-30 overflow-hidden"
              aria-hidden
            >
              <div
                ref={hoverTooltipRef}
                className="pointer-events-none absolute whitespace-nowrap rounded-md border border-zinc-500/80 bg-zinc-950/95 px-2 py-1 text-xs font-medium text-zinc-100 shadow-lg backdrop-blur-sm"
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
            <aside
              className="absolute top-32 right-4 z-20 w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-zinc-600/70 bg-zinc-950/95 p-4 shadow-xl backdrop-blur-sm"
              aria-label="Selected star"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold leading-snug text-zinc-100">
                  {selectedStar.name}
                </h2>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                  aria-label="Close star details"
                >
                  ✕
                </button>
              </div>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between gap-4 border-t border-zinc-800 pt-2">
                  <dt className="text-zinc-500">Distance from Sun</dt>
                  <dd className="tabular-nums text-zinc-200">
                    {formatDistanceLy(selectedStar.distanceLy)}
                  </dd>
                </div>
              </dl>
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
