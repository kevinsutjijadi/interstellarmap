/** SI constants for constant proper-acceleration / relativistic rocket model (flat spacetime). */

export const SPEED_OF_LIGHT_M_S = 299_792_458;
export const LIGHT_YEAR_M = 9.460_730_472_580_8e15;
export const STANDARD_GRAVITY_M_S2 = 9.806_65;

/** Julian year in seconds (matches rough duration formatting in the travel panel). */
export const SECONDS_PER_YEAR = 365.25 * 24 * 3600;

export type FlightMode = "brachistochrone" | "flyby";

export type RelativisticJourneyInput = {
  /** Total lab distance, light-years */
  distanceLy: number;
  mode: FlightMode;
  /** Proper acceleration in g */
  accelerationG: number;
  /** Coast fraction of total distance [0, 1); brachistochrone only */
  coastFraction: number;
  /** Effective exhaust speed as fraction of c, (0, 1] */
  exhaustVelocityOverC: number;
  dryMassKg: number;
};

export type RelativisticJourneyResult = {
  ok: true;
  distanceLy: number;
  distanceM: number;
  mode: FlightMode;
  accelerationG: number;
  accelerationM_S2: number;
  coastFraction: number;
  peakGamma: number;
  peakBeta: number;
  peakVelocityOverC: number;
  /** Earth (lab) time / ship proper time for full journey */
  timeDilationRatio: number;
  shipTimeS: number;
  earthTimeS: number;
  massRatioRaw: number;
  massRatioAdjusted: number;
  launchMassKg: number;
  fuelMassKg: number;
  fuelEnergyJ: number;
};

export type RelativisticJourneyError = {
  ok: false;
  message: string;
};

export type RelativisticJourneyOutput = RelativisticJourneyResult | RelativisticJourneyError;

export type JourneyKinematicsParams = {
  distanceLy: number;
  mode: FlightMode;
  accelerationG: number;
  coastFraction: number;
};

function clampCoast(p: number): number {
  if (!Number.isFinite(p) || p < 0) return 0;
  if (p >= 1) return 1 - 1e-9;
  return p;
}

function gammaFromAccelDistance(a: number, xM: number, c: number): number {
  return 1 + (a * xM) / (c * c);
}

function betaFromGamma(gamma: number): number {
  if (gamma <= 1) return 0;
  const inv = 1 / (gamma * gamma);
  return Math.sqrt(Math.max(0, 1 - inv));
}

/**
 * Lorentz factor and v/c at cumulative lab distance `dLy` from start (Sun).
 * `dLy` in [0, distanceLy]. Uses same piecewise profile as computeJourney.
 */
export function gammaBetaAtDistanceAlongRoute(
  dLy: number,
  params: JourneyKinematicsParams,
): { gamma: number; beta: number } | null {
  const { distanceLy: D, mode, accelerationG: g, coastFraction: pRaw } = params;
  const c = SPEED_OF_LIGHT_M_S;
  if (!Number.isFinite(dLy) || !Number.isFinite(D) || D <= 0 || !Number.isFinite(g) || g <= 0) {
    return null;
  }
  const d = Math.min(Math.max(dLy, 0), D);
  const a = g * STANDARD_GRAVITY_M_S2;
  const Dm = D * LIGHT_YEAR_M;
  const dm = d * LIGHT_YEAR_M;

  if (mode === "flyby") {
    const gamma = gammaFromAccelDistance(a, dm, c);
    return { gamma, beta: betaFromGamma(gamma) };
  }

  const p = clampCoast(pRaw);
  const L1 = ((1 - p) * D) / 2;
  const L2 = p * D;
  const L1m = L1 * LIGHT_YEAR_M;

  if (d <= L1) {
    const gamma = gammaFromAccelDistance(a, dm, c);
    return { gamma, beta: betaFromGamma(gamma) };
  }
  if (d <= L1 + L2) {
    const gamma = gammaFromAccelDistance(a, L1m, c);
    return { gamma, beta: betaFromGamma(gamma) };
  }
  const gamma = gammaFromAccelDistance(a, Dm - dm, c);
  return { gamma, beta: betaFromGamma(gamma) };
}

function rocketMassRatioOneWay(gamma: number, beta: number): number {
  return gamma * (1 + beta);
}

type KinematicsOk = {
  peakGamma: number;
  peakBeta: number;
  tauShipS: number;
  earthTimeS: number;
  massRatioRaw: number;
  coastFraction: number;
};

