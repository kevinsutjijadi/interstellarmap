/** World-space point on the Sun–star chord + kinematics; tooltip DOM lives outside Canvas. */
export type JourneyLineHoverPayload = {
  dLy: number;
  beta: number;
  gamma: number;
  /** Cumulative ship proper time from Sun to this point (Julian years). */
  tauShipYr: number;
  wx: number;
  wy: number;
  wz: number;
};
