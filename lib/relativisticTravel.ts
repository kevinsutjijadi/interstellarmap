/** SI constants for constant proper-acceleration / relativistic rocket model (flat spacetime). */

export const SPEED_OF_LIGHT_M_S = 299_792_458;
export const LIGHT_YEAR_M = 9.460_730_472_580_8e15;
export const STANDARD_GRAVITY_M_S2 = 9.806_65;

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

  const a = g * STANDARD_GRAVITY_M_S2;
  const Dm = D * LIGHT_YEAR_M;

  let peakGamma: number;
  let peakBeta: number;
  let tauShipS: number;
  let earthTimeS: number;
  let massRatioRaw: number;
  let coastFracOut = 0;

  if (mode === "flyby") {
    peakGamma = gammaFromAccelDistance(a, Dm, c);
    peakBeta = betaFromGamma(peakGamma);
    const tau = (c / a) * Math.acosh(peakGamma);
    tauShipS = tau;
    earthTimeS = (c / a) * Math.sinh((a * tau) / c);
    massRatioRaw = rocketMassRatioOneWay(peakGamma, peakBeta);
  } else {
    const p = clampCoast(Number.isFinite(pRaw) ? pRaw : 0);
    coastFracOut = p;
    const L1m = ((1 - p) * Dm) / 2;
    const L2m = p * Dm;

    peakGamma = gammaFromAccelDistance(a, L1m, c);
    peakBeta = betaFromGamma(peakGamma);

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

    tauShipS = 2 * tauThrust + tauCoast;
    earthTimeS = 2 * tThrust + tCoast;

    const R = rocketMassRatioOneWay(peakGamma, peakBeta);
    massRatioRaw = R * R;
  }

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
