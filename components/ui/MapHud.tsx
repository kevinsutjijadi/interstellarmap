"use client";

import type { GridMode } from "@/components/canvas/InterstellarScene";

type Props = {
  gridMode: GridMode;
  onGridMode: (mode: GridMode) => void;
  showGrid: boolean;
  onShowGrid: (v: boolean) => void;
  showZLines: boolean;
  onShowZLines: (v: boolean) => void;
};

function ToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${
        on
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums opacity-70">{on ? "On" : "Off"}</span>
    </button>
  );
}

export function MapHud({
  gridMode,
  onGridMode,
  showGrid,
  onShowGrid,
  showZLines,
  onShowZLines,
}: Props) {
  return (
    <div className="absolute top-4 right-4 z-20 flex w-[200px] flex-col gap-2 rounded-lg border border-zinc-600/70 bg-zinc-950/90 p-2 shadow-lg backdrop-blur-sm">
      <div
        className="flex gap-0.5 rounded-md border border-zinc-700/80 bg-zinc-900/80 p-0.5"
        role="group"
        aria-label="Reference grid layout"
      >
        <button
          type="button"
          onClick={() => onGridMode("cartesian")}
          className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
            gridMode === "cartesian"
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
          }`}
        >
          Grid
        </button>
        <button
          type="button"
          onClick={() => onGridMode("radial")}
          className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
            gridMode === "radial"
              ? "bg-zinc-700 text-zinc-100"
              : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
          }`}
        >
          Radial
        </button>
      </div>

      <div className="flex flex-col gap-1 border-t border-zinc-800 pt-2" role="group" aria-label="Visibility">
        <ToggleRow
          label="Reference grid (ly)"
          on={showGrid}
          onToggle={() => onShowGrid(!showGrid)}
        />
        <ToggleRow
          label="Z drop lines"
          on={showZLines}
          onToggle={() => onShowZLines(!showZLines)}
        />
      </div>
    </div>
  );
}
