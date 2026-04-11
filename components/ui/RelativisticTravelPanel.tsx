"use client";

import { useMemo } from "react";
import {
  computeJourney,
  type FlightMode,
  type RelativisticJourneyResult,
} from "@/lib/relativisticTravel";
import styles from "@/app/ui.module.css";

export type TravelCalculatorState = {
  mode: FlightMode;
  accelerationG: number;
  coastFractionPct: number;
  exhaustVelocityOverC: number;
  dryMassKg: number;
  showDilationVase: boolean;
  /** When true, scene uses radial ship proper-time (yr) instead of ly. */
  mapByShipProperTime: boolean;
};

const DEFAULT_TRAVEL_STATE: TravelCalculatorState = {
  mode: "brachistochrone",
  accelerationG: 1.5,
  coastFractionPct: 0,
  exhaustVelocityOverC: 1,
  dryMassKg: 100_000,
  showDilationVase: true,
  mapByShipProperTime: false,
};

export { DEFAULT_TRAVEL_STATE };

type Props = {
  distanceLy: number;
  value: TravelCalculatorState;
  onChange: (next: TravelCalculatorState) => void;
};

const G_PRESETS = [0.1, 0.3, 1, 1.5, 2, 4, 10] as const;

function formatDurationRough(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const y = seconds / (365.25 * 24 * 3600);
  if (y >= 1) {
    const whole = Math.floor(y);
    const mo = Math.round((y - whole) * 12);
    if (whole === 0) return `${mo} mo`;
    if (mo === 0) return `${whole} yr`;
    return `${whole} yr, ${mo} mo`;
  }
  const d = seconds / 86400;
  if (d >= 1) return `${d.toFixed(1)} d`;
  const h = seconds / 3600;
  if (h >= 1) return `${h.toFixed(1)} h`;
  const m = seconds / 60;
  return `${m.toFixed(1)} min`;
}

function formatMassKg(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return "—";
  if (kg >= 1e9) return `${(kg / 1e9).toFixed(2)} Gt`;
  if (kg >= 1e6) return `${(kg / 1e6).toFixed(2)} kt`;
  if (kg >= 1e3) return `${(kg / 1e3).toFixed(2)} t`;
  return `${kg.toFixed(0)} kg`;
}

function formatEnergyJ(j: number): string {
  if (!Number.isFinite(j) || j <= 0) return "—";
  if (j >= 1e24) return `${(j / 1e24).toFixed(1)} YJ`;
  if (j >= 1e21) return `${(j / 1e21).toFixed(1)} ZJ`;
  if (j >= 1e18) return `${(j / 1e18).toFixed(1)} EJ`;
  if (j >= 1e15) return `${(j / 1e15).toFixed(1)} PJ`;
  return `${j.toExponential(2)} J`;
}

function modeLabel(m: FlightMode): string {
  return m === "brachistochrone" ? "Brachistochrone (flip & decel)" : "Fly-by (no decel)";
}