function computeJourneyKinematicsCore(
  D: number,
  mode: FlightMode,
  g: number,
  pRaw: number,
): { ok: true; k: KinematicsOk } | { ok: false; message: string } {
  const c = SPEED_OF_LIGHT_M_S;
  if (!Number.isFinite(D) || D <= 0 || !Number.isFinite(g) || g <= 0) {
    return { ok: false, message: "Invalid distance or acceleration." };
  }
  const a = g * STANDARD_GRAVITY_M_S2;
  const Dm = D * LIGHT_YEAR_M;

  if (mode === "flyby") {
    const peakGamma = gammaFromAccelDistance(a, Dm, c);
    const peakBeta = betaFromGamma(peakGamma);
    const tau = (c / a) * Math.acosh(peakGamma);
    const earthTimeS = (c / a) * Math.sinh((a * tau) / c);
    const massRatioRaw = rocketMassRatioOneWay(peakGamma, peakBeta);
    return {
      ok: true,
      k: {
        peakGamma,
        peakBeta,
        tauShipS: tau,
        earthTimeS,
        massRatioRaw,
        coastFraction: 0,
      },
    };
  }

  const p = clampCoast(Number.isFinite(pRaw) ? pRaw : 0);
  const L1m = ((1 - p) * Dm) / 2;
  const L2m = p * Dm;

  const peakGamma = gammaFromAccelDistance(a, L1m, c);
  const peakBeta = betaFromGamma(peakGamma);

  if (p > 1 - 1e-12 && peakBeta < 1e-15) {
    return { ok: false, message: "Coast fraction too close to 100% with negligible speed." };
  }

  const tauThrust = (c / a) * Math.acosh(peakGamma);
  const tThrust = (c / a) * Math.sinh((a * tauThrust) / c);

  let tCoast = 0;
  let tauCoast = 0;
  if (L2m > 0) {
    if (peakBeta < 1e-15) {
      return { ok: false, message: "Cannot coast with zero speed at this coast fraction." };
    }
    tCoast = L2m / (peakBeta * c);
    tauCoast = tCoast / peakGamma;
  }

  const tauShipS = 2 * tauThrust + tauCoast;
  const earthTimeS = 2 * tThrust + tCoast;
  const R = rocketMassRatioOneWay(peakGamma, peakBeta);
  const massRatioRaw = R * R;

  return {
    ok: true,
    k: {
      peakGamma,
      peakBeta,
      tauShipS,
      earthTimeS,
      massRatioRaw,
      coastFraction: p,
    },
  };
}

/**
 * Ship proper time in seconds for the given lab distance and kinematic profile.
 * Returns null when the profile is invalid (same cases as computeJourney kinematics).
 */
export function shipProperTimeSeconds(
  distanceLy: number,
  params: JourneyKinematicsParams,
): number | null {
  const { mode, accelerationG: g, coastFraction: pRaw } = params;
  if (!Number.isFinite(distanceLy) || distanceLy <= 0) return null;
  const kin = computeJourneyKinematicsCore(distanceLy, mode, g, pRaw);
  return kin.ok ? kin.k.tauShipS : null;
}

export function shipProperTimeYears(
  distanceLy: number,
  params: JourneyKinematicsParams,
): number | null {
  const s = shipProperTimeSeconds(distanceLy, params);
  if (s === null) return null;
  return s / SECONDS_PER_YEAR;
}

/** Kinematic mode/g/coast without a fixed route length (distance is passed per call). */
export type JourneyKinematicsProfile = Omit<JourneyKinematicsParams, "distanceLy">;

/**
 * Invert monotone τ(d): find d ∈ [0, D] with τ(d) ≈ u · τ(D), u ∈ [0, 1].
 * Used for journey hover along the ship-time-mapped ray.
 */
export function distanceLyForFractionOfTotalShipTime(
  u: number,
  totalDistanceLy: number,
  profile: JourneyKinematicsProfile,
): number | null {
  if (!Number.isFinite(u) || !Number.isFinite(totalDistanceLy) || totalDistanceLy <= 0) {
    return null;
  }
  const clampedU = Math.min(1, Math.max(0, u));
  if (clampedU <= 0) return 0;
  const kinParamsFull = (d: number): JourneyKinematicsParams => ({
    ...profile,
    distanceLy: d,
  });
  const tauEnd = shipProperTimeSeconds(totalDistanceLy, kinParamsFull(totalDistanceLy));
  if (tauEnd === null || tauEnd <= 0) return null;
  const target = clampedU * tauEnd;
  if (target >= tauEnd) return totalDistanceLy;

  let lo = 0;
  let hi = totalDistanceLy;
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    const tMid = shipProperTimeSeconds(mid, kinParamsFull(mid));
    if (tMid === null) return null;
    if (tMid < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function computeJourney(input: RelativisticJourneyInput): RelativisticJourneyOutput {
  const c = SPEED_OF_LIGHT_M_S;
  const {
    distanceLy: D,
    mode,
    accelerationG: g,
    coastFraction: pRaw,
    exhaustVelocityOverC: eta,
    dryMassKg: mDry,
  } = input;

  if (!Number.isFinite(D) || D <= 0) {
    return { ok: false, message: "Distance must be positive." };
  }
  if (!Number.isFinite(g) || g <= 0) {
    return { ok: false, message: "Acceleration must be positive." };
  }
  if (!Number.isFinite(eta) || eta <= 0 || eta > 1) {
    return { ok: false, message: "Exhaust velocity (vₑ/c) must be in (0, 1]." };
  }
  if (!Number.isFinite(mDry) || mDry <= 0) {
    return { ok: false, message: "Dry mass must be positive." };
  }

  const kin = computeJourneyKinematicsCore(D, mode, g, pRaw);
  if (!kin.ok) {
    return { ok: false, message: kin.message };
  }

  const {
    peakGamma,
    peakBeta,
    tauShipS,
    earthTimeS,
    massRatioRaw,
    coastFraction: coastFracOut,
  } = kin.k;
  const a = g * STANDARD_GRAVITY_M_S2;
  const Dm = D * LIGHT_YEAR_M;

  const massRatioAdjusted = Math.pow(massRatioRaw, 1 / eta);
  const launchMassKg = mDry * massRatioAdjusted;
  const fuelMassKg = launchMassKg - mDry;
  const fuelEnergyJ = fuelMassKg * c * c;

  return {
    ok: true,
    distanceLy: D,
    distanceM: Dm,
    mode,
    accelerationG: g,
    accelerationM_S2: a,
    coastFraction: coastFracOut,
    peakGamma,
    peakBeta,
    peakVelocityOverC: peakBeta,
    timeDilationRatio: tauShipS > 0 ? earthTimeS / tauShipS : 1,
    shipTimeS: tauShipS,
    earthTimeS,
    massRatioRaw,
    massRatioAdjusted,
    launchMassKg,
    fuelMassKg,
    fuelEnergyJ,
  };
}
