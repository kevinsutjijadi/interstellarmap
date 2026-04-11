"use client";

import type { GridMode } from "@/components/canvas/InterstellarScene";
import { useCallback, useEffect, useId, useState } from "react";
import styles from "@/app/ui.module.css";

const WELCOME_DISMISSED_KEY = "interstellarmap-welcome-dismissed";

const LINKS = {
  youtube: "https://youtu.be/8FT-oz9aZU4?si=o6FwIbx7qgwSZNib",
  relativisticCalc: "https://www.overvieweffekt.com/tools/relativistic-travel-calculator",
  hyg: "https://www.astronexus.com/projects/hyg",
} as const;

type Props = {
  gridMode: GridMode;
  onGridMode: (mode: GridMode) => void;
  showGrid: boolean;
  onShowGrid: (v: boolean) => void;
  showZLines: boolean;
  onShowZLines: (v: boolean) => void;
  /** Scene grid ticks are ship proper-time years instead of ly. */
  mapShipYearsActive?: boolean;
  /** When true, stars are colored by turbo distance (ly or ship yr to match map). */
  starColorByDistance: boolean;
  onStarColorByDistance: (v: boolean) => void;
  /** Project onto XZ ground plane (y=0) keeping Sun distance and XZ azimuth. */
  flatMapXzPlane: boolean;
  onFlatMapXzPlane: (v: boolean) => void;
  /** Narrow viewports: when true, the control panel is hidden (About modal still mounts). */
  mobilePanelCollapsed?: boolean;
  /** Narrow viewports: collapse control inside the open panel. */
  onMobilePanelCollapse?: () => void;
  isMobileLayout?: boolean;
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
      className={on ? styles.toggleRowOn : styles.toggleRowOff}
    >
      <span>{label}</span>
      <span className={styles.toggleState}>{on ? "On" : "Off"}</span>
    </button>
  );
}

function AboutModal({
  open,
  onClose,
  titleId,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.modalDialog}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 id={titleId} className={styles.modalTitle}>
            Interstellar Map
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={styles.iconButton}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <section className={styles.modalSectionBorder}>
          <h3 className={styles.modalSectionTitle}>Description</h3>
          <p className={styles.modalText}>
            An interactive 3D star field using the HYG catalog: positions in light-years from the Sun, optional
            Cartesian or radial reference grids, and tools to explore distance and relativistic travel times.
          </p>
        </section>

        <section className={styles.modalSectionBorderTop}>
          <h3 className={styles.modalSectionTitle}>How to use</h3>
          <ul className={styles.modalList}>
            <li>Drag to orbit the camera; scroll or pinch to zoom.</li>
            <li>Use the top search to find a star by name; click a star to open details and the travel panel.</li>
            <li>Toggle grid mode and visibility from this HUD (bottom-left).</li>
            <li>With a star selected, adjust acceleration, flight mode, and coast fraction in the side panel.</li>
          </ul>
        </section>

        <section className={styles.modalSectionLast}>
          <h3 className={styles.modalSectionTitle}>Attribution &amp; links</h3>
          <p className={styles.modalText}>
            All functions and calculations are based on The Overview Effect's relativistic travel calculator. Star positions are from the HYG catalog, though filtered to only include stars with names. I made this just after watching Project Hail Mary; Can't sleep.
            <br/><br/>
            Amaze Amaze Amaze.
          </p>
          <ul className={styles.modalLinksList}>
            <li>
              <a
                href={LINKS.hyg}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkExternal}
              >
                HYG database (Astronomy Nexus)
              </a>
              <span className={styles.linkNote}>Star catalog source (CC BY-SA).</span>
            </li>
            <li>
              <a
                href={LINKS.relativisticCalc}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkExternal}
              >
                Relativistic rocket calculator
              </a>
              <span className={styles.linkNote}>Overview Effekt — related physics reference.</span>
            </li>
            <li>
              <a
                href={LINKS.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.linkExternal}
              >
                YouTube — Time Dilation Visualized
              </a>
            </li>
          </ul>
        </section>

        <section className={styles.modalSectionBorderTop}>
          <p className={styles.modalText}>
            Made by Kevin Sutjijadi © 2026
          </p>
        </section>
      </div>
    </div>
  );
}

export function MapHud({
  gridMode,
  onGridMode,
  showGrid,
  onShowGrid,
  showZLines,
  onShowZLines,
  mapShipYearsActive = false,
  starColorByDistance,
  onStarColorByDistance,
  flatMapXzPlane,
  onFlatMapXzPlane,
  mobilePanelCollapsed = false,
  onMobilePanelCollapse,
  isMobileLayout = false,
}: Props) {
  const aboutTitleId = useId();
  const [aboutOpen, setAboutOpen] = useState(false);

  const closeAbout = useCallback(() => {
    setAboutOpen(false);
    try {
      localStorage.setItem(WELCOME_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(WELCOME_DISMISSED_KEY) !== "1") {
        setAboutOpen(true);
      }
    } catch {
      setAboutOpen(true);
    }
  }, []);

  return (
    <>
      <AboutModal open={aboutOpen} onClose={closeAbout} titleId={aboutTitleId} />

      {!(isMobileLayout && mobilePanelCollapsed) && (
      <div
        id="interstellar-map-hud-panel"
        className={styles.hudPanel}
      >
        {isMobileLayout && onMobilePanelCollapse && (
          <button
            type="button"
            onClick={onMobilePanelCollapse}
            className={styles.hudMobilePanelCollapse}
            aria-expanded
            aria-label="Hide map controls"
          >
            ▼ Map controls
          </button>
        )}
        <div
          className={styles.hudSegmentGroup}
          role="group"
          aria-label="Reference grid layout"
        >
          <button
            type="button"
            onClick={() => onGridMode("cartesian")}
            className={
              gridMode === "cartesian"
                ? styles.hudSegmentBtnActive
                : styles.hudSegmentBtnInactive
            }
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => onGridMode("radial")}
            className={
              gridMode === "radial"
                ? styles.hudSegmentBtnActive
                : styles.hudSegmentBtnInactive
            }
          >
            Radial
          </button>
        </div>

        <div className={styles.hudVisibilityGroup} role="group" aria-label="Visibility">
          <ToggleRow
            label={mapShipYearsActive ? "Reference grid (ship yr)" : "Reference grid (ly)"}
            on={showGrid}
            onToggle={() => onShowGrid(!showGrid)}
          />
          <ToggleRow
            label="Z drop lines"
            on={showZLines}
            onToggle={() => onShowZLines(!showZLines)}
          />
          <ToggleRow
            label={
              starColorByDistance
                ? mapShipYearsActive
                  ? "Star color: turbo (ship yr)"
                  : "Star color: turbo (ly)"
                : "Star color: spectral (default)"
            }
            on={starColorByDistance}
            onToggle={() => onStarColorByDistance(!starColorByDistance)}
          />
          <ToggleRow
            label="Flat map (XZ)"
            on={flatMapXzPlane}
            onToggle={() => onFlatMapXzPlane(!flatMapXzPlane)}
          />
        </div>

        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className={styles.hudAboutBtn}
        >
          About &amp; help
        </button>
      </div>
      )}
    </>
  );
}