export function RelativisticTravelPanel({ distanceLy, value, onChange }: Props) {
  const coastFrac = value.coastFractionPct / 100;

  const result = useMemo(() => {
    return computeJourney({
      distanceLy,
      mode: value.mode,
      accelerationG: value.accelerationG,
      coastFraction: coastFrac,
      exhaustVelocityOverC: value.exhaustVelocityOverC,
      dryMassKg: value.dryMassKg,
    });
  }, [
    distanceLy,
    value.mode,
    value.accelerationG,
    coastFrac,
    value.exhaustVelocityOverC,
    value.dryMassKg,
  ]);

  const ok = result.ok ? (result as RelativisticJourneyResult) : null;

  return (
    <div className={styles.travelPanel}>
      <h3 className={styles.travelHeading}>
        Relativistic travel
      </h3>

      <div className={styles.travelFieldStack}>
        <label className={styles.travelLabel}>Flight mode</label>
        <div className={styles.modeToggleGroup}>
          {(["brachistochrone", "flyby"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...value, mode: m })}
              className={
                value.mode === m ? styles.modeBtnActive : styles.modeBtnInactive
              }
            >
              {m === "brachistochrone" ? "Brachistochrone (flip & decel)" : "Fly-by (no decel)"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className={styles.sliderHeaderRow}>
          <span>Acceleration (g)</span>
          <span className={styles.sliderValue}>{value.accelerationG.toFixed(2)}g</span>
        </div>
        <input
          type="range"
          min={0.05}
          max={20}
          step={0.05}
          value={Math.min(20, Math.max(0.05, value.accelerationG))}
          onChange={(e) =>
            onChange({ ...value, accelerationG: Number.parseFloat(e.target.value) })
          }
          className={styles.rangeInput}
        />
        <div className={styles.presetRow}>
          {G_PRESETS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onChange({ ...value, accelerationG: g })}
              className={
                value.accelerationG === g
                  ? styles.presetBtnActive
                  : styles.presetBtnInactive
              }
            >
              {g}g
            </button>
          ))}
        </div>
      </div>

      {value.mode === "brachistochrone" && (
        <div>
          <div className={styles.sliderHeaderRowCoast}>
            <span>Coast (% of distance)</span>
            <span className={styles.sliderValue}>{value.coastFractionPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={99}
            step={1}
            value={value.coastFractionPct}
            onChange={(e) =>
              onChange({ ...value, coastFractionPct: Number.parseInt(e.target.value, 10) })
            }
            className={styles.rangeInputNoMb}
          />
        </div>
      )}

      <div>
        <label className={`${styles.travelLabel} ${styles.travelLabelInline}`}>
          Exhaust vₑ / c
        </label>
        <input
          type="range"
          min={0.01}
          max={1}
          step={0.01}
          value={value.exhaustVelocityOverC}
          onChange={(e) =>
            onChange({ ...value, exhaustVelocityOverC: Number.parseFloat(e.target.value) })
          }
          className={styles.rangeInputNoMb}
        />
        <div className={styles.exhaustValueRow}>
          {(value.exhaustVelocityOverC * 100).toFixed(0)}%
        </div>
      </div>

      <div>
        <label className={`${styles.travelLabel} ${styles.travelLabelInline}`}>Dry mass</label>
        <div className={styles.flexGap2}>
          <input
            type="number"
            min={1}
            step={100}
            value={Number.isFinite(value.dryMassKg) ? value.dryMassKg : 0}
            onChange={(e) =>
              onChange({ ...value, dryMassKg: Number.parseFloat(e.target.value) || 0 })
            }
            className={styles.numberField}
          /> Kg
        </div>
        <div className={styles.travelSmallNote}>
          {(value.dryMassKg / 1000).toFixed(1)} tons
        </div>
      </div>

      <div className={styles.travelFieldStack}>
        <label className={styles.travelLabel}>Dilation vase</label>
        <div className={styles.modeToggleGroup}>
          {([true, false] as const).map((show) => (
            <button
              key={show ? "show" : "hide"}
              type="button"
              onClick={() => onChange({ ...value, showDilationVase: show })}
              className={
                value.showDilationVase === show
                  ? styles.modeBtnActive
                  : styles.modeBtnInactive
              }
            >
              {show ? "Show" : "Hide"}
            </button>
          ))}
        </div>
      </div>

      {!result.ok && (
        <p className={styles.travelError}>
          {result.message}
        </p>
      )}

      {ok && (
        <div className={styles.travelResults}>
          <div style={{display: "flex", gap: "0.5rem", width: "100%", justifyContent: "space-between"}}>
            <div className={styles.resultCard}>
              <div className={styles.resultCardTitle}>Ship time</div>
              <p className={styles.resultPrimary}>{formatDurationRough(ok.shipTimeS)}</p>
            </div>
            <div className={styles.resultCard}>
              <div className={styles.resultCardTitle}>Earth time</div>
              <p className={styles.resultPrimary}>{formatDurationRough(ok.earthTimeS)}</p>
            </div>
          </div>
          <div className={styles.travelFieldStack}>
            <label className={styles.travelLabel}>3D map units</label>
            <div className={styles.modeToggleGroup}>
              <button
                type="button"
                onClick={() => onChange({ ...value, mapByShipProperTime: false })}
                className={
                  !value.mapByShipProperTime ? styles.modeBtnActive : styles.modeBtnInactive
                }
              >
                Light-years
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...value, mapByShipProperTime: true })}
                className={
                  value.mapByShipProperTime ? styles.modeBtnActive : styles.modeBtnInactive
                }
              >
                Ship years
              </button>
            </div>
          </div>
          <div style={{display: "flex", gap: "0.5rem", width: "100%", justifyContent: "space-between"}}>
            <div className={styles.resultCard}>
              <p className={styles.resultMuted}>
                Earth / ship ≈{" "}
                <span className={styles.resultMutedStrong}>
                  {ok.timeDilationRatio.toFixed(2)}×
                </span>
              </p>
              <ul className={styles.detailList}>
                <li>Peak v/c: {ok.peakBeta.toFixed(4)}</li>
                <li>
                  Peak γ:{" "}
                  <span className={styles.tabularNums}>{ok.peakGamma.toFixed(3)}</span>
                </li>
              </ul>
            </div>
          </div>
          <div style={{display: "flex", gap: "0.5rem", width: "100%", justifyContent: "space-between"}}>
            <div className={styles.resultCard}>
              <div className={styles.detailTitle}>Rocket mass ratio</div>
                <ul className={styles.detailList}>
                  <li>
                    Mass ratio (adj.):{" "}
                    <span className={styles.tabularNums}>{ok.massRatioAdjusted.toPrecision(4)}</span> : 1
                  </li>
                  <li>Launch mass: {formatMassKg(ok.launchMassKg)}</li>
                  <li>Fuel: {formatMassKg(ok.fuelMassKg)}</li>
                  <li>Energy (mc²): {formatEnergyJ(ok.fuelEnergyJ)}</li>
                </ul>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
